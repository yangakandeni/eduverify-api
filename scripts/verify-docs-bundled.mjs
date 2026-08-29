import { statSync } from "node:fs";
import { join } from "node:path";

const requiredFiles = [
  join(process.cwd(), "dist", "docs", "index.html"),
  join(process.cwd(), "dist", "docs", "openapi.yaml"),
];

const problems = [];

for (const filePath of requiredFiles) {
  let stats;
  try {
    stats = statSync(filePath);
  } catch {
    problems.push(`missing: ${filePath}`);
    continue;
  }

  if (!stats.isFile() || stats.size === 0) {
    problems.push(`empty: ${filePath}`);
  }
}

if (problems.length > 0) {
  console.error(
    "docs/ was not bundled into dist/docs correctly:\n" +
      problems.map((p) => `  - ${p}`).join("\n") +
      "\n\n" +
      "The deployed Lambda package only ships dist/, so src/handlers/docs.ts (which reads " +
      "docs/index.html and docs/openapi.yaml relative to process.cwd()) will throw ENOENT at " +
      "runtime. GET /v1/docs and GET /v1/openapi.yaml will return 500 Internal error in " +
      "production. Run `node scripts/copy-docs.mjs` (or `npm run build`) to fix this before " +
      "deploying."
  );
  process.exit(1);
}

console.log("docs/ bundled correctly into dist/docs.");
