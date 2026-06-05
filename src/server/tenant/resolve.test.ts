import { describe, it, expect } from "vitest";
import { resolveTenantSlug } from "./resolve";

describe("resolveTenantSlug", () => {
  it("strips www + port and lowercases before mapping", () => {
    // The host is normalized (lowercased, port + leading www. removed) and then
    // looked up in the domain map — so a map keyed on the normalized host hits.
    expect(resolveTenantSlug("WWW.msfg.us:3000", { "msfg.us": "msfg" })).toBe("msfg");
  });
  it("returns null when the normalized host is not in the map", () => {
    expect(resolveTenantSlug("WWW.msfg.us:3000", {})).toBeNull();
  });
  it("maps a known host via the domain map", () => {
    expect(resolveTenantSlug("acme.com", { "acme.com": "acme" })).toBe("acme");
  });
  it("returns null for an unknown host", () => {
    expect(resolveTenantSlug("nope.example", {})).toBeNull();
  });
});
