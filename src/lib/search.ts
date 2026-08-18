import { getAllProgrammes } from "./facultiesAndProgrammes";
import { CANONICAL_PROVINCES, normalizeRegistrationNumber, normalizeText } from "./normalize";
import { matchesQualificationSearch } from "./qualificationSearch";
import type { InstitutionRecord, SearchFilters } from "./types";

function matchesFilters(institution: InstitutionRecord, filters: SearchFilters): boolean {
  if (filters.province && institution.province !== filters.province) return false;
  if (filters.institutionType && institution.institutionType !== filters.institutionType) return false;
  return true;
}

const NORMALIZED_PROVINCES = CANONICAL_PROVINCES.map((province) => ({ province, normalized: normalizeText(province) }));

/** Query intent is "province" when it names (or is named by) a canonical province, e.g. "Western Cape". */
function matchProvinceQuery(q: string): string | undefined {
  const match = NORMALIZED_PROVINCES.find(
    ({ normalized }) => normalized === q || normalized.includes(q) || q.includes(normalized)
  );
  return match?.province;
}

/**
 * Fuzzy/partial ranking over a supplied candidate list. Ported from eduverify's
 * web/lib/search.ts, which ran this over a bundled local JSON seed as a DynamoDB fallback —
 * here there is no bundled seed at all, so the candidate list is always passed in by the
 * caller (a handler that's already fetched name-prefix/registration-number hits from
 * DynamoDB, or a full scan/cache for typeahead-style breadth). This function only ranks;
 * it does not fetch.
 *
 * Supports four search intents, ranked so a strong institution-name match always wins
 * over a qualification or province match (e.g. "Cape College" surfaces Cape Audio College
 * ahead of every other Western-Cape institution that merely offers "Cape"-titled courses):
 *   - Institution name / registration number / common abbreviation (score 40-100)
 *   - Qualification title, e.g. "Computer Science" (score 20-38, scaled by match count)
 *   - Province name, e.g. "Western Cape" (score 15)
 */
export function searchInstitutions(
  institutions: InstitutionRecord[],
  query: string,
  filters: SearchFilters = {},
  limit = 24,
): InstitutionRecord[] {
  const q = normalizeText(query);
  const qReg = normalizeRegistrationNumber(query);
  if (!q) return [];

  const qProvince = q.length >= 4 ? matchProvinceQuery(q) : undefined;

  const scored: Array<{ institution: InstitutionRecord; score: number }> = [];

  for (const institution of institutions) {
    if (!matchesFilters(institution, filters)) continue;

    const name = normalizeText(institution.name);
    const abbreviation = institution.abbreviation ? normalizeText(institution.abbreviation) : "";
    const reg = institution.registration_number
      ? normalizeRegistrationNumber(institution.registration_number)
      : "";

    let score = 0;
    if (reg && reg === qReg) score = 100;
    else if (abbreviation && abbreviation === q) score = 95;
    else if (name === q) score = 90;
    else if (reg && qReg.length >= 3 && reg.includes(qReg)) score = 80;
    else if (name.startsWith(q)) score = 70;
    else if (abbreviation && q.length >= 2 && abbreviation.startsWith(q)) score = 65;
    else if (name.split(" ").some((word) => word.startsWith(q))) score = 55;
    else if (q.length >= 3 && name.includes(q)) score = 40;

    if (score === 0 && q.length >= 2) {
      const qualMatches = getAllProgrammes(institution).filter((qualification) =>
        matchesQualificationSearch(qualification.title, query)
      ).length;
      if (qualMatches > 0) score = Math.min(38, 20 + qualMatches * 3);
    }

    if (score === 0 && qProvince && institution.province === qProvince) {
      score = 15;
    }

    if (score > 0) scored.push({ institution, score });
  }

  scored.sort((a, b) => b.score - a.score || a.institution.name.localeCompare(b.institution.name));
  return scored.slice(0, limit).map((entry) => entry.institution);
}
