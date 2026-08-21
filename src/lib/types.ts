export type InstitutionType =
  | "Public University"
  | "Private Higher Education Institution"
  | "TVET College";

export interface Contacts {
  email: string[];
  phone: string[];
  website?: string | null;
}

/** An institution's SAQA-matched qualifications, grouped by subfield ("faculty"). Baked
 * into data/institutions.json / public_universities.json / public_tvets.json by
 * web/scripts/bakeFacultiesAndProgrammes.ts (in the eduverify repo) — an institution/faculty
 * with no SAQA match gets an empty array, never omitted or null. */
export interface FacultyProgrammes {
  faculty: string;
  programmes: SaqaQualification[];
}

/** Shape of the seed data — already enriched with SAQA-matched faculties_and_programmes
 * by the bake script, so no client-side parsing is needed. */
export interface RawInstitution {
  name: string;
  registration_number?: string | null;
  status?: string | null;
  address: string;
  province?: string | null;
  contacts: Contacts;
  faculties_and_programmes: FacultyProgrammes[];
  cancellation_reason?: string | null;
}

export interface Institution {
  name: string;
  tradingName?: string | null;
  /** Common short form, e.g. "UCT" — search-only, never a valid getDisplayName result. */
  abbreviation?: string | null;
  registration_number?: string | null;
  status?: string | null;
  address: string;
  province?: string | null;
  contacts: Contacts;
  faculties_and_programmes: FacultyProgrammes[];
  cancellation_reason?: string | null;
  institutionType: InstitutionType;
  isFeatured?: boolean;
  isSponsored?: boolean;
  isRecentlyAdded?: boolean;
}

export interface InstitutionRecord extends Institution {
  id: string;
}

export interface SearchFilters {
  province?: string;
  institutionType?: InstitutionType;
}

/** A single SAQA NLRD qualification registration, from any NQF sub-framework (HEQSF, OQSF,
 * GFETQSF, SFAP, SFNA). `framework` is the per-row discriminator for callers that need to
 * filter to one sub-framework — e.g. EduVerify's own product is HEQSF-only, but this API's
 * other form-verification consumers need the full set. */
export interface SaqaQualification {
  qualId: number;
  title: string;
  nqfLevel?: number;
  nqfLevelRaw: string;
  credits?: number;
  subfield: string;
  originator: string;
  framework: string;
}

export interface FacultyGroup {
  faculty: string;
  count: number;
}

export interface FacultyQualificationGroup extends FacultyGroup {
  qualifications: SaqaQualification[];
}
