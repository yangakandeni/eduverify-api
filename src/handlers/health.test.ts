import { beforeEach, describe, expect, it, vi } from "vitest";

const checkTableReachable = vi.fn();

vi.mock("../lib/dynamodb", () => ({
  checkTableReachable: (...args: unknown[]) => checkTableReachable(...args),
}));

const { checkHealth } = await import("./health");

beforeEach(() => {
  checkTableReachable.mockReset();
});

describe("checkHealth", () => {
  it("reports ok when the table is reachable", async () => {
    checkTableReachable.mockResolvedValueOnce(true);
    expect(await checkHealth()).toEqual({ status: "ok", dynamodb: true });
  });

  it("reports degraded when the table is not reachable", async () => {
    checkTableReachable.mockResolvedValueOnce(false);
    expect(await checkHealth()).toEqual({ status: "degraded", dynamodb: false });
  });
});
