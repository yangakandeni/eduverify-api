import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InstitutionRecord } from "../lib/types";

const queryAllByStatus = vi.fn();

const MOCK_STATUS_PARTITIONS = [
  "REGISTERED",
  "PROVISIONALLY REGISTERED",
  "UNKNOWN",
  "ESTABLISHED — HIGHER EDUCATION ACT",
  "ESTABLISHED — CONTINUING EDUCATION AND TRAINING ACT",
  "CANCELLED",
  "DISCONTINUED",
  "BOGUS",
];

vi.mock("../lib/dynamodb", () => ({
  STATUS_PARTITIONS: MOCK_STATUS_PARTITIONS,
  queryAllByStatus: (...args: unknown[]) => queryAllByStatus(...args),
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
  queryAllByStatus.mockReset();
});

describe("getStats", () => {
  it("scans every status partition, not just REGISTERED", async () => {
    queryAllByStatus.mockResolvedValue([]);

    await getStats();

    for (const partition of MOCK_STATUS_PARTITIONS) {
      expect(queryAllByStatus).toHaveBeenCalledWith(partition);
    }
  });

  it("counts every institution across partitions, deduped by id", async () => {
    const registered = makeInstitution({ id: "r1", name: "R1" });
    const cancelled = makeInstitution({ id: "c1", name: "C1" });
    const dup = makeInstitution({ id: "r1", name: "R1 again" });
    queryAllByStatus.mockImplementation((status: string) =>
      Promise.resolve(
        status === "REGISTERED" ? [registered, dup] : status === "CANCELLED" ? [cancelled] : [],
      ),
    );

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
    queryAllByStatus.mockImplementation((status: string) => Promise.resolve(status === "REGISTERED" ? [withQuals] : []));

    const result = await getStats();

    expect(result.totalQualifications).toBe(3);
  });

  it("counts distinct resolved provinces, excluding Unknown", async () => {
    const gauteng1 = makeInstitution({ id: "g1", province: "Gauteng" });
    const gauteng2 = makeInstitution({ id: "g2", province: "Gauteng" });
    const westernCape = makeInstitution({ id: "wc1", province: "Western Cape" });
    const unresolved = makeInstitution({ id: "u1", province: "Unknown" });
    queryAllByStatus.mockImplementation((status: string) =>
      Promise.resolve(status === "REGISTERED" ? [gauteng1, gauteng2, westernCape, unresolved] : []),
    );

    const result = await getStats();

    expect(result.totalProvinces).toBe(2);
  });

  it("returns zero counts when the table has no institutions", async () => {
    queryAllByStatus.mockResolvedValue([]);

    const result = await getStats();

    expect(result).toEqual({ totalInstitutions: 0, totalQualifications: 0, totalProvinces: 0 });
  });
});
