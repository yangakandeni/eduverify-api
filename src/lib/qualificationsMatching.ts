import { cleanLegalName } from "./presentation";
import type { SaqaQualification } from "./types";

/** Normalizes an institution/originator name for matching only (not display):
 * reuses cleanLegalName's legal-suffix/parenthetical stripping, then further
 * collapses the superficial formatting noise seen between our institution
 * names and SAQA's Originator strings (a trailing province clause, hyphens
 * vs spaces, and inconsistent use of "the") into one comparable string. This
 * stays a deterministic exact-match-on-normalized-string, not fuzzy scoring. */
export function normalizeForMatch(name: string): string {
  return cleanLegalName(name)
    .split(",")[0]
    .replace(/-/g, " ")
    .replace(/\bthe\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Groups SAQA qualification rows by institution id, matching each row's
 * Originator against our recognized institution list on a normalized-exact
 * basis. Rows whose Originator matches no recognized institution (the
 * majority — most private institutions and all TVET colleges don't register
 * qualifications under their own name in SAQA) are dropped. */
export function matchQualificationsToInstitutions(
  institutions: Array<{ id: string; name: string }>,
  rows: SaqaQualification[],
): Map<string, SaqaQualification[]> {
  const idByNormalizedName = new Map<string, string>();
  for (const institution of institutions) {
    idByNormalizedName.set(normalizeForMatch(institution.name), institution.id);
  }

  const result = new Map<string, SaqaQualification[]>();
  for (const row of rows) {
    const institutionId = idByNormalizedName.get(normalizeForMatch(row.originator));
    if (!institutionId) continue;

    const existing = result.get(institutionId);
    if (existing) existing.push(row);
    else result.set(institutionId, [row]);
  }

  return result;
}
