import { beforeEach, describe, expect, it, vi } from "vitest";

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

const { queryAllByStatus, checkTableReachable } = await import("./dynamodb");

beforeEach(() => {
  sendMock.mockReset();
});

describe("queryAllByStatus", () => {
  it("follows LastEvaluatedKey until exhausted, returning every item across pages", async () => {
    sendMock
      .mockResolvedValueOnce({
        Items: [{ PK: "INST#1", GSI1PK: "REGISTERED", GSI1SK: "A", name: "A", faculties_and_programmes: [] }],
        LastEvaluatedKey: { PK: "INST#1" },
      })
      .mockResolvedValueOnce({
        Items: [{ PK: "INST#2", GSI1PK: "REGISTERED", GSI1SK: "B", name: "B", faculties_and_programmes: [] }],
      });

    const result = await queryAllByStatus("REGISTERED");

    expect(result.map((r) => r.id)).toEqual(["INST#1", "INST#2"]);
    expect(sendMock).toHaveBeenCalledTimes(2);
  });

  it("returns an empty array when the partition has no items", async () => {
    sendMock.mockResolvedValueOnce({ Items: [] });

    expect(await queryAllByStatus("UNKNOWN")).toEqual([]);
  });
});

describe("checkTableReachable", () => {
  it("returns true when the client responds without throwing", async () => {
    sendMock.mockResolvedValueOnce({});
    expect(await checkTableReachable()).toBe(true);
  });

  it("returns false when the client throws", async () => {
    sendMock.mockRejectedValueOnce(new Error("timeout"));
    expect(await checkTableReachable()).toBe(false);
  });
});
