import { cpSync, rmSync } from "node:fs";
import { join } from "node:path";

const sourceDocsPath = join(process.cwd(), "docs");
const distDocsPath = join(process.cwd(), "dist", "docs");

// Idempotent: wipe any previous copy before recreating it.
rmSync(distDocsPath, { recursive: true, force: true });

cpSync(sourceDocsPath, distDocsPath, { recursive: true });

console.log(`Copied ${sourceDocsPath} -> ${distDocsPath}`);
