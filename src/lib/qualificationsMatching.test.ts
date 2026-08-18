import { describe, expect, it } from "vitest";
import { matchQualificationsToInstitutions, normalizeForMatch } from "./qualificationsMatching";
import type { InstitutionRecord, SaqaQualification } from "./types";

describe("normalizeForMatch", () => {
  it("lowercases and collapses whitespace", () => {
    expect(normalizeForMatch("Stellenbosch University")).toBe("stellenbosch university");
  });

  it("drops a trailing comma-clause", () => {
    expect(normalizeForMatch("Central University of Technology, Free State")).toBe(
      normalizeForMatch("Central University of Technology"),
    );
  });

  it("treats hyphens as spaces", () => {
    expect(normalizeForMatch("North-West University")).toBe(normalizeForMatch("North West University"));
  });

  it("drops standalone 'the' anywhere in the name", () => {
    expect(normalizeForMatch("University of the Witwatersrand")).toBe(normalizeForMatch("University of Witwatersrand"));
  });

  it("strips legal-entity suffixes and trailing acronym brackets via cleanLegalName", () => {
    expect(normalizeForMatch("Tshwane University of Technology (TUT)")).toBe(
      normalizeForMatch("Tshwane University of Technology"),
    );
    expect(normalizeForMatch("Academic Institute of Excellence (Pty) Ltd")).toBe(
      normalizeForMatch("Academic Institute of Excellence"),
    );
  });
});

function makeInstitution(overrides: Partial<InstitutionRecord> = {}): InstitutionRecord {
  return {
    id: "stellenbosch",
    name: "Stellenbosch University",
    address: "",
    institutionType: "Public University",
    faculties_and_programmes: [],
    contacts: { email: [], phone: [] },
    ...overrides,
  };
}

function makeQualification(overrides: Partial<SaqaQualification> = {}): SaqaQualification {
  return {
    qualId: 1,
    title: "Bachelor of Arts",
    nqfLevelRaw: "NQF Level 07",
    nqfLevel: 7,
    subfield: "Visual Arts",
    originator: "Stellenbosch University",
    framework: "HEQSF",
    ...overrides,
  };
}

describe("matchQualificationsToInstitutions", () => {
  it("groups qualifications under the institution id when the originator matches exactly", () => {
    const institutions = [makeInstitution()];
    const rows = [makeQualification()];

    const result = matchQualificationsToInstitutions(institutions, rows);

    expect(result.get("stellenbosch")).toEqual(rows);
  });

  it("matches despite formatting differences (hyphen, missing 'the', trailing acronym)", () => {
    const institutions = [
      makeInstitution({ id: "nwu", name: "North-West University" }),
      makeInstitution({ id: "wits", name: "University of the Witwatersrand" }),
      makeInstitution({ id: "tut", name: "Tshwane University of Technology" }),
    ];
    const rows = [
      makeQualification({ qualId: 1, originator: "North West University" }),
      makeQualification({ qualId: 2, originator: "University of Witwatersrand" }),
      makeQualification({ qualId: 3, originator: "Tshwane University of Technology (TUT)" }),
    ];

    const result = matchQualificationsToInstitutions(institutions, rows);

    expect(result.get("nwu")?.map((q) => q.qualId)).toEqual([1]);
    expect(result.get("wits")?.map((q) => q.qualId)).toEqual([2]);
    expect(result.get("tut")?.map((q) => q.qualId)).toEqual([3]);
  });

  it("drops rows whose originator matches no recognized institution", () => {
    const institutions = [makeInstitution()];
    const rows = [makeQualification({ originator: "Some Unrelated Training Provider" })];

    const result = matchQualificationsToInstitutions(institutions, rows);

    expect(result.get("stellenbosch")).toBeUndefined();
  });

  it("does not create an entry for an institution with no matching qualifications", () => {
    const institutions = [makeInstitution(), makeInstitution({ id: "other", name: "Other College" })];
    const rows = [makeQualification()];

    const result = matchQualificationsToInstitutions(institutions, rows);

    expect(result.has("other")).toBe(false);
  });
});
