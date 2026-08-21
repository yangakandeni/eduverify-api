import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildOpenApiDocument, toYaml } from "./generateOpenApi";
import { ROUTE_SPEC } from "./routeSpec";

const DOCS_YAML_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "docs", "openapi.yaml");

describe("buildOpenApiDocument", () => {
  const document = buildOpenApiDocument(ROUTE_SPEC);

  it("has a paths entry for every route in ROUTE_SPEC", () => {
    for (const route of ROUTE_SPEC) {
      expect(document.paths, `missing path ${route.path}`).toHaveProperty(route.path);
      expect(document.paths[route.path], `missing ${route.method} ${route.path}`).toHaveProperty(
        route.method.toLowerCase(),
      );
    }
  });

  it("resolves every requestType/response type/query type referenced in ROUTE_SPEC to a component schema", () => {
    const referenced = new Set<string>(["ErrorResponse"]);
    for (const route of ROUTE_SPEC) {
      if (route.requestType) referenced.add(route.requestType);
      for (const response of route.responses) if (response.type) referenced.add(response.type);
      for (const query of route.query ?? []) if (query.type) referenced.add(query.type);
    }

    for (const typeName of referenced) {
      expect(document.components.schemas, `missing component schema for ${typeName}`).toHaveProperty(typeName);
    }
  });

  it("overrides security to none only for the unauthenticated routes", () => {
    const unauthenticatedPaths = ROUTE_SPEC.filter((r) => !r.auth).map((r) => r.path);
    expect(new Set(unauthenticatedPaths)).toEqual(new Set(["/v1/health", "/v1/docs", "/v1/openapi.yaml"]));

    for (const route of ROUTE_SPEC) {
      const operation = document.paths[route.path][route.method.toLowerCase()] as { security?: unknown[] };
      if (route.auth) {
        expect(operation.security).toBeUndefined();
      } else {
        expect(operation.security).toEqual([]);
      }
    }
  });

  it("matches the checked-in docs/openapi.yaml exactly (run `npm run docs:generate` if this fails)", () => {
    const generated = toYaml(document);
    const checkedIn = readFileSync(DOCS_YAML_PATH, "utf-8");
    expect(generated).toBe(checkedIn);
  });
});
