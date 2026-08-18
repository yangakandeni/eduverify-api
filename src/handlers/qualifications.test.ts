import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyQualification = vi.fn();

vi.mock("../matching/verifyQualification", () => ({
  verifyQualification: (...args: unknown[]) => verifyQualification(...args),
}));

const { verifyQualificationHandler, verifyQualificationBatch } = await import("./qualifications");

beforeEach(() => {
  verifyQualification.mockReset();
});

describe("verifyQualificationHandler", () => {
  it("delegates directly to the matcher for a single item", async () => {
    const request = { qualificationTitle: "Bachelor of Arts", institutionName: "Stellenbosch University" };
    verifyQualification.mockResolvedValueOnce({ matched: true, confidence: "exact" });

    const result = await verifyQualificationHandler(request);

    expect(verifyQualification).toHaveBeenCalledWith(request);
    expect(result).toEqual({ matched: true, confidence: "exact" });
  });
});

describe("verifyQualificationBatch", () => {
  it("verifies every item in the batch and returns results in the same order", async () => {
    verifyQualification
      .mockResolvedValueOnce({ matched: true, confidence: "exact" })
      .mockResolvedValueOnce({ matched: false, confidence: "none" });

    const results = await verifyQualificationBatch([
      { qualificationTitle: "Bachelor of Arts", institutionName: "Stellenbosch University" },
      { qualificationTitle: "Bachelor of Laws", institutionName: "Stellenbosch University" },
    ]);

    expect(results).toEqual([
      { matched: true, confidence: "exact" },
      { matched: false, confidence: "none" },
    ]);
  });

  it("rejects a batch larger than the given max size", async () => {
    const items = Array.from({ length: 5 }, () => ({ qualificationTitle: "x", institutionName: "y" }));

    await expect(verifyQualificationBatch(items, 3)).rejects.toThrow(/batch size/i);
    expect(verifyQualification).not.toHaveBeenCalled();
  });

  it("returns an empty array for an empty batch without calling the matcher", async () => {
    expect(await verifyQualificationBatch([])).toEqual([]);
    expect(verifyQualification).not.toHaveBeenCalled();
  });
});
