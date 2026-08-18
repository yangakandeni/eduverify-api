import { describe, expect, it } from "vitest";
import { CANONICAL_PROVINCES, formatAddressLines, normalizeProvince, parseInstitutionAddresses } from "./normalize";

describe("normalizeProvince", () => {
  it("returns 'Unknown' for null, undefined, or empty input", () => {
    expect(normalizeProvince(null)).toBe("Unknown");
    expect(normalizeProvince(undefined)).toBe("Unknown");
    expect(normalizeProvince("")).toBe("Unknown");
  });

  it("returns 'Unknown' for text that doesn't match any known province", () => {
    expect(normalizeProvince("ffGicea auntedn g")).toBe("Unknown");
  });

  // Real-world variants seen in eduverify-api's own DynamoDB data (via a parity check against
  // eduverify's already-normalized local data) — embedded newlines, spacing/hyphenation drift,
  // and casing, all of which must collapse to the same canonical value.
  it.each([
    ["KwaZulu-Natal", "KwaZulu-Natal"],
    ["KwaZulu\nNatal", "KwaZulu-Natal"],
    ["Kwa-Zulu\nNatal", "KwaZulu-Natal"],
    ["Kwazulu Natal", "KwaZulu-Natal"],
    ["KwaZulu Natal", "KwaZulu-Natal"],
    ["Kwa-ZuluNatal", "KwaZulu-Natal"],
    ["Kwa-Zulu Natal", "KwaZulu-Natal"],
    ["North West", "North West"],
    ["Northwest", "North West"],
    ["Nort West", "North West"],
    ["GAUTENG", "Gauteng"],
    ["Gauteng\nGauteng", "Gauteng"],
  ])("normalizes %j to %j", (raw, expected) => {
    expect(normalizeProvince(raw)).toBe(expected);
  });

  it.each(CANONICAL_PROVINCES)("is idempotent on an already-canonical value: %s", (province) => {
    expect(normalizeProvince(province)).toBe(province);
  });
});

describe("parseInstitutionAddresses", () => {
  it("splits a multi-location address into distinct locations with prefixes stripped", () => {
    const raw =
      "A) Bryanston: The Braes Office Park, 3 Eaton Avenue, Bryanston, 2191 B) Cape Town: 6thFloor, AAA House, 112 Long Street, Cape Town, 8001.";

    const locations = parseInstitutionAddresses(raw, CANONICAL_PROVINCES);

    expect(locations).toHaveLength(2);
    for (const location of locations) {
      expect(location.address).not.toMatch(/[A-Z]\)/);
      expect(location.address).not.toMatch(/^\s*[A-Za-z\s]+:/);
    }
    expect(locations[0].address).toBe("The Braes Office Park, 3 Eaton Avenue, Bryanston, 2191");
    expect(locations[0].label).toBe("Bryanston");
    expect(locations[1].address).toBe("6thFloor, AAA House, 112 Long Street, Cape Town, 8001.");
    expect(locations[1].label).toBe("Cape Town");
  });

  it("returns a single location for an address with no letter prefixes", () => {
    const raw = "150 Kelvin Drive, Woodmead, Johannesburg, 2197";

    const locations = parseInstitutionAddresses(raw, CANONICAL_PROVINCES);

    expect(locations).toHaveLength(1);
    expect(locations[0].address).toBe(raw);
  });

  it("labels a single, unmarked address with the given fallback label instead of the first canonical province", () => {
    const raw = "150 Kelvin Drive, Woodmead, Johannesburg, 2197";

    const locations = parseInstitutionAddresses(raw, CANONICAL_PROVINCES, "Gauteng");

    expect(locations[0].label).toBe("Gauteng");
  });

  it("uses the canonical province name as the label when the prefix already names a province", () => {
    const raw = "A) Gauteng: 1 Main Road B) Western Cape: 2 Long Street";

    const locations = parseInstitutionAddresses(raw, CANONICAL_PROVINCES);

    expect(locations.map((location) => location.label)).toEqual(["Gauteng", "Western Cape"]);
  });

  it("returns an empty array for an empty address", () => {
    expect(parseInstitutionAddresses("", CANONICAL_PROVINCES)).toEqual([]);
  });

  it("assigns each location a stable, unique id", () => {
    const raw = "A) Bryanston: 1 Main Road B) Cape Town: 2 Long Street";
    const locations = parseInstitutionAddresses(raw, CANONICAL_PROVINCES);
    expect(new Set(locations.map((location) => location.id)).size).toBe(2);
  });

  it("prefers the institution's actual province over a single campus's raw city marker", () => {
    const raw = "A) Cape Town: Deneb House, 368 Main Road, Observatory, 7925.";

    const locations = parseInstitutionAddresses(raw, CANONICAL_PROVINCES, "Western Cape");

    expect(locations).toHaveLength(1);
    expect(locations[0].label).toBe("Western Cape");
    expect(locations[0].address).toBe("Deneb House, 368 Main Road, Observatory, 7925.");
  });

  it("keeps a single campus's raw city label when no fallback province is given", () => {
    const raw = "A) Cape Town: Deneb House, 368 Main Road, Observatory, 7925.";

    const locations = parseInstitutionAddresses(raw, CANONICAL_PROVINCES);

    expect(locations[0].label).toBe("Cape Town");
  });

  it("does not override a single campus's marker when it already names a canonical province", () => {
    const raw = "A) Gauteng: 1 Main Road";

    const locations = parseInstitutionAddresses(raw, CANONICAL_PROVINCES, "Western Cape");

    expect(locations[0].label).toBe("Gauteng");
  });

  it("does not collapse distinct campus labels when an institution has more than one location", () => {
    const raw = "A) Bryanston: 1 Main Road B) Cape Town: 2 Long Street";

    const locations = parseInstitutionAddresses(raw, CANONICAL_PROVINCES, "Gauteng");

    expect(locations.map((location) => location.label)).toEqual(["Bryanston", "Cape Town"]);
  });
});

describe("formatAddressLines", () => {
  it("splits a comma-separated address into trimmed lines with the trailing period stripped", () => {
    const raw = "Deneb House, 368 Main Road, Observatory, 7925.";

    expect(formatAddressLines(raw)).toEqual(["Deneb House", "368 Main Road", "Observatory", "7925"]);
  });

  it("strips extra trailing periods and commas", () => {
    const raw = "Deneb House, 368 Main Road,, Observatory, 7925..";

    expect(formatAddressLines(raw)).toEqual(["Deneb House", "368 Main Road", "Observatory", "7925"]);
  });

  it("collapses duplicate internal whitespace within a line", () => {
    const raw = "Deneb  House,   368 Main Road";

    expect(formatAddressLines(raw)).toEqual(["Deneb House", "368 Main Road"]);
  });

  it("returns an empty array for an empty address", () => {
    expect(formatAddressLines("")).toEqual([]);
  });
});
