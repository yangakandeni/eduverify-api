import { getAllInstitutionsCached, getInstitutionByRegistrationNumber } from "../lib/dynamodb";
import { normalizeText } from "../lib/normalize";
import { searchInstitutions } from "../lib/search";
import type { InstitutionRecord } from "../lib/types";

export interface VerifyInstitutionRequest {
  name?: string;
  registrationNumber?: string;
}

export interface VerifyInstitutionResult {
  matched: boolean;
  confidence: "exact" | "high" | "none";
  institution?: InstitutionRecord;
  status?: string;
}

/** POST /v1/institutions/verify — the form-verification use case: confirming that an institution
 * name or registration number a user typed or picked from autocomplete is real, with a
 * boolean-ish, high-confidence answer rather than a ranked list. A registration number that
 * resolves is always "exact" (it's a direct key lookup, no fuzziness possible); a name match is
 * "exact" only when it equals a candidate's name after normalization, "high" for anything else
 * `search.ts` ranked first — still a real institution, just not a verbatim name match
 * (extension campus, minor wording). */
export async function verifyInstitution(request: VerifyInstitutionRequest): Promise<VerifyInstitutionResult> {
  const registrationNumber = request.registrationNumber?.trim();
  if (registrationNumber) {
    const institution = await getInstitutionByRegistrationNumber(registrationNumber);
    if (institution) {
      return { matched: true, confidence: "exact", institution, status: institution.status ?? undefined };
    }
  }

  const name = request.name?.trim();
  if (name) {
    const candidates = (await getAllInstitutionsCached()).filter((institution) => institution.name.startsWith(name));
    const [best] = searchInstitutions(candidates, name, {}, 1);
    if (best) {
      const confidence = normalizeText(best.name) === normalizeText(name) ? "exact" : "high";
      return { matched: true, confidence, institution: best, status: best.status ?? undefined };
    }
  }

  return { matched: false, confidence: "none" };
}
