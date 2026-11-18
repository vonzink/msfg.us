import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CALCULATORS, enabledCalculators, isCalculatorEnabled } from "./registry";

describe("calculator registry", () => {
  it("derives every path from its slug, with no duplicates", () => {
    for (const c of CALCULATORS) expect(c.path).toBe(`/calculators/${c.slug}`);
    expect(new Set(CALCULATORS.map((c) => c.slug)).size).toBe(CALCULATORS.length);
  });

  it("has a source folder for every entry", () => {
    for (const c of CALCULATORS) {
      expect(fs.existsSync(path.join(process.cwd(), "src", "calculators", c.slug)), c.slug).toBe(true);
    }
  });

  it("lists the Mortgage calculator first", () => {
    expect(CALCULATORS[0]).toMatchObject({ slug: "mortgage", path: "/calculators/mortgage", applyHref: "/apply/buy" });
  });

  it("lists the calculators in menu order", () => {
    expect(CALCULATORS.map((c) => c.slug)).toEqual(["mortgage", "buydown", "blended-rate", "investment"]);
  });

  it("leaves out switched-off calculators and ignores unknown slugs", () => {
    expect(enabledCalculators({ disabled: CALCULATORS.map((c) => c.slug) })).toEqual([]);
    expect(enabledCalculators({ disabled: ["nope"] })).toEqual(CALCULATORS);
  });

  it("treats only registered calculators as enabled", () => {
    expect(isCalculatorEnabled("investment", { disabled: [] })).toBe(true);
    expect(isCalculatorEnabled("investment", { disabled: ["investment"] })).toBe(false);
    // The MBS page is generated, unlisted and never registered.
    expect(isCalculatorEnabled("mbs", { disabled: [] })).toBe(false);
  });
});
