import { describe, expect, it } from "vitest";
import { getAllProgrammes, getFacultyLabels, groupBySubfield, toInstitutionSummary } from "./facultiesAndProgrammes";
import type { InstitutionRecord, SaqaQualification } from "./types";

function makeQualification(overrides: Partial<SaqaQualification> = {}): SaqaQualification {
  return {
    qualId: 1,
    title: "Diploma in Something",
    nqfLevelRaw: "NQF Level 06",
    subfield: "Business",
    originator: "Test Institution",
    framework: "HEQSF",
    ...overrides,
  };
}

describe("groupBySubfield", () => {
  it("returns an empty array for no rows", () => {
    expect(groupBySubfield([])).toEqual([]);
  });

  it("groups rows by subfield into faculties sorted alphabetically", () => {
    const rows = [
      makeQualification({ qualId: 1, title: "B", subfield: "Visual Arts" }),
      makeQualification({ qualId: 2, title: "A", subfield: "Business" }),
    ];

    const result = groupBySubfield(rows);

    expect(result.map((f) => f.faculty)).toEqual(["Business", "Visual Arts"]);
  });

  it("sorts programmes within a faculty by title then qualId, regardless of input order", () => {
    const rows = [
      makeQualification({ qualId: 2, title: "Zebra Studies", subfield: "Arts" }),
      makeQualification({ qualId: 1, title: "Apple Studies", subfield: "Arts" }),
      makeQualification({ qualId: 3, title: "Apple Studies", subfield: "Arts" }),
    ];

    const result = groupBySubfield(rows);

    expect(result).toHaveLength(1);
    expect(result[0].programmes.map((p) => p.qualId)).toEqual([1, 3, 2]);
  });
});

describe("getAllProgrammes", () => {
  it("returns an empty array when there are no faculties", () => {
    expect(getAllProgrammes({ faculties_and_programmes: [] })).toEqual([]);
  });

  it("flattens programmes across every faculty, preserving each faculty's internal order", () => {
    const arts = makeQualification({ qualId: 1, title: "Arts A", subfield: "Arts" });
    const business1 = makeQualification({ qualId: 2, title: "Biz A", subfield: "Business" });
    const business2 = makeQualification({ qualId: 3, title: "Biz B", subfield: "Business" });

    const result = getAllProgrammes({
      faculties_and_programmes: [
        { faculty: "Arts", programmes: [arts] },
        { faculty: "Business", programmes: [business1, business2] },
      ],
    });

    expect(result).toEqual([arts, business1, business2]);
  });
});

describe("getFacultyLabels", () => {
  it("returns an empty array when there are no faculties", () => {
    expect(getFacultyLabels({ faculties_and_programmes: [] })).toEqual([]);
  });

  it("returns faculty names sorted alphabetically, regardless of input order", () => {
    const result = getFacultyLabels({
      faculties_and_programmes: [
        { faculty: "Marketing", programmes: [makeQualification({ subfield: "Marketing" })] },
        { faculty: "Design Studies", programmes: [makeQualification({ subfield: "Design Studies" })] },
      ],
    });

    expect(result).toEqual(["Design Studies", "Marketing"]);
  });

  it("excludes a faculty with no matched programmes", () => {
    const result = getFacultyLabels({
      faculties_and_programmes: [
        { faculty: "Marketing", programmes: [makeQualification({ subfield: "Marketing" })] },
        { faculty: "Unmatched Faculty", programmes: [] },
      ],
    });

    expect(result).toEqual(["Marketing"]);
  });
});

function makeInstitution(overrides: Partial<InstitutionRecord> = {}): InstitutionRecord {
  return {
    id: "id",
    name: "Test Institution",
    address: "",
    contacts: { email: [], phone: [] },
    faculties_and_programmes: [],
    institutionType: "Private Higher Education Institution",
    ...overrides,
  };
}

describe("toInstitutionSummary", () => {
  it("carries over every field except faculties_and_programmes", () => {
    const institution = makeInstitution({ name: "UCT", province: "Western Cape" });

    const summary = toInstitutionSummary(institution);

    expect(summary).not.toHaveProperty("faculties_and_programmes");
    expect(summary).toMatchObject({ id: "id", name: "UCT", province: "Western Cape" });
  });

  it("reports the total qualification count across every faculty", () => {
    const institution = makeInstitution({
      faculties_and_programmes: [
        { faculty: "Arts", programmes: [makeQualification({ qualId: 1, subfield: "Arts" })] },
        {
          faculty: "Business",
          programmes: [
            makeQualification({ qualId: 2, subfield: "Business" }),
            makeQualification({ qualId: 3, subfield: "Business" }),
          ],
        },
      ],
    });

    expect(toInstitutionSummary(institution).qualificationCount).toBe(3);
  });

  it("reports faculty labels the same way getFacultyLabels does, excluding empty faculties", () => {
    const institution = makeInstitution({
      faculties_and_programmes: [
        { faculty: "Marketing", programmes: [makeQualification({ subfield: "Marketing" })] },
        { faculty: "Unmatched Faculty", programmes: [] },
      ],
    });

    expect(toInstitutionSummary(institution).facultyLabels).toEqual(["Marketing"]);
  });

  it("returns zero/empty for an institution with no faculties", () => {
    const summary = toInstitutionSummary(makeInstitution());
    expect(summary.qualificationCount).toBe(0);
    expect(summary.facultyLabels).toEqual([]);
  });
});
