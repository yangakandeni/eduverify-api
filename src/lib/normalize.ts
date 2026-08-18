const DIACRITICS = /[̀-ͯ]/g;

export function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(DIACRITICS, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeRegistrationNumber(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "");
}

export const CANONICAL_PROVINCES = [
  "Eastern Cape",
  "Free State",
  "Gauteng",
  "KwaZulu-Natal",
  "Limpopo",
  "Mpumalanga",
  "North West",
  "Northern Cape",
  "Western Cape",
] as const;

export type CanonicalProvince = (typeof CANONICAL_PROVINCES)[number];

/** Source register data has inconsistent casing, embedded newlines, and OCR typos for province names. */
export function normalizeProvince(raw: string | null | undefined): string {
  if (!raw) return "Unknown";
  const cleaned = normalizeText(raw);

  if (cleaned.includes("kwazulu") || cleaned.includes("kwa zulu") || cleaned.includes("natal")) {
    return "KwaZulu-Natal";
  }
  if (cleaned.includes("eastern cape")) return "Eastern Cape";
  if (cleaned.includes("western cape")) return "Western Cape";
  if (cleaned.includes("northern cape")) return "Northern Cape";
  if (cleaned.includes("north west") || cleaned.includes("nort west") || cleaned.includes("northwest")) {
    return "North West";
  }
  if (cleaned.includes("free state")) return "Free State";
  if (cleaned.includes("gauteng")) return "Gauteng";
  if (cleaned.includes("limpopo")) return "Limpopo";
  if (cleaned.includes("mpumalanga")) return "Mpumalanga";

  return "Unknown";
}

/** Splits a raw address string into clean, comma-delimited display lines (e.g. for
 * one-line-per-address-part rendering), stripping trailing periods and collapsing
 * whitespace left over from OCR'd source data. */
export function formatAddressLines(address: string): string[] {
  if (!address) return [];
  return address
    .replace(/\.+\s*$/, "")
    .split(/,\s*/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0);
}

export interface AddressLocation {
  id: string;
  label: string;
  address: string;
}

/** Matches DHET's letter-list markers ("A) ", "B) ", ...) that introduce each campus
 * address within a single raw address string. Requires the letter to start the string or
 * follow whitespace so it can't misfire on unrelated text. */
const LOCATION_PREFIX_RE = /(?:^|\s)[A-Z]\)\s*/g;

/** A leading "City: " (or "Province: ") tag on a campus address segment, DHET's way of
 * naming which location an address belongs to before the actual street address. */
const LOCATION_LABEL_RE = /^([^:]+):\s*/;

/** Splits a raw institution address into its constituent campus locations. DHET
 * concatenates multiple campuses into one string with "A) City: ..." / "B) City: ..."
 * markers; this recovers each as a distinct, cleanly-labelled address. Addresses without
 * any markers (the common case — a single campus) come back as one location unchanged. */
export function parseInstitutionAddresses(
  rawAddress: string,
  provinces: readonly string[] = CANONICAL_PROVINCES,
  fallbackLabel?: string,
): AddressLocation[] {
  const trimmed = rawAddress?.trim() ?? "";
  if (!trimmed) return [];
  const label = fallbackLabel ?? provinces[0] ?? "Location";

  const markers = [...trimmed.matchAll(LOCATION_PREFIX_RE)];
  if (markers.length === 0) {
    return [{ id: "loc-1", label, address: trimmed }];
  }

  const locations = markers.map((marker, index) => {
    const start = marker.index + marker[0].length;
    const end = index + 1 < markers.length ? markers[index + 1].index : trimmed.length;
    const segment = trimmed.slice(start, end).trim();

    const labelMatch = segment.match(LOCATION_LABEL_RE);
    if (!labelMatch) {
      return { id: `loc-${index + 1}`, label, address: segment };
    }

    const rawLabel = labelMatch[1].trim();
    const matchedProvince = provinces.find((province) => province.toLowerCase() === rawLabel.toLowerCase());
    return {
      id: `loc-${index + 1}`,
      label: matchedProvince ?? rawLabel,
      address: segment.slice(labelMatch[0].length).trim(),
    };
  });

  // A single campus can still carry a DHET letter-marker ("A) City: ..."), which reads
  // as a city rather than a province. With no second campus to distinguish it from,
  // prefer the institution's actual province over that raw city text.
  const isSingleUnresolvedCity =
    locations.length === 1 && !provinces.some((province) => province.toLowerCase() === locations[0].label.toLowerCase());
  if (isSingleUnresolvedCity && fallbackLabel) {
    locations[0] = { ...locations[0], label: fallbackLabel };
  }

  return locations;
}
