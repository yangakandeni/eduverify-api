import { STATUS_PARTITIONS, getInstitutionByPK, queryAllByStatus } from "../lib/dynamodb";
import { toInstitutionSummary } from "../lib/facultiesAndProgrammes";
import { searchInstitutions } from "../lib/search";
import type { InstitutionRecord, InstitutionSummaryRecord, SearchFilters } from "../lib/types";

export function dedupeById(institutions: InstitutionRecord[]): InstitutionRecord[] {
  const seen = new Map<string, InstitutionRecord>();
  for (const institution of institutions) {
    if (!seen.has(institution.id)) seen.set(institution.id, institution);
  }
  return [...seen.values()];
}

export async function getInstitution(id: string): Promise<InstitutionRecord | null> {
  return getInstitutionByPK(id);
}

export interface SearchParams extends SearchFilters {
  page?: number;
  pageSize?: number;
}

export interface SearchResult {
  query: string;
  results: InstitutionRecord[];
  page: number;
  pageSize: number;
  total: number;
}

/** GET /v1/institutions/search. Fetches every status partition in full and fuzzy-ranks the
 * whole set with `search.ts`'s scoring — the same "scan everything, then rank" shape as
 * EduVerify's own web/lib/search.ts, just backed by DynamoDB instead of a bundled local array,
 * since this repo has no bundled seed to fall back to. An earlier version queried only exact
 * registration-number and name-prefix hits (GSI1SK's begins_with is exact-prefix and
 * case-sensitive), which meant lowercase or non-prefix queries — e.g. "cape town" — returned
 * nothing: fine at this data's current scale (a few hundred institutions per partition, same
 * scale `listInstitutions` already fetches in full); revisit if that stops being true.
 * Paginated like `listInstitutions` (default page 1, pageSize 25) — `total` is the full ranked
 * match count, not just the returned page, so `search.ts`'s default limit is overridden with
 * the full candidate count and pagination is applied here instead. */
export async function searchInstitutionsHandler(query: string, params: SearchParams = {}): Promise<SearchResult> {
  const trimmed = query.trim();
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 25;
  if (!trimmed) return { query, results: [], page, pageSize, total: 0 };

  const partitions = await Promise.all(STATUS_PARTITIONS.map((status) => queryAllByStatus(status)));
  const candidates = dedupeById(partitions.flat());

  const ranked = searchInstitutions(candidates, trimmed, params, candidates.length);
  const start = (page - 1) * pageSize;
  return { query, results: ranked.slice(start, start + pageSize), page, pageSize, total: ranked.length };
}

export interface ListParams {
  page?: number;
  pageSize?: number;
  province?: string;
  institutionType?: InstitutionRecord["institutionType"];
  status?: string;
}

export interface ListResult {
  institutions: InstitutionSummaryRecord[];
  page: number;
  pageSize: number;
  total: number;
}

/** GET /v1/institutions/list — the paginated browse/collections source EduVerify's homepage
 * needs (it used to read an entire bundled local array; there is no such array here). Fetches
 * a full GSI1 status partition (see queryAllByStatus) then filters/paginates in memory — fine
 * at this data's current scale, not designed to survive an order-of-magnitude data growth.
 * `status=ALL` scans every partition instead (EduVerify's own homepage needs literally every
 * institution regardless of status, the same "no permanent local fallback" cutover as search —
 * see searchInstitutionsHandler); the default single-partition behavior is unchanged for every
 * other caller. Returns `InstitutionSummaryRecord`s rather than full records — a browse card
 * doesn't need every SAQA-matched programme row for every institution on the page, just a
 * qualification count and faculty labels (see toInstitutionSummary); fetch a single institution
 * by id for the full faculties_and_programmes detail. */
export async function listInstitutions(params: ListParams = {}): Promise<ListResult> {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 25;
  const status = (params.status ?? "REGISTERED").toUpperCase();

  const all =
    status === "ALL"
      ? dedupeById((await Promise.all(STATUS_PARTITIONS.map((partition) => queryAllByStatus(partition)))).flat())
      : await queryAllByStatus(status);
  const filtered = all.filter((institution) => {
    if (params.province && institution.province !== params.province) return false;
    if (params.institutionType && institution.institutionType !== params.institutionType) return false;
    return true;
  });

  const start = (page - 1) * pageSize;
  return {
    institutions: filtered.slice(start, start + pageSize).map(toInstitutionSummary),
    page,
    pageSize,
    total: filtered.length,
  };
}
