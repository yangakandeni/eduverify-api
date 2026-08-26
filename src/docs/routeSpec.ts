export type HttpMethod = "GET" | "POST";

export interface QuerySchema {
  type: "string" | "integer";
  minimum?: number;
  default?: string | number;
}

export interface QueryParamSpec {
  name: string;
  description?: string;
  schema: QuerySchema;
  example?: string;
  /** Reference to a components.schemas entry instead of an inline `schema` (e.g. InstitutionType). */
  type?: string;
}

export interface PathParamSpec {
  name: string;
  description?: string;
}

/** Wraps a referenced type (or an array of it) inside a single-key envelope object, e.g.
 * `{ institution: InstitutionRecord }` or `{ results: VerifyQualificationResult[] }` — the
 * envelope itself has no TS interface in the handler code, so it can't be generated; this is
 * the one piece of response shape that has to be declared here instead. */
export interface WrapSpec {
  key: string;
  array?: boolean;
}

export interface ResponseSpec {
  status: number;
  description: string;
  /** Name of an exported TS type/interface, resolved to a components.schemas ref. Omitted for
   * non-JSON bodies (text/html, text/yaml). */
  type?: string;
  contentType?: string;
  wrap?: WrapSpec;
}

export interface RouteSpec {
  method: HttpMethod;
  /** OpenAPI-style path, e.g. "/v1/institutions/{id}". */
  path: string;
  operationId: string;
  tags: string[];
  summary: string;
  description?: string;
  /** false => this route overrides the global ApiKeyAuth security requirement with none. */
  auth: boolean;
  pathParams?: PathParamSpec[];
  query?: QueryParamSpec[];
  requestType?: string;
  requestWrap?: WrapSpec;
  responses: ResponseSpec[];
}

const ERROR_RESPONSE: ResponseSpec = {
  status: 500,
  description: "Internal error",
  type: "ErrorResponse",
};

/** Single source of truth for the API surface documented in docs/openapi.yaml — every route
 * `src/router.ts` dispatches must have exactly one matching entry here (see
 * generateOpenApi.test.ts's drift guard against the real router). Response/request `type`
 * names are resolved to components.schemas by generating JSON Schema from the actual exported
 * TS interfaces (see generateOpenApi.ts) rather than retyped by hand here. */
export const ROUTE_SPEC: RouteSpec[] = [
  {
    method: "GET",
    path: "/v1/health",
    operationId: "getHealth",
    tags: ["Health"],
    summary: "Check API and DynamoDB health",
    description:
      "Unauthenticated. Returns \"degraded\" (not necessarily a 5xx) when the API process is up " +
      "but its one dependency, the institutions table, isn't reachable.",
    auth: false,
    responses: [
      { status: 200, description: "Health status", type: "HealthResult" },
      ERROR_RESPONSE,
    ],
  },
  {
    method: "GET",
    path: "/v1/stats",
    operationId: "getStats",
    tags: ["Stats"],
    summary: "Headline counts across the full corpus",
    description:
      "Scans every status partition (like /v1/institutions/list's status=ALL), not just " +
      "REGISTERED — a total-corpus count rather than one filtered to a single register status.",
    auth: true,
    responses: [
      { status: 200, description: "Corpus-wide counts", type: "StatsResult" },
      ERROR_RESPONSE,
    ],
  },
  {
    method: "GET",
    path: "/v1/docs",
    operationId: "getDocs",
    tags: ["Docs"],
    summary: "Interactive Swagger UI for this spec",
    description:
      "Serves this same spec's Swagger UI page directly from the running API. The page fetches " +
      "this spec from /v1/openapi.yaml.",
    auth: false,
    responses: [
      { status: 200, description: "Swagger UI HTML page", contentType: "text/html" },
      ERROR_RESPONSE,
    ],
  },
  {
    method: "GET",
    path: "/v1/openapi.yaml",
    operationId: "getOpenApiYaml",
    tags: ["Docs"],
    summary: "This spec, as raw YAML",
    description: "The exact contents of this file, served for /v1/docs's Swagger UI to fetch.",
    auth: false,
    responses: [
      { status: 200, description: "OpenAPI 3 spec (YAML)", contentType: "text/yaml" },
      ERROR_RESPONSE,
    ],
  },
  {
    method: "GET",
    path: "/v1/institutions/search",
    operationId: "searchInstitutions",
    tags: ["Institutions"],
    summary: "Fuzzy search institutions by name",
    description:
      "Scans every status partition and fuzzy-ranks the whole set (typo/word-order/abbreviation " +
      "tolerant). An empty or missing q returns an empty, page-1 result rather than an error.",
    auth: true,
    query: [
      { name: "q", description: "Free-text institution name query, e.g. \"UCT\" or \"cape town\".", schema: { type: "string" } },
      { name: "province", description: "Exact-match province filter.", schema: { type: "string" }, example: "Western Cape" },
      { name: "type", description: "Exact-match institution type filter.", type: "InstitutionType", schema: { type: "string" } },
      { name: "page", description: "1-indexed page number.", schema: { type: "integer", minimum: 1, default: 1 } },
      { name: "pageSize", schema: { type: "integer", minimum: 1, default: 25 } },
    ],
    responses: [
      { status: 200, description: "One page of ranked search results", type: "SearchResult" },
      ERROR_RESPONSE,
    ],
  },
  {
    method: "GET",
    path: "/v1/institutions/list",
    operationId: "listInstitutions",
    tags: ["Institutions"],
    summary: "Paginated browse/listing of institutions",
    description:
      "Fetches a full GSI1 status partition and paginates/filters in memory. status=ALL scans " +
      "every partition instead of the default single status partition.",
    auth: true,
    query: [
      { name: "page", description: "1-indexed page number.", schema: { type: "integer", minimum: 1, default: 1 } },
      { name: "pageSize", schema: { type: "integer", minimum: 1, default: 25 } },
      { name: "province", schema: { type: "string" } },
      { name: "type", type: "InstitutionType", schema: { type: "string" } },
      {
        name: "status",
        description:
          "GSI1PK status partition to read, or \"ALL\" to scan and merge every partition. See " +
          "STATUS_PARTITIONS in src/lib/dynamodb.ts for the exhaustive list of valid values.",
        schema: { type: "string", default: "REGISTERED" },
        example: "REGISTERED",
      },
      {
        name: "fields",
        description:
          "\"full\" returns complete InstitutionRecords (including faculties_and_programmes) " +
          "instead of the default InstitutionSummaryRecord shape (qualificationCount and " +
          "facultyLabels in place of the nested detail). Any other value is treated as the default.",
        schema: { type: "string", default: "summary" },
        example: "full",
      },
    ],
    responses: [
      { status: 200, description: "One page of institutions", type: "ListResult" },
      ERROR_RESPONSE,
    ],
  },
  {
    method: "GET",
    path: "/v1/institutions/{id}",
    operationId: "getInstitution",
    tags: ["Institutions"],
    summary: "Fetch a single institution by id",
    description: "Direct PK GetItem — finds an institution even if it isn't visible to GSI1-based search/list.",
    auth: true,
    pathParams: [{ name: "id", description: "The institution's DynamoDB PK, e.g. \"INST#2000/HE07/015\"." }],
    responses: [
      { status: 200, description: "The institution", type: "InstitutionRecord", wrap: { key: "institution" } },
      { status: 404, description: "No institution with that id", type: "ErrorResponse" },
      ERROR_RESPONSE,
    ],
  },
  {
    method: "POST",
    path: "/v1/institutions/verify",
    operationId: "verifyInstitution",
    tags: ["Institutions"],
    summary: "High-confidence identity verification for an institution",
    description:
      "The form-verification use case: confirming that an institution name or registration number " +
      "a user typed or picked from autocomplete is real, with a boolean-ish, high-confidence answer " +
      "rather than a ranked list. A registration number that resolves is always \"exact\"; a name " +
      "match is \"exact\" only when it equals a candidate's name after normalization, \"high\" otherwise.",
    auth: true,
    requestType: "VerifyInstitutionRequest",
    responses: [
      { status: 200, description: "Verification result", type: "VerifyInstitutionResult" },
      { status: 400, description: "Malformed JSON body", type: "ErrorResponse" },
      ERROR_RESPONSE,
    ],
  },
  {
    method: "POST",
    path: "/v1/qualifications/verify",
    operationId: "verifyQualification",
    tags: ["Qualifications"],
    summary: "Verify a single claimed qualification",
    description:
      "Given a user-claimed (qualification title, institution name) pair — e.g. a self-reported " +
      "qualification on a form — finds the institution and checks whether it actually offers that " +
      "qualification.",
    auth: true,
    requestType: "VerifyQualificationRequest",
    responses: [
      { status: 200, description: "Verification result", type: "VerifyQualificationResult" },
      { status: 400, description: "Malformed JSON body", type: "ErrorResponse" },
      ERROR_RESPONSE,
    ],
  },
  {
    method: "POST",
    path: "/v1/qualifications/verify/batch",
    operationId: "verifyQualificationBatch",
    tags: ["Qualifications"],
    summary: "Verify several claimed qualifications in one call",
    description:
      "A single form submission commonly claims several qualifications from the same institution, so " +
      "this fans out to the single-item matcher per claim. Requires a tier with batch access (see " +
      "src/tiers.ts); maxBatchSize is enforced per the caller's tier.",
    auth: true,
    requestType: "VerifyQualificationRequest",
    requestWrap: { key: "items", array: true },
    responses: [
      {
        status: 200,
        description: "One verification result per input item, in the same order",
        type: "VerifyQualificationResult",
        wrap: { key: "results", array: true },
      },
      { status: 400, description: "Malformed JSON body, or batch size exceeds the tier's maxBatchSize", type: "ErrorResponse" },
      { status: 403, description: "This tier has no batch access", type: "ErrorResponse" },
      ERROR_RESPONSE,
    ],
  },
];
