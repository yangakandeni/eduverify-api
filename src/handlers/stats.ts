import { getAllInstitutionsCached } from "../lib/dynamodb";
import { getAllProgrammes } from "../lib/facultiesAndProgrammes";

export interface StatsResult {
  totalInstitutions: number;
  totalQualifications: number;
  totalProvinces: number;
}

/** GET /v1/stats — headline counts for a homepage-style summary strip. Scans every status
 * partition (the same status=ALL shape `listInstitutions`/`searchInstitutionsHandler` use)
 * rather than just REGISTERED, since "how many institutions/qualifications does EduVerify
 * know about" reads as a total-corpus count, not one filtered to a single register status.
 * `totalProvinces` counts only provinces normalizeProvince actually resolved (excludes
 * "Unknown"), so the number reflects real geographic coverage rather than a fixed constant. */
export async function getStats(): Promise<StatsResult> {
  const institutions = await getAllInstitutionsCached();

  const totalQualifications = institutions.reduce(
    (sum, institution) => sum + getAllProgrammes(institution).length,
    0,
  );
  const provinces = new Set(
    institutions.map((institution) => institution.province).filter((province) => province && province !== "Unknown"),
  );

  return {
    totalInstitutions: institutions.length,
    totalQualifications,
    totalProvinces: provinces.size,
  };
}
