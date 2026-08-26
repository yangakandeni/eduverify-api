import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { getInstitution, listInstitutions, searchInstitutionsHandler } from "./handlers/institutions";
import { verifyQualificationBatch, verifyQualificationHandler } from "./handlers/qualifications";
import { verifyInstitution } from "./handlers/verify";
import { checkHealth } from "./handlers/health";
import { getStats } from "./handlers/stats";
import { getDocsHtml, getOpenApiYaml } from "./handlers/docs";
import { KEY_TIERS } from "./keyTiers";
import type { InstitutionType } from "./lib/types";
import { resolveTier } from "./tiers";

/** Wire shape of every non-2xx JSON body this router returns — see docs/openapi.yaml, generated
 * from this type via src/docs/generateOpenApi.ts. */
export interface ErrorResponse {
  error: string;
}

function json(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function text(statusCode: number, contentType: string, body: string): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { "Content-Type": contentType },
    body,
  };
}

function parseBody(event: APIGatewayProxyEvent): unknown {
  if (!event.body) return {};
  try {
    return JSON.parse(event.body);
  } catch {
    throw new BadRequestError("Request body must be valid JSON");
  }
}

class BadRequestError extends Error {}

interface AccessLogEntry {
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  apiKeyId: string | null;
  tier: string;
}

/** 5xx -> error, 4xx -> warn, everything else -> log (info) — so a log aggregator's
 * severity filter reflects request outcome instead of every access line reading as "info".
 * Logs `apiKeyId` (API Gateway's non-secret key identifier), never the raw `identity.apiKey`
 * value — that field carries the caller's actual credential and must not end up in logs. */
function logAccess(entry: AccessLogEntry): void {
  const payload = JSON.stringify(entry);
  if (entry.statusCode >= 500) {
    console.error(payload);
  } else if (entry.statusCode >= 400) {
    console.warn(payload);
  } else {
    console.log(payload);
  }
}

function institutionIdFromPath(event: APIGatewayProxyEvent): string {
  if (event.pathParameters?.id) return event.pathParameters.id;
  const segments = event.path.split("/").filter(Boolean);
  return decodeURIComponent(segments[segments.length - 1] ?? "");
}

/** Single Lambda internal - one entry point behind API Gateway's proxy integration.
 * Ordered so exact-match routes (search, list, verify) are checked before
 * the GET /v1/institutions/{id} catch-all, which would otherwise swallow them too. */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const method = event.httpMethod;
  const path = event.path;
  const start = Date.now();

  const result = await route(event, method, path);

  const identity = event.requestContext?.identity;
  const tierConfig = resolveTier(identity?.apiKey ?? undefined, KEY_TIERS);
  logAccess({
    method,
    path,
    statusCode: result.statusCode,
    durationMs: Date.now() - start,
    apiKeyId: identity?.apiKeyId ?? null,
    tier: tierConfig.tier,
  });
  return result;
}

async function route(
  event: APIGatewayProxyEvent,
  method: string,
  path: string,
): Promise<APIGatewayProxyResult> {
  const query = event.queryStringParameters ?? {};

  try {
    if (method === "GET" && path === "/v1/health") {
      return json(200, await checkHealth());
    }

    if (method === "GET" && path === "/v1/stats") {
      return json(200, await getStats());
    }

    if (method === "GET" && path === "/v1/docs") {
      return text(200, "text/html; charset=utf-8", await getDocsHtml());
    }

    if (method === "GET" && path === "/v1/openapi.yaml") {
      return text(200, "text/yaml; charset=utf-8", await getOpenApiYaml());
    }

    if (method === "GET" && path === "/v1/institutions/search") {
      const results = await searchInstitutionsHandler(query.q ?? "", {
        province: query.province,
        institutionType: query.type as InstitutionType | undefined,
        page: query.page ? Number(query.page) : undefined,
        pageSize: query.pageSize ? Number(query.pageSize) : undefined,
      });
      return json(200, results);
    }

    if (method === "GET" && path === "/v1/institutions/list") {
      const result = await listInstitutions({
        page: query.page ? Number(query.page) : undefined,
        pageSize: query.pageSize ? Number(query.pageSize) : undefined,
        province: query.province,
        institutionType: query.type as InstitutionType | undefined,
        status: query.status,
        fields: query.fields === "full" ? "full" : undefined,
      });
      return json(200, result);
    }

    if (method === "POST" && path === "/v1/institutions/verify") {
      const body = parseBody(event) as Parameters<typeof verifyInstitution>[0];
      return json(200, await verifyInstitution(body));
    }

    if (method === "POST" && path === "/v1/qualifications/verify/batch") {
      const apiKey = event.requestContext?.identity?.apiKey ?? undefined;
      const tierConfig = resolveTier(apiKey, KEY_TIERS);
      if (!tierConfig.allowBatch) {
        return json(403, { error: "Batch verification is not available on your tier" });
      }
      const body = parseBody(event) as { items?: Parameters<typeof verifyQualificationBatch>[0] };
      const results = await verifyQualificationBatch(body.items ?? [], tierConfig.maxBatchSize);
      return json(200, { results });
    }

    if (method === "POST" && path === "/v1/qualifications/verify") {
      const body = parseBody(event) as Parameters<typeof verifyQualificationHandler>[0];
      return json(200, await verifyQualificationHandler(body));
    }

    if (method === "GET" && /^\/v1\/institutions\/[^/]+$/.test(path)) {
      const institution = await getInstitution(institutionIdFromPath(event));
      return institution ? json(200, { institution }) : json(404, { error: "Not found" });
    }

    return json(404, { error: "Not found" });
  } catch (error) {
    if (error instanceof BadRequestError) {
      return json(400, { error: error.message });
    }
    if (error instanceof Error && /batch size/i.test(error.message)) {
      return json(400, { error: error.message });
    }
    console.error(error);
    return json(500, { error: "Internal error" });
  }
}
