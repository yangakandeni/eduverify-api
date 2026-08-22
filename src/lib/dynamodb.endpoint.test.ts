import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dynamoDBClientMock = vi.fn();
const sendMock = vi.fn();

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: dynamoDBClientMock,
}));

vi.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: { from: () => ({ send: sendMock }) },
  GetCommand: vi.fn(function GetCommand(input) {
    return { input };
  }),
  QueryCommand: vi.fn(function QueryCommand(input) {
    return { input };
  }),
}));

const ORIGINAL_ENDPOINT = process.env.DYNAMODB_ENDPOINT;

beforeEach(() => {
  dynamoDBClientMock.mockReset();
  sendMock.mockReset();
});

afterEach(() => {
  if (ORIGINAL_ENDPOINT === undefined) delete process.env.DYNAMODB_ENDPOINT;
  else process.env.DYNAMODB_ENDPOINT = ORIGINAL_ENDPOINT;
});

/** Local development (see scripts/dev-server.ts, scripts/seed-local-dynamodb.ts) points the
 * client at DynamoDB Local via DYNAMODB_ENDPOINT rather than the real AWS endpoint; production
 * never sets this env var, so getClient() must fall back to default AWS endpoint resolution
 * (and real credential resolution) when it's absent. */
describe("getClient DYNAMODB_ENDPOINT override", () => {
  it("passes the endpoint and dummy local credentials through when DYNAMODB_ENDPOINT is set", async () => {
    process.env.DYNAMODB_ENDPOINT = "http://localhost:8000";
    vi.resetModules();
    const { checkTableReachable } = await import("./dynamodb");
    sendMock.mockResolvedValueOnce({});

    await checkTableReachable();

    expect(dynamoDBClientMock).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "http://localhost:8000",
        credentials: { accessKeyId: "local", secretAccessKey: "local" },
      }),
    );
  });

  it("omits endpoint/credentials overrides when DYNAMODB_ENDPOINT is not set", async () => {
    delete process.env.DYNAMODB_ENDPOINT;
    vi.resetModules();
    const { checkTableReachable } = await import("./dynamodb");
    sendMock.mockResolvedValueOnce({});

    await checkTableReachable();

    const [config] = dynamoDBClientMock.mock.calls[0];
    expect(config).not.toHaveProperty("endpoint");
    expect(config).not.toHaveProperty("credentials");
  });
});
