import { beforeEach, describe, expect, it, vi } from "vitest";
import type { APIGatewayProxyEvent } from "aws-lambda";

const getInstitution = vi.fn();
const searchInstitutionsHandler = vi.fn();
const listInstitutions = vi.fn();
const verifyInstitution = vi.fn();
const verifyQualificationHandler = vi.fn();
const verifyQualificationBatch = vi.fn();
const checkHealth = vi.fn();
const getStats = vi.fn();
const getDocsHtml = vi.fn();
const getOpenApiYaml = vi.fn();

vi.mock("./handlers/institutions", () => ({
  getInstitution: (...args: unknown[]) => getInstitution(...args),
  searchInstitutionsHandler: (...args: unknown[]) => searchInstitutionsHandler(...args),
  listInstitutions: (...args: unknown[]) => listInstitutions(...args),
}));
vi.mock("./handlers/verify", () => ({
  verifyInstitution: (...args: unknown[]) => verifyInstitution(...args),
}));
vi.mock("./handlers/qualifications", () => ({
  verifyQualificationHandler: (...args: unknown[]) => verifyQualificationHandler(...args),
  verifyQualificationBatch: (...args: unknown[]) => verifyQualificationBatch(...args),
}));
vi.mock("./handlers/health", () => ({
  checkHealth: (...args: unknown[]) => checkHealth(...args),
}));
vi.mock("./handlers/stats", () => ({
  getStats: (...args: unknown[]) => getStats(...args),
}));
vi.mock("./handlers/docs", () => ({
  getDocsHtml: (...args: unknown[]) => getDocsHtml(...args),
  getOpenApiYaml: (...args: unknown[]) => getOpenApiYaml(...args),
}));
vi.mock("./keyTiers", () => ({ KEY_TIERS: { "dev-key": "developer" } }));

const { handler } = await import("./router");

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: "GET",
    path: "/v1/health",
    resource: "/v1/health",
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    headers: {},
    multiValueHeaders: {},
    body: null,
    isBase64Encoded: false,
    requestContext: { identity: { apiKey: null } } as unknown as APIGatewayProxyEvent["requestContext"],
    stageVariables: null,
    resourceId: "",
    httpMethod2: undefined as never,
    ...overrides,
  } as unknown as APIGatewayProxyEvent;
}

beforeEach(() => {
  getInstitution.mockReset();
  searchInstitutionsHandler.mockReset();
  listInstitutions.mockReset();
  verifyInstitution.mockReset();
  verifyQualificationHandler.mockReset();
  verifyQualificationBatch.mockReset();
  checkHealth.mockReset();
  getStats.mockReset();
  getDocsHtml.mockReset();
  getOpenApiYaml.mockReset();
});

describe("router: GET /v1/health", () => {
  it("returns the health handler's result as 200 JSON", async () => {
    checkHealth.mockResolvedValueOnce({ status: "ok", dynamodb: true });

    const result = await handler(makeEvent());

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ status: "ok", dynamodb: true });
  });
});

describe("router: GET /v1/stats", () => {
  it("returns the stats handler's result as 200 JSON", async () => {
    getStats.mockResolvedValueOnce({ totalInstitutions: 100, totalQualifications: 500, totalProvinces: 9 });

    const result = await handler(makeEvent({ path: "/v1/stats" }));

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ totalInstitutions: 100, totalQualifications: 500, totalProvinces: 9 });
  });
});

describe("router: GET /v1/docs", () => {
  it("returns the Swagger UI page as HTML", async () => {
    getDocsHtml.mockResolvedValueOnce("<html>docs</html>");

    const result = await handler(makeEvent({ path: "/v1/docs" }));

    expect(result.statusCode).toBe(200);
    expect(result.headers?.["Content-Type"]).toBe("text/html; charset=utf-8");
    expect(result.body).toBe("<html>docs</html>");
  });
});

describe("router: GET /v1/openapi.yaml", () => {
  it("returns the OpenAPI spec as YAML — the same relative './openapi.yaml' docs/index.html fetches from /v1/docs", async () => {
    getOpenApiYaml.mockResolvedValueOnce("openapi: 3.0.3");

    const result = await handler(makeEvent({ path: "/v1/openapi.yaml" }));

    expect(result.statusCode).toBe(200);
    expect(result.headers?.["Content-Type"]).toBe("text/yaml; charset=utf-8");
    expect(result.body).toBe("openapi: 3.0.3");
  });
});

describe("router: GET /v1/institutions/{id}", () => {
  it("returns 200 with the institution when found", async () => {
    getInstitution.mockResolvedValueOnce({ id: "INST#123", name: "Test" });

    const result = await handler(
      makeEvent({ path: "/v1/institutions/INST%23123", pathParameters: { id: "INST#123" } }),
    );

    expect(getInstitution).toHaveBeenCalledWith("INST#123");
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ institution: { id: "INST#123", name: "Test" } });
  });

  it("returns 404 when the institution doesn't exist", async () => {
    getInstitution.mockResolvedValueOnce(null);

    const result = await handler(
      makeEvent({ path: "/v1/institutions/nope", pathParameters: { id: "nope" } }),
    );

    expect(result.statusCode).toBe(404);
  });
});

describe("router: GET /v1/institutions/search", () => {
  it("passes query and province/type filters through to the search handler", async () => {
    searchInstitutionsHandler.mockResolvedValueOnce({ query: "UCT", results: [], page: 1, pageSize: 25, total: 0 });

    const result = await handler(
      makeEvent({
        path: "/v1/institutions/search",
        queryStringParameters: { q: "UCT", province: "Western Cape" },
      }),
    );

    expect(searchInstitutionsHandler).toHaveBeenCalledWith("UCT", {
      province: "Western Cape",
      institutionType: undefined,
      page: undefined,
      pageSize: undefined,
    });
    expect(result.statusCode).toBe(200);
  });

  it("parses page/pageSize as numbers", async () => {
    searchInstitutionsHandler.mockResolvedValueOnce({ query: "UCT", results: [], page: 2, pageSize: 10, total: 0 });

    await handler(
      makeEvent({
        path: "/v1/institutions/search",
        queryStringParameters: { q: "UCT", page: "2", pageSize: "10" },
      }),
    );

    expect(searchInstitutionsHandler).toHaveBeenCalledWith("UCT", expect.objectContaining({ page: 2, pageSize: 10 }));
  });
});

describe("router: GET /v1/institutions/list", () => {
  it("parses page/pageSize as numbers", async () => {
    listInstitutions.mockResolvedValueOnce({ institutions: [], page: 2, pageSize: 10, total: 0 });

    await handler(
      makeEvent({ path: "/v1/institutions/list", queryStringParameters: { page: "2", pageSize: "10" } }),
    );

    expect(listInstitutions).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, pageSize: 10 }),
    );
  });
});

describe("router: POST /v1/institutions/verify", () => {
  it("parses the JSON body and delegates to verifyInstitution", async () => {
    verifyInstitution.mockResolvedValueOnce({ matched: true, confidence: "exact" });

    const result = await handler(
      makeEvent({
        httpMethod: "POST",
        path: "/v1/institutions/verify",
        body: JSON.stringify({ registrationNumber: "2000/HE07/015" }),
      }),
    );

    expect(verifyInstitution).toHaveBeenCalledWith({ registrationNumber: "2000/HE07/015" });
    expect(result.statusCode).toBe(200);
  });

  it("returns 400 for a malformed JSON body", async () => {
    const result = await handler(
      makeEvent({ httpMethod: "POST", path: "/v1/institutions/verify", body: "{not json" }),
    );

    expect(result.statusCode).toBe(400);
    expect(verifyInstitution).not.toHaveBeenCalled();
  });
});

describe("router: POST /v1/qualifications/verify", () => {
  it("delegates a single verify request", async () => {
    verifyQualificationHandler.mockResolvedValueOnce({ matched: true, confidence: "fuzzy" });

    const result = await handler(
      makeEvent({
        httpMethod: "POST",
        path: "/v1/qualifications/verify",
        body: JSON.stringify({ qualificationTitle: "BSc", institutionName: "X" }),
      }),
    );

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ matched: true, confidence: "fuzzy" });
  });
});

describe("router: POST /v1/qualifications/verify/batch", () => {
  it("allows a batch request for a tier with batch access, using its maxBatchSize", async () => {
    verifyQualificationBatch.mockResolvedValueOnce([{ matched: true, confidence: "exact" }]);

    const result = await handler(
      makeEvent({
        httpMethod: "POST",
        path: "/v1/qualifications/verify/batch",
        body: JSON.stringify({ items: [{ qualificationTitle: "BSc", institutionName: "X" }] }),
        requestContext: { identity: { apiKey: "dev-key" } } as unknown as APIGatewayProxyEvent["requestContext"],
      }),
    );

    expect(result.statusCode).toBe(200);
    expect(verifyQualificationBatch).toHaveBeenCalled();
  });

  it("returns 403 for a tier without batch access (no API key -> free tier)", async () => {
    const result = await handler(
      makeEvent({
        httpMethod: "POST",
        path: "/v1/qualifications/verify/batch",
        body: JSON.stringify({ items: [{ qualificationTitle: "BSc", institutionName: "X" }] }),
      }),
    );

    expect(result.statusCode).toBe(403);
    expect(verifyQualificationBatch).not.toHaveBeenCalled();
  });
});

describe("router: unknown route", () => {
  it("returns 404 for a path that matches nothing", async () => {
    const result = await handler(makeEvent({ path: "/v1/nonsense" }));
    expect(result.statusCode).toBe(404);
  });
});
