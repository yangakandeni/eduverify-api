import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InstitutionRecord } from "../lib/types";

const getInstitutionByPK = vi.fn();
const getAllInstitutionsCached = vi.fn();

vi.mock("../lib/dynamodb", () => ({
  getInstitutionByPK: (...args: unknown[]) => getInstitutionByPK(...args),
  getAllInstitutionsCached: (...args: unknown[]) => getAllInstitutionsCached(...args),
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
  getAllInstitutionsCached.mockReset();
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
    expect(getAllInstitutionsCached).not.toHaveBeenCalled();
  });

  it("uses the shared cached full-corpus candidate set (already merged across every status partition upstream) for a non-blank query", async () => {
    getAllInstitutionsCached.mockResolvedValueOnce([]);

    await searchInstitutionsHandler("cape");

    expect(getAllInstitutionsCached).toHaveBeenCalledTimes(1);
  });

  it("fuzzy-matches a lowercase, non-prefix query against the full cached candidate set", async () => {
    const uct = makeInstitution({ id: "uct", name: "University of Cape Town", institutionType: "Public University" });
    getAllInstitutionsCached.mockResolvedValueOnce([uct]);

    const result = await searchInstitutionsHandler("cape town");

    expect(result.results.some((r) => r.id === "uct")).toBe(true);
  });

  it("trusts the already-deduped candidate set getAllInstitutionsCached returns (dedupe now happens upstream in the cache, not here)", async () => {
    const uct = makeInstitution({ id: "uct", name: "University of Cape Town", institutionType: "Public University" });
    getAllInstitutionsCached.mockResolvedValueOnce([uct]);

    const result = await searchInstitutionsHandler("University of Cape Town");

    expect(result.results).toHaveLength(1);
    expect(result.results[0].id).toBe("uct");
  });

  it("applies filters after ranking", async () => {
    const gauteng = makeInstitution({ id: "g", name: "Gauteng College", province: "Gauteng" });
    getAllInstitutionsCached.mockResolvedValueOnce([gauteng]);

    const result = await searchInstitutionsHandler("College", { province: "Western Cape" });

    expect(result.results).toEqual([]);
  });

  it("defaults to page 1 of 25 and reports total across every ranked match", async () => {
    const institutions = Array.from({ length: 30 }, (_, i) =>
      makeInstitution({ id: `i${i}`, name: `Cape College ${i}` }),
    );
    getAllInstitutionsCached.mockResolvedValueOnce(institutions);

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
    getAllInstitutionsCached.mockResolvedValueOnce(institutions);

    const result = await searchInstitutionsHandler("Cape College", { page: 2, pageSize: 25 });

    expect(result.results).toHaveLength(5);
    expect(result.total).toBe(30);
  });
});

describe("listInstitutions", () => {
  it("defaults to the REGISTERED status, page 1, pageSize 25", async () => {
    const institutions = Array.from({ length: 30 }, (_, i) =>
      makeInstitution({ id: `i${i}`, name: `Institution ${i}`, status: "Registered" }),
    );
    getAllInstitutionsCached.mockResolvedValueOnce(institutions);

    const result = await listInstitutions();

    expect(getAllInstitutionsCached).toHaveBeenCalledTimes(1);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(25);
    expect(result.institutions).toHaveLength(25);
    expect(result.total).toBe(30);
  });

  it("filters out institutions not matching the requested status (case-insensitively)", async () => {
    const registered = makeInstitution({ id: "r1", name: "R1", status: "Registered" });
    const cancelled = makeInstitution({ id: "c1", name: "C1", status: "Cancelled" });
    getAllInstitutionsCached.mockResolvedValueOnce([registered, cancelled]);

    const result = await listInstitutions();

    expect(result.institutions.map((i) => i.id)).toEqual(["r1"]);
  });

  it("returns a summary shape — no faculties_and_programmes, with a qualification count and faculty labels", async () => {
    const institution = makeInstitution({
      id: "i0",
      status: "Registered",
      faculties_and_programmes: [
        { faculty: "Business", programmes: [{ qualId: 1, title: "Diploma", nqfLevelRaw: "6", subfield: "Business", originator: "x", framework: "HEQSF" }] },
      ],
    });
    getAllInstitutionsCached.mockResolvedValueOnce([institution]);

    const result = await listInstitutions();

    expect(result.institutions[0]).not.toHaveProperty("faculties_and_programmes");
    expect(result.institutions[0]).toMatchObject({ id: "i0", qualificationCount: 1, facultyLabels: ["Business"] });
  });

  it("returns the second page correctly", async () => {
    const institutions = Array.from({ length: 30 }, (_, i) =>
      makeInstitution({ id: `i${i}`, name: `Institution ${i}`, status: "Registered" }),
    );
    getAllInstitutionsCached.mockResolvedValueOnce(institutions);

    const result = await listInstitutions({ page: 2, pageSize: 25 });

    expect(result.institutions).toHaveLength(5);
    expect(result.institutions[0].id).toBe("i25");
  });

  it("filters by province before paginating", async () => {
    const institutions = [
      makeInstitution({ id: "g1", name: "G1", province: "Gauteng", status: "Registered" }),
      makeInstitution({ id: "wc1", name: "WC1", province: "Western Cape", status: "Registered" }),
    ];
    getAllInstitutionsCached.mockResolvedValueOnce(institutions);

    const result = await listInstitutions({ province: "Gauteng" });

    expect(result.institutions.map((i) => i.id)).toEqual(["g1"]);
    expect(result.total).toBe(1);
  });

  it("uses a caller-specified status filter over the shared cached candidate set", async () => {
    const provisional = makeInstitution({ id: "p1", name: "P1", status: "Provisionally Registered" });
    const registered = makeInstitution({ id: "r1", name: "R1", status: "Registered" });
    getAllInstitutionsCached.mockResolvedValueOnce([provisional, registered]);

    const result = await listInstitutions({ status: "PROVISIONALLY REGISTERED" });

    expect(getAllInstitutionsCached).toHaveBeenCalledTimes(1);
    expect(result.institutions.map((i) => i.id)).toEqual(["p1"]);
  });

  it("status=ALL returns every institution from the shared cache without status filtering", async () => {
    const registered = makeInstitution({ id: "r1", name: "R1", status: "Registered" });
    const cancelled = makeInstitution({ id: "c1", name: "C1", status: "Cancelled" });
    getAllInstitutionsCached.mockResolvedValueOnce([registered, cancelled]);

    const result = await listInstitutions({ status: "ALL", pageSize: 1000 });

    expect(getAllInstitutionsCached).toHaveBeenCalledTimes(1);
    expect(result.institutions.map((i) => i.id).sort()).toEqual(["c1", "r1"]);
    expect(result.total).toBe(2);
  });

  it("status=ALL trusts the already-deduped candidate set getAllInstitutionsCached returns", async () => {
    const dup = makeInstitution({ id: "dup", name: "Dup", status: "Registered" });
    getAllInstitutionsCached.mockResolvedValueOnce([dup]);

    const result = await listInstitutions({ status: "ALL", pageSize: 1000 });

    expect(result.institutions).toHaveLength(1);
  });

  it("fields=full returns full InstitutionRecords (with faculties_and_programmes) instead of the summary shape", async () => {
    const institution = makeInstitution({
      id: "i0",
      status: "Registered",
      faculties_and_programmes: [
        { faculty: "Business", programmes: [{ qualId: 1, title: "Diploma", nqfLevelRaw: "6", subfield: "Business", originator: "x", framework: "HEQSF" }] },
      ],
    });
    getAllInstitutionsCached.mockResolvedValueOnce([institution]);

    const result = await listInstitutions({ fields: "full" });

    expect(result.institutions[0]).toEqual(institution);
    expect(result.institutions[0]).not.toHaveProperty("qualificationCount");
    expect(result.institutions[0]).not.toHaveProperty("facultyLabels");
  });
});
