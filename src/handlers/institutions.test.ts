import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InstitutionRecord } from "../lib/types";

const getInstitutionByPK = vi.fn();
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
  getInstitutionByPK: (...args: unknown[]) => getInstitutionByPK(...args),
  queryAllByStatus: (...args: unknown[]) => queryAllByStatus(...args),
}));

const { getInstitution, searchInstitutionsHandler, listInstitutions } = await import("./institutions");

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
  getInstitutionByPK.mockReset();
  queryAllByStatus.mockReset();
});

describe("getInstitution", () => {
  it("returns the record DynamoDB returns for the given id", async () => {
    const institution = makeInstitution({ id: "INST#123" });
    getInstitutionByPK.mockResolvedValueOnce(institution);

    expect(await getInstitution("INST#123")).toEqual(institution);
    expect(getInstitutionByPK).toHaveBeenCalledWith("INST#123");
  });

  it("returns null when no institution exists for the id", async () => {
    getInstitutionByPK.mockResolvedValueOnce(null);
    expect(await getInstitution("INST#nope")).toBeNull();
  });
});

describe("searchInstitutionsHandler", () => {
  it("returns an empty result for a blank query without touching DynamoDB", async () => {
    const result = await searchInstitutionsHandler("   ");
    expect(result).toEqual({ query: "   ", results: [], page: 1, pageSize: 25, total: 0 });
    expect(queryAllByStatus).not.toHaveBeenCalled();
  });

  it("fetches every status partition as fuzzy-search candidates (no bundled local seed to fall back to, unlike EduVerify's own web/lib/search.ts)", async () => {
    queryAllByStatus.mockResolvedValue([]);

    await searchInstitutionsHandler("cape");

    expect(queryAllByStatus).toHaveBeenCalledWith("REGISTERED");
    expect(queryAllByStatus).toHaveBeenCalledWith("PROVISIONALLY REGISTERED");
    expect(queryAllByStatus).toHaveBeenCalledWith("UNKNOWN");
  });

  it("includes the public-university/TVET status partitions, or a public university would be invisible to search despite being findable by id", async () => {
    queryAllByStatus.mockResolvedValue([]);

    await searchInstitutionsHandler("cape");

    expect(queryAllByStatus).toHaveBeenCalledWith("ESTABLISHED — HIGHER EDUCATION ACT");
    expect(queryAllByStatus).toHaveBeenCalledWith("ESTABLISHED — CONTINUING EDUCATION AND TRAINING ACT");
  });

  it("fuzzy-matches a lowercase, non-prefix query against the full candidate set", async () => {
    const uct = makeInstitution({ id: "uct", name: "University of Cape Town", institutionType: "Public University" });
    queryAllByStatus.mockImplementation((status: string) => Promise.resolve(status === "REGISTERED" ? [uct] : []));

    const result = await searchInstitutionsHandler("cape town");

    expect(result.results.some((r) => r.id === "uct")).toBe(true);
  });

  it("dedupes an institution that appears in more than one status partition", async () => {
    const uct = makeInstitution({ id: "uct", name: "University of Cape Town", institutionType: "Public University" });
    queryAllByStatus.mockResolvedValue([uct]);

    const result = await searchInstitutionsHandler("University of Cape Town");

    expect(result.results).toHaveLength(1);
    expect(result.results[0].id).toBe("uct");
  });

  it("applies filters after ranking", async () => {
    const gauteng = makeInstitution({ id: "g", name: "Gauteng College", province: "Gauteng" });
    queryAllByStatus.mockImplementation((status: string) => Promise.resolve(status === "REGISTERED" ? [gauteng] : []));

    const result = await searchInstitutionsHandler("College", { province: "Western Cape" });

    expect(result.results).toEqual([]);
  });

  it("defaults to page 1 of 25 and reports total across every ranked match", async () => {
    const institutions = Array.from({ length: 30 }, (_, i) =>
      makeInstitution({ id: `i${i}`, name: `Cape College ${i}` }),
    );
    queryAllByStatus.mockImplementation((status: string) => Promise.resolve(status === "REGISTERED" ? institutions : []));

    const result = await searchInstitutionsHandler("Cape College");

    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(25);
    expect(result.total).toBe(30);
    expect(result.results).toHaveLength(25);
  });

  it("returns the requested page of ranked results", async () => {
    const institutions = Array.from({ length: 30 }, (_, i) =>
      makeInstitution({ id: `i${i}`, name: `Cape College ${i}` }),
    );
    queryAllByStatus.mockImplementation((status: string) => Promise.resolve(status === "REGISTERED" ? institutions : []));

    const result = await searchInstitutionsHandler("Cape College", { page: 2, pageSize: 25 });

    expect(result.results).toHaveLength(5);
    expect(result.total).toBe(30);
  });
});

describe("listInstitutions", () => {
  it("defaults to the REGISTERED partition, page 1, pageSize 25", async () => {
    const institutions = Array.from({ length: 30 }, (_, i) => makeInstitution({ id: `i${i}`, name: `Institution ${i}` }));
    queryAllByStatus.mockResolvedValueOnce(institutions);

    const result = await listInstitutions();

    expect(queryAllByStatus).toHaveBeenCalledWith("REGISTERED");
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(25);
    expect(result.institutions).toHaveLength(25);
    expect(result.total).toBe(30);
  });

  it("returns a summary shape — no faculties_and_programmes, with a qualification count and faculty labels", async () => {
    const institution = makeInstitution({
      id: "i0",
      faculties_and_programmes: [
        { faculty: "Business", programmes: [{ qualId: 1, title: "Diploma", nqfLevelRaw: "6", subfield: "Business", originator: "x", framework: "HEQSF" }] },
      ],
    });
    queryAllByStatus.mockResolvedValueOnce([institution]);

    const result = await listInstitutions();

    expect(result.institutions[0]).not.toHaveProperty("faculties_and_programmes");
    expect(result.institutions[0]).toMatchObject({ id: "i0", qualificationCount: 1, facultyLabels: ["Business"] });
  });

  it("returns the second page correctly", async () => {
    const institutions = Array.from({ length: 30 }, (_, i) => makeInstitution({ id: `i${i}`, name: `Institution ${i}` }));
    queryAllByStatus.mockResolvedValueOnce(institutions);

    const result = await listInstitutions({ page: 2, pageSize: 25 });

    expect(result.institutions).toHaveLength(5);
    expect(result.institutions[0].id).toBe("i25");
  });

  it("filters by province before paginating", async () => {
    const institutions = [
      makeInstitution({ id: "g1", name: "G1", province: "Gauteng" }),
      makeInstitution({ id: "wc1", name: "WC1", province: "Western Cape" }),
    ];
    queryAllByStatus.mockResolvedValueOnce(institutions);

    const result = await listInstitutions({ province: "Gauteng" });

    expect(result.institutions.map((i) => i.id)).toEqual(["g1"]);
    expect(result.total).toBe(1);
  });

  it("uses a caller-specified status partition", async () => {
    queryAllByStatus.mockResolvedValueOnce([]);
    await listInstitutions({ status: "PROVISIONALLY REGISTERED" });
    expect(queryAllByStatus).toHaveBeenCalledWith("PROVISIONALLY REGISTERED");
  });

  it("status=ALL scans every partition and merges/dedupes, unlike the single-partition default", async () => {
    const registered = makeInstitution({ id: "r1", name: "R1" });
    const cancelled = makeInstitution({ id: "c1", name: "C1" });
    queryAllByStatus.mockImplementation((status: string) =>
      Promise.resolve(status === "REGISTERED" ? [registered] : status === "CANCELLED" ? [cancelled] : [])
    );

    const result = await listInstitutions({ status: "ALL", pageSize: 1000 });

    for (const partition of MOCK_STATUS_PARTITIONS) {
      expect(queryAllByStatus).toHaveBeenCalledWith(partition);
    }
    expect(result.institutions.map((i) => i.id).sort()).toEqual(["c1", "r1"]);
    expect(result.total).toBe(2);
  });

  it("status=ALL dedupes an institution that (incorrectly) appears in more than one partition", async () => {
    const dup = makeInstitution({ id: "dup", name: "Dup" });
    queryAllByStatus.mockImplementation((status: string) => Promise.resolve(status === "REGISTERED" ? [dup] : [dup]));

    const result = await listInstitutions({ status: "ALL", pageSize: 1000 });

    expect(result.institutions).toHaveLength(1);
  });
});
