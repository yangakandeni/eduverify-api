import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** GET /v1/docs (Swagger UI) and GET /v1/openapi.yaml (the spec docs/index.html fetches via a
 * relative "./openapi.yaml" reference — which resolves to exactly this path from a /v1/docs
 * page URL with no trailing slash) — served straight from the checked-in docs/ directory so
 * the same interactive "Try it out" page works no matter how the API is being run (npm run
 * dev's local proxy today, or API Gateway/Lambda once infra is deployed), instead of requiring
 * the separate `npm run docs` static server just to test the API.
 *
 * Resolves against process.cwd() rather than this module's own file location: that's stable
 * whether this file runs directly (tsx, vitest) or bundled by esbuild into a single
 * dist/index.cjs, where import.meta.url would point at the bundle's own path instead of this
 * source file's. Both dev entrypoints and the Lambda runtime execute with cwd at the project
 * root (or the Lambda package root, once docs/ ships alongside dist/index.cjs there too). */
const DOCS_DIR = join(process.cwd(), "docs");

export async function getDocsHtml(): Promise<string> {
  return readFile(join(DOCS_DIR, "index.html"), "utf-8");
}

export async function getOpenApiYaml(): Promise<string> {
  return readFile(join(DOCS_DIR, "openapi.yaml"), "utf-8");
}
