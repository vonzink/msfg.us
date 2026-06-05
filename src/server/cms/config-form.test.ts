import { describe, it, expect } from "vitest";
import { mergeConfig } from "./config-form";

describe("mergeConfig", () => {
  it("overrides scalars within a section, preserving untouched siblings", () => {
    const base = { brand: { shortName: "A", legalName: "L" }, features: { x: true } };
    expect(mergeConfig(base, { brand: { shortName: "B" } })).toEqual({
      brand: { shortName: "B", legalName: "L" },
      features: { x: true },
    });
  });
  it("replaces arrays wholesale", () => {
    expect(mergeConfig({ seo: { keywords: ["a", "b"] } }, { seo: { keywords: ["c"] } })).toEqual({
      seo: { keywords: ["c"] },
    });
  });
  it("adds new sections", () => {
    expect(mergeConfig({}, { features: { y: false } })).toEqual({ features: { y: false } });
  });
});
