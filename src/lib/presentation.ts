import { getAllProgrammes } from "./facultiesAndProgrammes";
import { CANONICAL_PROVINCES, parseInstitutionAddresses } from "./normalize";
import type { InstitutionRecord, InstitutionType } from "./types";

const STOPWORDS = new Set(["of", "the", "and", "for", "a", "an", "in"]);

export const TYPE_LABEL: Record<InstitutionType, string> = {
  "Public University": "Public University",
  "Private Higher Education Institution": "Private Institution",
  "TVET College": "TVET College",
};

/** Two-letter monogram used for the placeholder logo avatar, e.g. "University of Cape Town" -> "UC". */
export function getInitials(name: string): string {
  const words = name
    .replace(/\([^)]*\)/g, "")
    .split(/\s+/)
    .filter((word) => word && !STOPWORDS.has(word.toLowerCase()));

  const letters = words.slice(0, 2).map((word) => word[0]?.toUpperCase() ?? "");
  const initials = letters.join("");
  return initials || name.slice(0, 2).toUpperCase();
}

const CORPORATE_SUFFIX_RE =
  /[\s,]+\(?(?:pty\.?\s*\)?\s*(?:ltd\.?|limited)|proprietary\s+limited|limited|ltd\.?|pty\.?|inc\.?|incorporated|npc|cc)\)?[.:]?$/i;

/** Cuts everything from a trailing "Previous Name: ..." clause onward — DHET records
 * sometimes append a superseded legal name (and its own trading suffix) as plain text
 * rather than in parentheses, e.g. "... Previous Name: Durban Computer College t/a DCC". */
const PREVIOUS_NAME_CUTOFF_RE = /\s*previous name\s*:.*$/i;

/** Parenthetical asides that restate history rather than identity, e.g. "(Previously ...)",
 * "(Incorporated in ...)", "(Formerly ...)", "(Now operating as a site of delivery for ...)"
 * — dropped wholesale rather than parsed. The site-of-delivery variant is how DHET marks
 * Educor-group brands (Rosebank College, Varsity College, etc.) absorbed into a parent
 * institution; its own trailing "(Pty) Ltd)" is left dangling by this match alone but gets
 * cleaned up by the next pass through CORPORATE_SUFFIX_RE below. */
const DESCRIPTIVE_PARENTHETICAL_RE =
  /\s*\((?:previously|incorporated(?:\s+in)?|formerly|now operating as a site of delivery for)[^)]*\)/gi;

/** A short trailing all-caps acronym bracket, e.g. "(A4FM)" — distinct from
 * "(Pty)"/"(NPC)" style corporate-suffix brackets, which have mixed-case content and are
 * handled by CORPORATE_SUFFIX_RE instead. */
const TRAILING_ACRONYM_RE = /\s*\([A-Z][A-Z0-9&./-]{1,14}\)\s*$/;

/** A bare trailing "(The)" bracket (or its Afrikaans equivalent "(Die)"), left over
 * once a preceding corporate suffix (e.g. "(Pty) Ltd", "NPC") has already been stripped. */
const TRAILING_THE_RE = /\s*\((?:the|die)\)\s*$/i;

/** A trailing "/ABBREV" inline trading-name marker DHET sometimes appends directly
 * to the legal name instead of a separate "t/a ..." clause, e.g. "... (Pty) Ltd /AFDA". */
const TRAILING_SLASH_ABBR_RE = /\s*\/[A-Za-z][A-Za-z0-9&.-]{1,20}\s*$/;

/** A bare (unparenthesized) trailing "Previously ..." clause — the parenthesized form is
 * handled by DESCRIPTIVE_PARENTHETICAL_RE, but DHET sometimes appends it as plain trailing
 * text instead, e.g. "... Pty Ltd /GIFSPHEI Previously Katapult Business School (Pty) Ltd". */
const BARE_PREVIOUSLY_CUTOFF_RE = /(?<!\()\s*previously\b.*$/i;

/** A trailing "with company registration number ..." clause — DHET's own dedicated
 * registration-number column doesn't exist for the "bogus colleges" warning-list
 * section, so at least one entry has it typed directly into the wrapped name text
 * instead, e.g. "... International (Pty) Ltd with company registration number
 * 2018/288825/ 07". */
const COMPANY_REGISTRATION_NUMBER_CUTOFF_RE = /\s*with company registration number\b.*$/i;

/** An inline "t/a X" or "trading as X" marker — DHET's own dedicated trading-name field is
 * never actually populated in practice, so a registered entity's trading name instead shows
 * up appended to the legal name in plain text, e.g. "Cat Group (Pty) Ltd t/a CAT Academy".
 * The legal-entity prefix is discarded entirely and only the trading name (X) is kept, since
 * that's what browsing/search surfaces should show. Must run after PREVIOUS_NAME_CUTOFF_RE:
 * a "Previous Name: ... t/a ..." tail should be cut wholesale, not mined for a trading name. */
const INLINE_TRADING_AS_RE = /\b(?:t\/a|trading\s+as)\s+(.+)$/i;

/** Applies the strip rules to a fixed point — order matters (e.g. an acronym bracket can
 * be sitting outside a corporate suffix, so removing it exposes the suffix to strip next)
 * but which rule fires first shouldn't, so we loop until nothing more changes. */
export function cleanLegalName(raw: string): string {
  let result = raw.replace(PREVIOUS_NAME_CUTOFF_RE, "");

  const tradingAsMatch = INLINE_TRADING_AS_RE.exec(result);
  if (tradingAsMatch) result = tradingAsMatch[1];

  let previous: string;
  do {
    previous = result;
    result = result
      .replace(DESCRIPTIVE_PARENTHETICAL_RE, "")
      .replace(BARE_PREVIOUSLY_CUTOFF_RE, "")
      .replace(COMPANY_REGISTRATION_NUMBER_CUTOFF_RE, "")
      .replace(TRAILING_ACRONYM_RE, "")
      .replace(TRAILING_THE_RE, "")
      .replace(TRAILING_SLASH_ABBR_RE, "")
      .replace(CORPORATE_SUFFIX_RE, "");
  } while (result !== previous);
  return result.replace(/\s{2,}/g, " ").trim();
}

/** Derives the name browsing surfaces should show: a clean trading name when the
 * institution has one (e.g. "Educor (Pty) Ltd t/a Damelin" -> "Damelin"), otherwise the
 * legal name with corporate suffixes and historical asides stripped, e.g. "Academic
 * Institute of Excellence (Pty) Ltd" -> "Academic Institute of Excellence". The full legal
 * name is kept wherever registration/verification detail matters (e.g. InstitutionCard). */
export function getDisplayName(name: string, tradingName?: string | null): string {
  const trimmedTrading = tradingName?.trim();
  if (trimmedTrading) return cleanLegalName(trimmedTrading) || trimmedTrading;
  return cleanLegalName(name) || name.trim();
}

const AVATAR_PALETTES = [
  "bg-emerald-50 text-emerald-700",
  "bg-sky-50 text-sky-700",
  "bg-violet-50 text-violet-700",
  "bg-amber-50 text-amber-700",
  "bg-rose-50 text-rose-700",
  "bg-indigo-50 text-indigo-700",
  "bg-teal-50 text-teal-700",
];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function getAvatarPalette(seed: string): string {
  return AVATAR_PALETTES[hashString(seed) % AVATAR_PALETTES.length];
}

/** Known institution brand colors, matched against the full name. Patterns are anchored
 * to each university's actual name (not a bare city) so unrelated private colleges named
 * after the same city — e.g. "ACT Cape Town (Pty) Ltd" — don't inherit a public
 * university's color. Anything not listed falls back to a deterministic pick from
 * BRAND_FALLBACK_COLORS so every institution still gets a distinct, stable, solid color. */
const KNOWN_BRAND_COLORS: Array<{ match: RegExp; color: string }> = [
  { match: /university of cape town/i, color: "#003B6A" },
  { match: /stellenbosch university/i, color: "#7A1632" },
  { match: /university of the witwatersrand/i, color: "#00205B" },
  { match: /university of pretoria/i, color: "#1C3FAA" },
  { match: /university of kwazulu-natal/i, color: "#B8860B" },
  { match: /university of johannesburg/i, color: "#8B1E3F" },
  { match: /rhodes university/i, color: "#00543C" },
  { match: /university of the free state/i, color: "#6B2C91" },
];

const BRAND_FALLBACK_COLORS = [
  "#1D4E89",
  "#5B3A29",
  "#2F5233",
  "#6B2C91",
  "#0B5563",
  "#8C3B2E",
  "#3D3B8E",
  "#1A659E",
];

/** Derives a solid, high-contrast brand color for an institution — a small set of real
 * SA university brand colors, falling back to a deterministic palette pick (by id) for
 * everyone else, so the hero header/avatar is always institution-specific rather than
 * one flat theme color. */
export function getBrandColor(institution: InstitutionRecord): string {
  const known = KNOWN_BRAND_COLORS.find(({ match }) => match.test(institution.name));
  if (known) return known.color;
  return BRAND_FALLBACK_COLORS[hashString(institution.id) % BRAND_FALLBACK_COLORS.length];
}

export interface RegistrationDetails {
  label: string;
  value: string;
}

/** Left-hand field of the detail modal's registration/province grid. Public
 * universities and TVET colleges have no DHET registration number, so this falls back
 * to the institution type instead — otherwise that grid column would go blank and
 * collapse the layout. */
export function getRegistrationDetails(institution: InstitutionRecord): RegistrationDetails {
  if (institution.registration_number) {
    return { label: "Registration No.", value: institution.registration_number };
  }
  return { label: "Institution Type", value: TYPE_LABEL[institution.institutionType] ?? institution.institutionType };
}

export interface StatusBadge {
  label: string;
  verified: boolean;
  cancelled: boolean;
}

/** Derives a display badge from the raw register status; provisional institutions are
 * called out explicitly rather than folded into "Registered" — this is a verification
 * tool, so overstating a provisional status would defeat its purpose. The raw "Bogus"
 * status is relabeled "Fake - Not Registered" for the badge text since "Bogus" reads as
 * unclear/informal for a warning meant to stop someone enrolling. Cancelled/
 * Discontinued/Bogus are checked first: DHET lists some cancelled registrations under
 * the Registered/Provisionally Registered sections rather than a separate section (see
 * parser/extraction.py's has_cancellation_notice), so a raw status of "Provisionally
 * Registered" doesn't always mean the registration is still active. `cancelled` is
 * reused as a general "not a real active registration" flag for all three, since every
 * consumer (browse filter, card styling) treats them identically — only the label text
 * (and getVerificationDescription's copy) differs between them. */
export function getStatusBadge(institution: InstitutionRecord): StatusBadge {
  const rawStatus = (institution.status ?? "").toLowerCase();

  if (rawStatus.includes("bogus")) {
    return { label: "Fake - Not Registered", verified: false, cancelled: true };
  }

  if (rawStatus.includes("discontinued")) {
    return { label: "Discontinued", verified: false, cancelled: true };
  }

  if (rawStatus.includes("cancelled")) {
    return { label: "Cancelled", verified: false, cancelled: true };
  }

  if (rawStatus.includes("provisional")) {
    return { label: "Provisionally Registered", verified: false, cancelled: false };
  }

  const isPublic = institution.institutionType === "Public University" || institution.institutionType === "TVET College";
  return { label: isPublic ? "Registered Public" : "Registered Private", verified: true, cancelled: false };
}

/** True for institutions whose register entry is name-only — the DHET "cancellation/lapse
 * of registration" and "discontinued by request" list sections (see parser/build.py's
 * section 4/5 handling) never populate more than a name, so there's no address or
 * qualification data to show. Cards for these institutions should skip detail rows that
 * would otherwise surface a synthetic "Unknown" and disable actions that have nothing
 * behind them. */
export function hasNoFurtherDetails(institution: InstitutionRecord): boolean {
  return institution.address.trim().length === 0 && getAllProgrammes(institution).length === 0;
}

/** True when there's no address on file at all — distinct from hasNoFurtherDetails,
 * which also treats real qualification data as "further details". An institution can
 * have SAQA-matched qualifications baked in while still being a name-only DHET register
 * entry with no address/contacts, in which case "Contact Info" has nothing to show even
 * though "Qualifications" legitimately does. */
export function hasNoAddress(institution: InstitutionRecord): boolean {
  return institution.address.trim().length === 0;
}

/** True when an institution has no SAQA-matched qualifications on file at all, independent
 * of whether it has an address — a TVET (or any institution) can be a fully-detailed
 * register entry with a real address and still have zero matched programmes, in which case
 * the "Qualifications" action should be disabled rather than linking through to an empty page. */
export function hasNoQualifications(institution: InstitutionRecord): boolean {
  return getAllProgrammes(institution).length === 0;
}

/** Longer-form copy for the verification callout in the institution detail modal —
 * distinct from StatusBadge.label, which stays terse for the small pill badges used
 * elsewhere (grid cards, hero cards). */
export function getVerificationDescription(institution: InstitutionRecord): string {
  const badge = getStatusBadge(institution);
  if (badge.label === "Fake - Not Registered") {
    return "This is not a registered institution. The Department of Higher Education and Training has published it on its warning list of bogus, unregistered providers.";
  }
  if (badge.label === "Discontinued") {
    return "This institution requested that the Department of Higher Education and Training discontinue its registration.";
  }
  if (badge.cancelled) {
    return "This institution's registration with the Department of Higher Education and Training has been cancelled.";
  }
  if (badge.verified) {
    return "This institution is officially registered with the Department of Higher Education and Training.";
  }
  return "This institution is provisionally registered with the Department of Higher Education and Training, pending full accreditation.";
}

/** Location shown on browse/search cards next to the MapPin icon. When the province
 * couldn't be resolved (garbled/OCR'd DHET source text, common for multi-campus private
 * institutions), falls back to the first parsed campus name (e.g. "Sandton") rather than
 * the literal "Unknown" — but only when the address actually lists multiple lettered
 * campuses; a single plain address with no markers has nothing more specific to offer.
 * Returns null (never the literal "Unknown") when no real location can be resolved —
 * callers should omit the location row entirely rather than render a placeholder. */
export function getPrimaryLocation(institution: InstitutionRecord): string | null {
  const province = institution.province;
  if (province && province !== "Unknown") return province;

  const locations = parseInstitutionAddresses(institution.address, CANONICAL_PROVINCES);
  if (locations.length > 1) return locations[0].label;

  return null;
}

export function getShortDescription(institution: InstitutionRecord): string {
  const typeLabel = TYPE_LABEL[institution.institutionType] ?? institution.institutionType;
  const province = institution.province && institution.province !== "Unknown" ? ` in ${institution.province}` : "";
  const qualCount = getAllProgrammes(institution).length;
  const qualPhrase = qualCount > 0 ? `${qualCount} accredited qualification${qualCount === 1 ? "" : "s"}` : "qualification details on request";
  return `${typeLabel}${province}, offering ${qualPhrase}.`;
}

/** Featured selection is deterministic (by qualification count, then name) rather than
 * random, so the hero looks the same on every render/refresh until the data changes. */
export function selectFeatured(institutions: InstitutionRecord[], count = 5): InstitutionRecord[] {
  return [...institutions]
    .sort((a, b) => getAllProgrammes(b).length - getAllProgrammes(a).length || a.name.localeCompare(b.name))
    .slice(0, count);
}
