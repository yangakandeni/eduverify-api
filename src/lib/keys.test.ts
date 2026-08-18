import { describe, expect, it } from "vitest";
import { institutionKey } from "./keys";

// These assertions pin known slugs against real institution names (from eduverify's
// data/institutions.json at the time this repo was forked). If parser/dynamo_item.py's
// (Python) or web/lib/keys.ts's (TS) slugify algorithm ever changes without a matching
// change here, this test — and only this test, since there's no cross-repo CI — is what
// catches the drift before it silently breaks lookups by id against the shared table.
describe("institutionKey", () => {
  it("uses the registration number directly when present", () => {
    expect(institutionKey({ name: "AAA School of Advertising (Pty) Ltd", registration_number: "2000/HE07/015" })).toBe(
      "INST#2000/HE07/015",
    );
  });

  it("slugifies the name when there is no registration number", () => {
    expect(institutionKey({ name: "Empilweni Education (Pty) Ltd" })).toBe(
      "INST#NAME#EMPILWENI-EDUCATION-PTY-LTD",
    );
    expect(institutionKey({ name: "The Independent Institute of Education (Pty) Ltd" })).toBe(
      "INST#NAME#THE-INDEPENDENT-INSTITUTE-OF-EDUCATION-PTY-LTD",
    );
  });

  it("treats a null or missing registration number the same as absent", () => {
    expect(institutionKey({ name: "Empilweni Education (Pty) Ltd", registration_number: null })).toBe(
      "INST#NAME#EMPILWENI-EDUCATION-PTY-LTD",
    );
  });
});
