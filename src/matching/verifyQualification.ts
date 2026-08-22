import { getAllProgrammes } from "../lib/facultiesAndProgrammes";
import { queryByNamePrefix } from "../lib/dynamodb";
import { normalizeText } from "../lib/normalize";
import { matchesQualificationSearch } from "../lib/qualificationSearch";
import { searchInstitutions } from "../lib/search";
import type { InstitutionRecord, SaqaQualification } from "../lib/types";

export interface VerifyQualificationRequest {
  qualificationTitle: string;
  institutionName: string;
  /** Optional NQF sub-framework filter (HEQSF, OQSF, GFETQSF, SFAP, SFNA). Omitted by
   * default — unlike EduVerify's own product, this API is not HEQSF-only, since other
   * form-verification consumers need occupational and other qualification frameworks too. */
  framework?: string;
}

export interface VerifyQualificationResult {
  matched: boolean;
  confidence: "exact" | "fuzzy" | "none";
  institution?: InstitutionRecord;
  qualification?: SaqaQualification;
}

/** POST /v1/qualifications/verify — given a user-claimed (qualification title, institution
 * name) pair — e.g. a self-reported qualification on a signup or application form — finds the
 * institution and checks whether it actually offers that qualification. "Exact" means the
 * normalized titles are equal; "fuzzy" reuses the same typo/word-order/abbreviation tolerance
 * `qualificationSearch.ts` already provides for search-as-you-type, repurposed here as a
 * verification signal rather than a ranking one. */
export async function verifyQualification(request: VerifyQualificationRequest): Promise<VerifyQualificationResult> {
  const institutionName = request.institutionName.trim();
  const candidates = await queryByNamePrefix(institutionName);
  const [institution] = searchInstitutions(candidates, institutionName, {}, 1);
  if (!institution) return { matched: false, confidence: "none" };

  const programmes = getAllProgrammes(institution).filter(
    (programme) => !request.framework || programme.framework === request.framework,
  );

  const normalizedClaim = normalizeText(request.qualificationTitle);
  const exact = programmes.find((programme) => normalizeText(programme.title) === normalizedClaim);
  if (exact) return { matched: true, confidence: "exact", institution, qualification: exact };

  const fuzzy = programmes.find((programme) => matchesQualificationSearch(programme.title, request.qualificationTitle));
  if (fuzzy) return { matched: true, confidence: "fuzzy", institution, qualification: fuzzy };

  return { matched: false, confidence: "none", institution };
}
