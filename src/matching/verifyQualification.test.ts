import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InstitutionRecord } from "../lib/types";

const getAllInstitutionsCached = vi.fn();

vi.mock("../lib/dynamodb", () => ({
  getAllInstitutionsCached: (...args: unknown[]) => getAllInstitutionsCached(...args),
}));

const { verifyQualification } = await import("./verifyQualification");

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

describe("verifyQualification", () => {
  it("reports exact confidence when the claimed title exactly matches a programme title", async () => {
    const institution = makeInstitution({
      id: "stellenbosch",
      name: "Stellenbosch University",
      faculties_and_programmes: [
        {
          faculty: "Arts",
          programmes: [
            { qualId: 1, title: "Bachelor of Arts in Theatre", nqfLevelRaw: "NQF Level 07", subfield: "Arts", originator: "Stellenbosch University", framework: "HEQSF" },
          ],
        },
      ],
    });
    getAllInstitutionsCached.mockResolvedValueOnce([institution]);

    const result = await verifyQualification({
      qualificationTitle: "Bachelor of Arts in Theatre",
      institutionName: "Stellenbosch University",
    });

    expect(result.matched).toBe(true);
    expect(result.confidence).toBe("exact");
    expect(result.qualification?.qualId).toBe(1);
    expect(result.institution?.id).toBe("stellenbosch");
  });

  it("reports fuzzy confidence for a typo'd or reworded claimed title", async () => {
    const institution = makeInstitution({
      id: "akademia",
      name: "Akademia NPC",
      faculties_and_programmes: [
        {
          faculty: "Science",
          programmes: [
            { qualId: 11, title: "Bachelor of Science in Computer Science", nqfLevelRaw: "NQF Level 07", subfield: "Science", originator: "", framework: "HEQSF" },
          ],
        },
      ],
    });
    getAllInstitutionsCached.mockResolvedValueOnce([institution]);

    const result = await verifyQualification({
      qualificationTitle: "compter scince computer",
      institutionName: "Akademia",
    });

    expect(result.matched).toBe(true);
    expect(result.confidence).toBe("fuzzy");
    expect(result.qualification?.qualId).toBe(11);
  });

  it("does not match a qualification the institution doesn't actually offer", async () => {
    const institution = makeInstitution({
      id: "akademia",
      name: "Akademia NPC",
      faculties_and_programmes: [
        {
          faculty: "Science",
          programmes: [
            { qualId: 11, title: "Bachelor of Science in Computer Science", nqfLevelRaw: "", subfield: "Science", originator: "", framework: "HEQSF" },
          ],
        },
      ],
    });
    getAllInstitutionsCached.mockResolvedValueOnce([institution]);

    const result = await verifyQualification({
      qualificationTitle: "Bachelor of Laws",
      institutionName: "Akademia",
    });

    expect(result.matched).toBe(false);
    expect(result.confidence).toBe("none");
    expect(result.institution?.id).toBe("akademia");
  });

  it("reports no match at all when the institution itself can't be found", async () => {
    getAllInstitutionsCached.mockResolvedValueOnce([]);

    const result = await verifyQualification({
      qualificationTitle: "Bachelor of Arts",
      institutionName: "Nonexistent College",
    });

    expect(result).toEqual({ matched: false, confidence: "none" });
  });

  it("is not restricted to HEQSF by default — matches an OQSF programme too", async () => {
    const institution = makeInstitution({
      id: "training-provider",
      name: "Some Training Provider",
      faculties_and_programmes: [
        {
          faculty: "Undefined",
          programmes: [
            { qualId: 55555, title: "Some Occupational Qualification", nqfLevelRaw: "NQF Level 04", subfield: "Undefined", originator: "Some Training Provider", framework: "OQSF" },
          ],
        },
      ],
    });
    getAllInstitutionsCached.mockResolvedValueOnce([institution]);

    const result = await verifyQualification({
      qualificationTitle: "Some Occupational Qualification",
      institutionName: "Some Training Provider",
    });

    expect(result.matched).toBe(true);
    expect(result.qualification?.framework).toBe("OQSF");
  });

  it("filters to a specific framework when one is requested, ignoring matches outside it", async () => {
    const institution = makeInstitution({
      id: "training-provider",
      name: "Some Training Provider",
      faculties_and_programmes: [
        {
          faculty: "Undefined",
          programmes: [
            { qualId: 55555, title: "Some Occupational Qualification", nqfLevelRaw: "", subfield: "Undefined", originator: "", framework: "OQSF" },
          ],
        },
      ],
    });
    getAllInstitutionsCached.mockResolvedValueOnce([institution]);

    const result = await verifyQualification({
      qualificationTitle: "Some Occupational Qualification",
      institutionName: "Some Training Provider",
      framework: "HEQSF",
    });

    expect(result.matched).toBe(false);
  });
});
