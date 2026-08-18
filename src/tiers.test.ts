import { describe, expect, it } from "vitest";
import { getTierConfig, resolveTier } from "./tiers";

describe("getTierConfig", () => {
  it("gives the internal tier (EduVerify itself) unrestricted batch access", () => {
    expect(getTierConfig("internal")).toEqual({
      tier: "internal",
      allowBatch: true,
      maxBatchSize: 100,
      allowAllFrameworks: true,
    });
  });

  it("gives the free tier no batch access at all, per the plan's tier-gating decision", () => {
    const config = getTierConfig("free");
    expect(config.allowBatch).toBe(false);
    expect(config.maxBatchSize).toBe(1);
  });

  it("gives developer and business tiers batch access with different limits", () => {
    expect(getTierConfig("developer").allowBatch).toBe(true);
    expect(getTierConfig("business").allowBatch).toBe(true);
    expect(getTierConfig("business").maxBatchSize).toBeGreaterThan(getTierConfig("developer").maxBatchSize);
  });
});

describe("resolveTier", () => {
  it("resolves a known API key to its configured tier", () => {
    expect(resolveTier("dev-key-1", { "dev-key-1": "developer" })).toEqual(getTierConfig("developer"));
  });

  it("falls back to the free tier for an unrecognized key", () => {
    expect(resolveTier("unknown-key", { "dev-key-1": "developer" })).toEqual(getTierConfig("free"));
  });

  it("falls back to the free tier when no API key is present at all", () => {
    expect(resolveTier(undefined, {})).toEqual(getTierConfig("free"));
  });
});
