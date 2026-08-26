import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildOpenApiDocument, toYaml } from "../src/docs/generateOpenApi";
import { ROUTE_SPEC } from "../src/docs/routeSpec";

const OUT_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "docs", "openapi.yaml");

writeFileSync(OUT_PATH, toYaml(buildOpenApiDocument(ROUTE_SPEC, process.env.PORT ?? "3000")));
console.log(`Wrote ${OUT_PATH}`);
