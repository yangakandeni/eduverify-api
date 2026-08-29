import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createGenerator } from "ts-json-schema-generator";
import { dump } from "js-yaml";
import type { QueryParamSpec, ResponseSpec, RouteSpec, WrapSpec } from "./routeSpec";

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export interface OpenApiDocument {
  openapi: string;
  info: Record<string, unknown>;
  servers: Record<string, unknown>[];
  tags: { name: string }[];
  security: Record<string, unknown>[];
  paths: Record<string, Record<string, unknown>>;
  components: {
    schemas: Record<string, unknown>;
    securitySchemes: Record<string, unknown>;
  };
}

/** Remaps every `#/definitions/X` produced by ts-json-schema-generator to the OpenAPI
 * convention `#/components/schemas/X`, and downgrades JSON Schema 2020-12's array-valued `type`
 * (e.g. `type: ["string", "null"]`, emitted for `string | null` unions) to OpenAPI 3.0's
 * single-string `type` plus a sibling `nullable: true` — OpenAPI 3.0 validators reject an array
 * `type`. Applied recursively. */
function remapRefs(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(remapRefs);
  if (node && typeof node === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === "$ref" && typeof value === "string") {
        result[key] = value.replace("#/definitions/", "#/components/schemas/");
      } else if (key === "type" && Array.isArray(value)) {
        const nonNullTypes = value.filter((t) => t !== "null");
        if (nonNullTypes.length === 1) result[key] = nonNullTypes[0];
        else result[key] = nonNullTypes;
        if (value.includes("null")) result.nullable = true;
      } else {
        result[key] = remapRefs(value);
      }
    }
    return result;
  }
  return node;
}

/** Generates JSON Schema for each named TS type (by calling ts-json-schema-generator once per
 * root type and merging its `definitions`) so response/request shapes come from the actual
 * exported interfaces in src/lib/types.ts, src/handlers/*.ts, src/matching/verifyQualification.ts,
 * and src/router.ts, instead of being retyped by hand. */
function buildComponentSchemas(typeNames: string[]): Record<string, unknown> {
  const generator = createGenerator({
    path: join(PROJECT_ROOT, "src/**/*.ts"),
    tsconfig: join(PROJECT_ROOT, "tsconfig.json"),
    skipTypeCheck: true,
    expose: "export",
    topRef: true,
  });

  const schemas: Record<string, unknown> = {};
  for (const typeName of typeNames) {
    const schema = generator.createSchema(typeName);
    const definitions = (schema.definitions ?? {}) as Record<string, unknown>;
    for (const [name, definition] of Object.entries(definitions)) {
      schemas[name] = remapRefs(definition);
    }
  }
  return schemas;
}

function wrapSchema(ref: { $ref: string }, wrap: WrapSpec | undefined): unknown {
  if (!wrap) return ref;
  return {
    type: "object",
    required: [wrap.key],
    properties: { [wrap.key]: wrap.array ? { type: "array", items: ref } : ref },
  };
}

function buildResponses(responses: ResponseSpec[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const response of responses) {
    const schema = response.type ? wrapSchema({ $ref: `#/components/schemas/${response.type}` }, response.wrap) : undefined;
    const contentType = response.contentType ?? (schema ? "application/json" : undefined);
    out[String(response.status)] = {
      description: response.description,
      ...(contentType ? { content: { [contentType]: schema ? { schema } : {} } } : {}),
    };
  }
  return out;
}

function buildParameters(route: RouteSpec): Record<string, unknown>[] {
  const pathParams = (route.pathParams ?? []).map((param) => ({
    name: param.name,
    in: "path",
    required: true,
    ...(param.description ? { description: param.description } : {}),
    schema: { type: "string" },
  }));

  const queryParams = (route.query ?? []).map((query: QueryParamSpec) => ({
    name: query.name,
    in: "query",
    ...(query.description ? { description: query.description } : {}),
    schema: query.type ? { $ref: `#/components/schemas/${query.type}` } : query.schema,
    ...(query.example ? { example: query.example } : {}),
  }));

  return [...pathParams, ...queryParams];
}

function buildRequestBody(route: RouteSpec): Record<string, unknown> | undefined {
  if (!route.requestType) return undefined;
  const schema = wrapSchema({ $ref: `#/components/schemas/${route.requestType}` }, route.requestWrap);
  return { required: true, content: { "application/json": { schema } } };
}

function collectReferencedTypeNames(routes: RouteSpec[]): string[] {
  const typeNames = new Set<string>(["ErrorResponse"]);
  for (const route of routes) {
    if (route.requestType) typeNames.add(route.requestType);
    for (const response of route.responses) if (response.type) typeNames.add(response.type);
    for (const query of route.query ?? []) if (query.type) typeNames.add(query.type);
  }
  return [...typeNames];
}

export function buildOpenApiDocument(routes: RouteSpec[], port: string = "3000"): OpenApiDocument {
  const schemas = buildComponentSchemas(collectReferencedTypeNames(routes));

  const paths: Record<string, Record<string, unknown>> = {};
  for (const route of routes) {
    const parameters = buildParameters(route);
    const requestBody = buildRequestBody(route);
    paths[route.path] ??= {};
    paths[route.path][route.method.toLowerCase()] = {
      operationId: route.operationId,
      tags: route.tags,
      summary: route.summary,
      ...(route.description ? { description: route.description } : {}),
      ...(route.auth ? {} : { security: [] }),
      ...(parameters.length ? { parameters } : {}),
      ...(requestBody ? { requestBody } : {}),
      responses: buildResponses(route.responses),
    };
  }

  const tags = [...new Set(routes.flatMap((route) => route.tags))].map((name) => ({ name }));

  return {
    openapi: "3.0.3",
    info: {
      title: "EduVerify API",
      description:
        "Verification API for South African institutions and qualifications.<br/>Every route requires the `x-api-key` header except " +
        "`/v1/health`, `/v1/docs`, and `/v1/openapi.yaml`.",
      version: "0.0.1",
    },
    servers: [
      {
        url: "http://localhost:{port}",
        description: "Local dev server (npm run dev)",
        variables: {
          port: { default: port },
        },
      },
      {
        url: "https://iw1e0x36ma.execute-api.af-south-1.amazonaws.com/{stage}",
        description: "API Gateway ID",
        variables: {
          // apiId: { default: "your-api-id" },
          stage: { default: "staging", enum: ["staging", "production"] },
        },
      },
    ],
    tags,
    security: [{ ApiKeyAuth: [] }],
    paths,
    components: {
      schemas,
      securitySchemes: { ApiKeyAuth: { type: "apiKey", in: "header", name: "x-api-key" } },
    },
  };
}

export function toYaml(document: OpenApiDocument): string {
  return dump(document, { noRefs: true, lineWidth: 100 });
}
