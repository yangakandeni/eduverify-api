import { describe, expect, it } from "vitest";
import { levenshteinDistance, matchesQualificationSearch } from "./qualificationSearch";

describe("levenshteinDistance", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshteinDistance("education", "education")).toBe(0);
  });

  it("returns 1 for a single insertion, deletion, or substitution", () => {
    expect(levenshteinDistance("education", "eucation")).toBe(1);
    expect(levenshteinDistance("cat", "cats")).toBe(1);
    expect(levenshteinDistance("cat", "bat")).toBe(1);
  });

  it("returns the length of the other string when one side is empty", () => {
    expect(levenshteinDistance("", "education")).toBe(9);
    expect(levenshteinDistance("education", "")).toBe(9);
  });
});

describe("matchesQualificationSearch", () => {
  it("matches an exact substring, preserving today's behavior", () => {
    expect(matchesQualificationSearch("Diploma in Education", "diploma")).toBe(true);
  });

  it("matches every non-empty query, and everything for an empty query", () => {
    expect(matchesQualificationSearch("Diploma in Education", "")).toBe(true);
  });

  it("tolerates a minor spelling mistake in the query", () => {
    expect(matchesQualificationSearch("Diploma in Education", "diploma eucation")).toBe(true);
  });

  it("matches regardless of query word order", () => {
    expect(matchesQualificationSearch("Diploma in Education", "diploma education")).toBe(true);
    expect(matchesQualificationSearch("Diploma in Education", "education diploma")).toBe(true);
  });

  it("requires every query word to be present, rejecting an unrelated title", () => {
    expect(matchesQualificationSearch("Diploma in Education", "bachelor commerce")).toBe(false);
  });

  it("expands 'phd' to match any doctorate, not just Philosophy specifically", () => {
    expect(matchesQualificationSearch("Doctor of Accountancy", "phd")).toBe(true);
    expect(matchesQualificationSearch("Doctor of Philosophy in Education", "phd")).toBe(true);
    expect(matchesQualificationSearch("Diploma in Business", "phd")).toBe(false);
  });

  it("expands 'bsc' to require both 'bachelor' and 'science'", () => {
    expect(matchesQualificationSearch("Bachelor of Science in Physics", "bsc")).toBe(true);
    expect(matchesQualificationSearch("Bachelor of Arts in History", "bsc")).toBe(false);
  });

  it("expands 'ba' to match either Bachelor of Arts or Bachelor of Architecture", () => {
    expect(matchesQualificationSearch("Bachelor of Arts in History", "ba")).toBe(true);
    expect(matchesQualificationSearch("Bachelor of Architecture", "ba")).toBe(true);
  });

  it("expands 'nd' and 'hnd' identically to National Diploma", () => {
    expect(matchesQualificationSearch("National Diploma in Engineering", "nd")).toBe(true);
    expect(matchesQualificationSearch("National Diploma in Engineering", "hnd")).toBe(true);
  });

  it("expands 'ma' to Master of Arts and 'msc' to Master of Science", () => {
    expect(matchesQualificationSearch("Master of Arts in Linguistics", "ma")).toBe(true);
    expect(matchesQualificationSearch("Master of Science in Chemistry", "msc")).toBe(true);
    expect(matchesQualificationSearch("Master of Science in Chemistry", "ma")).toBe(false);
  });

  it("does not let a stray single-character token false-positive match an abbreviation", () => {
    expect(matchesQualificationSearch("Diploma: 3-D Design and Digital Animation", "phd")).toBe(false);
  });

  it("does not fuzzily cross-match unrelated subjects that share a suffix", () => {
    expect(matchesQualificationSearch("Bachelor of Science in Geology", "biology")).toBe(false);
  });

  it("does not give a mistyped abbreviation special expansion treatment", () => {
    expect(matchesQualificationSearch("Doctor of Philosophy", "phdd")).toBe(false);
  });

  it("expands 'it' to require both 'information' and 'technology'", () => {
    expect(matchesQualificationSearch("Bachelor of Science in Information Technology", "it")).toBe(true);
    expect(matchesQualificationSearch("Diploma in Business", "it")).toBe(false);
  });
});
