import { describe, it, expect } from "vitest";
import { roleSatisfies, parseEmailAllowlist, isBootstrapAdmin } from "./roles";

describe("roleSatisfies", () => {
  it("platform admin always satisfies", () => {
    expect(roleSatisfies(null, "OWNER", true)).toBe(true);
  });
  it("null role never satisfies for non-platform users", () => {
    expect(roleSatisfies(null, "VIEWER", false)).toBe(false);
  });
  it("EDITOR meets EDITOR but not ADMIN", () => {
    expect(roleSatisfies("EDITOR", "EDITOR", false)).toBe(true);
    expect(roleSatisfies("EDITOR", "ADMIN", false)).toBe(false);
  });
  it("OWNER meets lower roles", () => {
    expect(roleSatisfies("OWNER", "ADMIN", false)).toBe(true);
  });
});

describe("parseEmailAllowlist", () => {
  it("returns [] for undefined", () => {
    expect(parseEmailAllowlist(undefined)).toEqual([]);
  });
  it("splits, trims, lowercases, drops blanks", () => {
    expect(parseEmailAllowlist("A@x.com, b@Y.com ,")).toEqual(["a@x.com", "b@y.com"]);
  });
});

describe("isBootstrapAdmin", () => {
  it("matches case-insensitively", () => {
    expect(isBootstrapAdmin("Owner@MSFG.us", ["owner@msfg.us"])).toBe(true);
  });
  it("is false when not listed or email missing", () => {
    expect(isBootstrapAdmin("x@y.com", ["owner@msfg.us"])).toBe(false);
    expect(isBootstrapAdmin(undefined, ["owner@msfg.us"])).toBe(false);
  });
});
