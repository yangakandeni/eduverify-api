import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InstitutionRecord } from "../lib/types";

const getAllInstitutionsCached = vi.fn();

vi.mock("../lib/dynamodb", () => ({
  getAllInstitutionsCached: (...args: unknown[]) => getAllInstitutionsCached(...args),
}));

const { getStats } = await import("./stats");

function makeInstitution(overrides: Partial<InstitutionRecord> = {}): InstitutionRecord {
  return {
    id: overrides.name ?? "id",
    name: "Test Institution",
    address: "",
    contacts: { email: [], phone: [] },
    faculties_and_programmes: [],
    institutionType: "Private Higher Education Institution",
    ...overrides,
  };
}

beforeEach(() => {
  getAllInstitutionsCached.mockReset();
});

describe("getStats", () => {
  it("uses the shared cached full-corpus candidate set (already merged across every status partition upstream)", async () => {
    getAllInstitutionsCached.mockResolvedValueOnce([]);

    await getStats();

    expect(getAllInstitutionsCached).toHaveBeenCalledTimes(1);
  });

  it("counts every institution in the cached candidate set", async () => {
    const registered = makeInstitution({ id: "r1", name: "R1" });
    const cancelled = makeInstitution({ id: "c1", name: "C1" });
    getAllInstitutionsCached.mockResolvedValueOnce([registered, cancelled]);

    const result = await getStats();

    expect(result.totalInstitutions).toBe(2);
  });

  it("counts qualifications across every faculty of every institution", async () => {
    const withQuals = makeInstitution({
      id: "q1",
      faculties_and_programmes: [
        {
          faculty: "Science",
          programmes: [
            { qualId: 1, title: "BSc", nqfLevelRaw: "7", subfield: "x", originator: "x", framework: "HEQSF" },
            { qualId: 2, title: "MSc", nqfLevelRaw: "9", subfield: "x", originator: "x", framework: "HEQSF" },
          ],
        },
        {
          faculty: "Arts",
          programmes: [
            { qualId: 3, title: "BA", nqfLevelRaw: "7", subfield: "y", originator: "y", framework: "HEQSF" },
          ],
        },
      ],
    });
    getAllInstitutionsCached.mockResolvedValueOnce([withQuals]);

    const result = await getStats();

    expect(result.totalQualifications).toBe(3);
  });

  it("counts distinct resolved provinces, excluding Unknown", async () => {
    const gauteng1 = makeInstitution({ id: "g1", province: "Gauteng" });
    const gauteng2 = makeInstitution({ id: "g2", province: "Gauteng" });
    const westernCape = makeInstitution({ id: "wc1", province: "Western Cape" });
    const unresolved = makeInstitution({ id: "u1", province: "Unknown" });
    getAllInstitutionsCached.mockResolvedValueOnce([gauteng1, gauteng2, westernCape, unresolved]);

    const result = await getStats();

    expect(result.totalProvinces).toBe(2);
  });

  it("returns zero counts when the table has no institutions", async () => {
    getAllInstitutionsCached.mockResolvedValueOnce([]);

    const result = await getStats();

    expect(result).toEqual({ totalInstitutions: 0, totalQualifications: 0, totalProvinces: 0 });
  });
});
