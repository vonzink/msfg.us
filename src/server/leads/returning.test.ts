import { describe, expect, it } from "vitest";
import { resolveReturning } from "./returning";

describe("resolveReturning", () => {
  it("session match wins", () => {
    expect(resolveReturning({ sessionEmailMatches: true, priorLeadExists: true, ghlContactExists: false }))
      .toEqual({ returning: true, reason: "session" });
  });
  it("prior lead next", () => {
    expect(resolveReturning({ sessionEmailMatches: false, priorLeadExists: true, ghlContactExists: false }))
      .toEqual({ returning: true, reason: "prior-lead" });
  });
  it("ghl last", () => {
    expect(resolveReturning({ sessionEmailMatches: false, priorLeadExists: false, ghlContactExists: true }))
      .toEqual({ returning: true, reason: "ghl" });
  });
  it("no signals → not returning", () => {
    expect(resolveReturning({ sessionEmailMatches: false, priorLeadExists: false, ghlContactExists: false }))
      .toEqual({ returning: false, reason: null });
  });
});
