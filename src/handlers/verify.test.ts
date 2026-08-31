import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InstitutionRecord } from "../lib/types";

const getInstitutionByRegistrationNumber = vi.fn();
const getAllInstitutionsCached = vi.fn();

vi.mock("../lib/dynamodb", () => ({
  getInstitutionByRegistrationNumber: (...args: unknown[]) => getInstitutionByRegistrationNumber(...args),
  getAllInstitutionsCached: (...args: unknown[]) => getAllInstitutionsCached(...args),
}));

const { verifyInstitution } = await import("./verify");

function makeInstitution(overrides: Partial<InstitutionRecord> = {}): InstitutionRecord {
  return {
    id: overrides.name ?? "id",
    name: "Test Institution",
    address: "",
    contacts: { email: [], phone: [] },
    faculties_and_programmes: [],
    institutionType: "Private Higher Education Institution",
    status: "Registered",
    ...overrides,
  };
}

beforeEach(() => {
  getInstitutionByRegistrationNumber.mockReset();
  getAllInstitutionsCached.mockReset();
});

describe("verifyInstitution", () => {
  it("returns an exact match when the registration number resolves directly", async () => {
    const institution = makeInstitution({ id: "a", name: "AAA School", registration_number: "2000/HE07/015" });
    getInstitutionByRegistrationNumber.mockResolvedValueOnce(institution);

    const result = await verifyInstitution({ registrationNumber: "2000/HE07/015" });

    expect(result).toEqual({ matched: true, confidence: "exact", institution, status: "Registered" });
    expect(getAllInstitutionsCached).not.toHaveBeenCalled();
  });

  it("falls back to name lookup when the registration number doesn't resolve", async () => {
    getInstitutionByRegistrationNumber.mockResolvedValueOnce(null);
    const institution = makeInstitution({ id: "a", name: "AAA School" });
    getAllInstitutionsCached.mockResolvedValueOnce([institution]);

    const result = await verifyInstitution({ registrationNumber: "9999/HE07/999", name: "AAA School" });

    expect(result.matched).toBe(true);
    expect(result.institution?.id).toBe("a");
  });

  it("reports exact confidence when the name matches a candidate exactly", async () => {
    const institution = makeInstitution({ id: "a", name: "University of Cape Town", institutionType: "Public University" });
    getAllInstitutionsCached.mockResolvedValueOnce([institution]);

    const result = await verifyInstitution({ name: "University of Cape Town" });

    expect(result).toEqual({ matched: true, confidence: "exact", institution, status: "Registered" });
  });

  it("reports high confidence for a strong but non-exact name match", async () => {
    const institution = makeInstitution({ id: "a", name: "University of Cape Town Extension Campus" });
    getAllInstitutionsCached.mockResolvedValueOnce([institution]);

    const result = await verifyInstitution({ name: "University of Cape Town" });

    expect(result.matched).toBe(true);
    expect(result.confidence).toBe("high");
  });

  it("reports no match when nothing resolves", async () => {
    getInstitutionByRegistrationNumber.mockResolvedValueOnce(null);
    getAllInstitutionsCached.mockResolvedValueOnce([]);

    const result = await verifyInstitution({ registrationNumber: "0000/HE07/000", name: "Nonexistent College" });

    expect(result).toEqual({ matched: false, confidence: "none" });
  });

  it("reports no match for an empty request", async () => {
    const result = await verifyInstitution({});
    expect(result).toEqual({ matched: false, confidence: "none" });
    expect(getInstitutionByRegistrationNumber).not.toHaveBeenCalled();
    expect(getAllInstitutionsCached).not.toHaveBeenCalled();
  });
});
