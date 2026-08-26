import type { FacultyProgrammes, InstitutionRecord, InstitutionSummaryRecord, SaqaQualification } from "./types";

/** Groups already-matched SAQA rows by subfield ("faculty"), producing the shape baked into
 * institutions.json / public_universities.json / public_tvets.json. Deterministic ordering
 * (faculties alphabetically, programmes within a faculty by title then qualId) so re-running
 * the bake script against unchanged source data is a no-op diff. */
export function groupBySubfield(rows: SaqaQualification[]): FacultyProgrammes[] {
  const byFaculty = new Map<string, SaqaQualification[]>();
  for (const row of rows) {
    const existing = byFaculty.get(row.subfield);
    if (existing) existing.push(row);
    else byFaculty.set(row.subfield, [row]);
  }

  return [...byFaculty.entries()]
    .map(([faculty, programmes]) => ({
      faculty,
      programmes: [...programmes].sort((a, b) => a.title.localeCompare(b.title) || a.qualId - b.qualId),
    }))
    .sort((a, b) => a.faculty.localeCompare(b.faculty));
}

/** Flattens every programme across every faculty — the single place to read "all
 * qualifications for this institution" from (replaces the old free-text `qualifications`
 * field entirely). */
export function getAllProgrammes(
  institution: Pick<InstitutionRecord, "faculties_and_programmes">,
): SaqaQualification[] {
  return institution.faculties_and_programmes.flatMap((faculty) => faculty.programmes);
}

/** Faculty names an institution has matched qualifications in, sorted alphabetically —
 * the source of truth for card/modal pills. A faculty with zero matched programmes
 * (see FacultyProgrammes' baked-empty-array contract) is excluded. */
export function getFacultyLabels(
  institution: Pick<InstitutionRecord, "faculties_and_programmes">,
): string[] {
  return institution.faculties_and_programmes
    .filter((faculty) => faculty.programmes.length > 0)
    .map((faculty) => faculty.faculty)
    .sort((a, b) => a.localeCompare(b));
}

/** Drops the nested `faculties_and_programmes` detail in favor of a count and the faculty
 * names — see InstitutionSummaryRecord in types.ts for why (list/browse responses don't need
 * every SAQA-matched programme row, just enough to render a card). */
export function toInstitutionSummary(institution: InstitutionRecord): InstitutionSummaryRecord {
  const { faculties_and_programmes, ...rest } = institution;
  return {
    ...rest,
    qualificationCount: getAllProgrammes(institution).length,
    facultyLabels: getFacultyLabels(institution),
  };
}
