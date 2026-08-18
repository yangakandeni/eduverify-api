import { describe, expect, it } from "vitest";
import { getDisplayName } from "./presentation";
import { searchInstitutions } from "./search";
import type { InstitutionRecord, SaqaQualification } from "./types";

function makeQualification(overrides: Partial<SaqaQualification> = {}): SaqaQualification {
  return {
    qualId: 1,
    title: "Diploma in Something",
    nqfLevelRaw: "NQF Level 06",
    subfield: "General",
    originator: "",
    framework: "HEQSF",
    ...overrides,
  };
}

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

// Fixture set mirroring the real institutions this ranking logic was validated against
// in eduverify's web/lib/search.ts, minus the bundled seed data (this repo has none).
const UCT = makeInstitution({ name: "University of Cape Town", abbreviation: "UCT", institutionType: "Public University" });
const CPUT = makeInstitution({
  name: "Cape Peninsula University of Technology",
  abbreviation: "CPUT",
  institutionType: "Public University",
});
const WITS = makeInstitution({
  name: "University of the Witwatersrand",
  abbreviation: "Wits",
  institutionType: "Public University",
});
const UJ = makeInstitution({ name: "University of Johannesburg", abbreviation: "UJ", institutionType: "Public University" });
const BIBLE_INSTITUTE = makeInstitution({ name: "Bible Institute of South Africa NPC (The)" });
const MANCOSA = makeInstitution({
  name: "MANCOSA (Pty) Ltd",
  faculties_and_programmes: [
    {
      faculty: "Information Technology",
      programmes: [makeQualification({ qualId: 10, title: "Bachelor of Science in Information Technology" })],
    },
  ],
});
const AKADEMIA = makeInstitution({
  name: "Akademia NPC",
  faculties_and_programmes: [
    {
      faculty: "Science",
      programmes: [makeQualification({ qualId: 11, title: "Bachelor of Science in Computer Science" })],
    },
  ],
});
const STELLENBOSCH = makeInstitution({
  name: "Stellenbosch University",
  institutionType: "Public University",
  faculties_and_programmes: [
    { faculty: "Arts", programmes: [makeQualification({ qualId: 12, title: "Diploma in Theatre Arts" })] },
  ],
});

const ALL = [UCT, CPUT, WITS, UJ, BIBLE_INSTITUTE, MANCOSA, AKADEMIA, STELLENBOSCH];

describe("searchInstitutions abbreviation matching", () => {
  it("finds a public university by its common abbreviation", () => {
    const results = searchInstitutions(ALL, "UCT");
    expect(results.some((r) => r.name === "University of Cape Town")).toBe(true);
  });

  it("matches abbreviations case-insensitively", () => {
    const results = searchInstitutions(ALL, "cput");
    expect(results.some((r) => r.name === "Cape Peninsula University of Technology")).toBe(true);
  });

  it("ranks an exact abbreviation match above unrelated substring matches", () => {
    const results = searchInstitutions(ALL, "Wits");
    expect(results[0]?.name).toBe("University of the Witwatersrand");
  });

  it("never surfaces the abbreviation itself as the institution's display name", () => {
    const results = searchInstitutions(ALL, "UJ");
    const uj = results.find((r) => r.name === "University of Johannesburg");
    expect(uj).toBeDefined();
    expect(getDisplayName(uj!.name, uj!.tradingName)).toBe("University of Johannesburg");
  });
});

describe("searchInstitutions qualification-title fallback", () => {
  it("surfaces an institution whose matched programme titles contain the query, even with no name match", () => {
    const results = searchInstitutions(ALL, "theatre");
    expect(results.some((r) => r.name === "Stellenbosch University")).toBe(true);
  });

  it("does not surface an institution whose name merely contains the query as a bare mid-word substring", () => {
    const results = searchInstitutions(ALL, "IT");
    expect(results.some((r) => r.name === "Bible Institute of South Africa NPC (The)")).toBe(false);
  });

  it("surfaces an institution offering an Information Technology qualification via the 'IT' alias", () => {
    const results = searchInstitutions(ALL, "IT");
    expect(results.some((r) => r.name === "MANCOSA (Pty) Ltd")).toBe(true);
  });

  it("matches a qualification title regardless of search-term word order", () => {
    const results = searchInstitutions(ALL, "science computer");
    expect(results.some((r) => r.name === "Akademia NPC")).toBe(true);
  });

  it("tolerates a minor spelling mistake against a qualification title", () => {
    const results = searchInstitutions(ALL, "compter scince");
    expect(results.some((r) => r.name === "Akademia NPC")).toBe(true);
  });
});
