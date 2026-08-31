import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.fn();

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: vi.fn(),
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

const { STATUS_PARTITIONS, getAllInstitutionsCached, __resetInstitutionsCacheForTests } = await import("./dynamodb");

function itemFor(status: string, id: string, name: string) {
  return { PK: id, GSI1PK: status, GSI1SK: name, name, faculties_and_programmes: [] };
}

beforeEach(() => {
  sendMock.mockReset();
  __resetInstitutionsCacheForTests();
});

describe("getAllInstitutionsCached", () => {
  it("fetches every status partition once on a cache miss and returns the deduped merged array", async () => {
    sendMock.mockImplementation(async (command: { input: { ExpressionAttributeValues: Record<string, string> } }) => {
      const status = command.input.ExpressionAttributeValues[":status"];
      return status === "REGISTERED" ? { Items: [itemFor("REGISTERED", "INST#1", "A")] } : { Items: [] };
    });

    const result = await getAllInstitutionsCached();

    expect(sendMock).toHaveBeenCalledTimes(STATUS_PARTITIONS.length);
    expect(result.map((r) => r.id)).toEqual(["INST#1"]);
  });

  it("serves a second call within the TTL window from cache without calling send again", async () => {
    sendMock.mockResolvedValue({ Items: [] });

    await getAllInstitutionsCached();
    const callsAfterFirst = sendMock.mock.calls.length;
    await getAllInstitutionsCached();

    expect(sendMock).toHaveBeenCalledTimes(callsAfterFirst);
  });

  it("re-fetches once the default TTL has elapsed", async () => {
    vi.useFakeTimers();
    try {
      sendMock.mockResolvedValue({ Items: [] });

      await getAllInstitutionsCached();
      const callsAfterFirst = sendMock.mock.calls.length;

      await vi.advanceTimersByTimeAsync(300_001);

      await getAllInstitutionsCached();
      expect(sendMock.mock.calls.length).toBeGreaterThan(callsAfterFirst);
    } finally {
      vi.useRealTimers();
    }
  });

  it("shares one in-flight fetch across two concurrent calls made before the first resolves", async () => {
    const resolvers: Array<(value: { Items: unknown[] }) => void> = [];
    sendMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        })
    );

    const first = getAllInstitutionsCached();
    const second = getAllInstitutionsCached();

    expect(sendMock).toHaveBeenCalledTimes(STATUS_PARTITIONS.length);

    resolvers.forEach((resolve) => resolve({ Items: [] }));
    await Promise.all([first, second]);

    expect(sendMock).toHaveBeenCalledTimes(STATUS_PARTITIONS.length);
  });

  it("clears the cache on a rejected fetch so the next call retries instead of replaying the rejection", async () => {
    sendMock.mockRejectedValueOnce(new Error("boom")).mockResolvedValue({ Items: [] });

    await expect(getAllInstitutionsCached()).rejects.toThrow("boom");
    const callsAfterFirst = sendMock.mock.calls.length;
    expect(callsAfterFirst).toBe(STATUS_PARTITIONS.length);

    const result = await getAllInstitutionsCached();

    expect(sendMock.mock.calls.length).toBeGreaterThan(callsAfterFirst);
    expect(result).toEqual([]);
  });

  it("dedupes an institution id appearing in two different partitions' responses", async () => {
    sendMock.mockImplementation(async (command: { input: { ExpressionAttributeValues: Record<string, string> } }) => {
      const status = command.input.ExpressionAttributeValues[":status"];
      if (status === "REGISTERED") return { Items: [itemFor("REGISTERED", "INST#1", "A")] };
      if (status === "CANCELLED") return { Items: [itemFor("CANCELLED", "INST#1", "A (cancelled copy)")] };
      return { Items: [] };
    });

    const result = await getAllInstitutionsCached();

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("INST#1");
  });
});

describe("EDUVERIFY_INSTITUTIONS_CACHE_TTL_MS override", () => {
  const ORIGINAL_TTL = process.env.EDUVERIFY_INSTITUTIONS_CACHE_TTL_MS;

  afterEach(() => {
    if (ORIGINAL_TTL === undefined) delete process.env.EDUVERIFY_INSTITUTIONS_CACHE_TTL_MS;
    else process.env.EDUVERIFY_INSTITUTIONS_CACHE_TTL_MS = ORIGINAL_TTL;
  });

  it("follows a custom TTL from the env var instead of the 300_000ms default", async () => {
    process.env.EDUVERIFY_INSTITUTIONS_CACHE_TTL_MS = "1000";
    vi.resetModules();
    const {
      getAllInstitutionsCached: getCachedWithCustomTtl,
      __resetInstitutionsCacheForTests: resetCustomTtlCache,
    } = await import("./dynamodb");
    resetCustomTtlCache();

    vi.useFakeTimers();
    try {
      sendMock.mockResolvedValue({ Items: [] });

      await getCachedWithCustomTtl();
      const callsAfterFirst = sendMock.mock.calls.length;

      await vi.advanceTimersByTimeAsync(500);
      await getCachedWithCustomTtl();
      expect(sendMock.mock.calls.length).toBe(callsAfterFirst);

      await vi.advanceTimersByTimeAsync(600);
      await getCachedWithCustomTtl();
      expect(sendMock.mock.calls.length).toBeGreaterThan(callsAfterFirst);
    } finally {
      vi.useRealTimers();
    }
  });
});
