import { createServer, type IncomingMessage } from "node:http";
import type { APIGatewayProxyEvent } from "aws-lambda";
import { handler } from "../src/router";

/** Local stand-in for API Gateway's proxy integration, so `src/router.ts` can be exercised via
 * curl/Postman against DynamoDB Local without any deployed infrastructure (none exists for this
 * repo yet — see CLAUDE.md). Translates a raw Node HTTP request into the same event shape
 * `router.ts` already unit-tests against (see router.test.ts's makeEvent), and the returned
 * APIGatewayProxyResult straight back onto the HTTP response. */

const PORT = Number(process.env.PORT ?? 3000);

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function toSingleValueHeaders(rawHeaders: IncomingMessage["headers"]): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(rawHeaders)) {
    if (typeof value === "string") headers[key] = value;
    else if (Array.isArray(value) && value.length > 0) headers[key] = value[0];
  }
  return headers;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const query: Record<string, string> = {};
  for (const [key, value] of url.searchParams.entries()) query[key] = value;

  const headers = toSingleValueHeaders(req.headers);
  const body = await readBody(req);

  const event = {
    httpMethod: req.method ?? "GET",
    path: url.pathname,
    resource: url.pathname,
    pathParameters: null,
    queryStringParameters: Object.keys(query).length > 0 ? query : null,
    multiValueQueryStringParameters: null,
    headers,
    multiValueHeaders: {},
    body: body.length > 0 ? body : null,
    isBase64Encoded: false,
    requestContext: { identity: { apiKey: headers["x-api-key"] ?? null } },
    stageVariables: null,
  } as unknown as APIGatewayProxyEvent;

  try {
    const result = await handler(event);
    res.writeHead(result.statusCode, result.headers as Record<string, string>);
    res.end(result.body);
  } catch (error) {
    console.error(error);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Internal error" }));
  }
});

server.listen(PORT, () => {
  console.log(`eduverify-api dev server: http://localhost:${PORT}`);
  console.log(`Try: curl http://localhost:${PORT}/v1/health`);
});
