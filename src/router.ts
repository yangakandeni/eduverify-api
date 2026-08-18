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

function institutionIdFromPath(event: APIGatewayProxyEvent): string {
  if (event.pathParameters?.id) return event.pathParameters.id;
  const segments = event.path.split("/").filter(Boolean);
  return decodeURIComponent(segments[segments.length - 1] ?? "");
}

/** Single-Lambda internal router (per Part 2's infra decision) — one entry point behind API
 * Gateway's proxy integration. Ordered so exact-match routes (search, list, verify) are checked
 * before the GET /v1/institutions/{id} catch-all, which would otherwise swallow them too. */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const method = event.httpMethod;
  const path = event.path;
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
    return json(500, { error: "Internal error" });
  }
}
