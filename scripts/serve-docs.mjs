import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const docsDir = fileURLToPath(new URL("../docs", import.meta.url));
const port = Number(process.env.PORT ?? 4000);

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".yaml": "text/yaml; charset=utf-8",
  ".yml": "text/yaml; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

const server = createServer(async (req, res) => {
  const requestPath = new URL(req.url ?? "/", "http://localhost").pathname;
  const relativePath = requestPath === "/" ? "/index.html" : requestPath;
  const filePath = normalize(join(docsDir, relativePath));

  if (!filePath.startsWith(docsDir)) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  try {
    const body = await readFile(filePath);
    const contentType = CONTENT_TYPES[extname(filePath)] ?? "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType }).end(body);
  } catch {
    res.writeHead(404).end("Not found");
  }
});

server.listen(port, () => {
  console.log(`API docs: http://localhost:${port}`);
});
