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
    expect(CALCULATORS.map((c) => c.slug)).toEqual(["mortgage", "buydown", "blended-rate", "refinance-breakeven", "rent-vs-buy", "budget", "investment"]);
  });

  it("lists the Rent vs buy calculator fifth, leading to the purchase application", () => {
    expect(CALCULATORS[4]).toEqual({
      slug: "rent-vs-buy",
      path: "/calculators/rent-vs-buy",
      label: "Rent vs buy calculator",
      question: "Does renting or buying cost less over time?",
      description: "Compare the cost of renting with the cost of buying over the years you plan to stay, and see whether and when buying pulls ahead.",
      applyHref: "/apply/buy",
    });
  });

  it("lists the Home budget calculator sixth, before the Investment calculator, leading to the purchase application", () => {
    expect(CALCULATORS[5]).toEqual({
      slug: "budget",
      path: "/calculators/budget",
      label: "Home budget calculator",
      question: "What is left each month after my house payment and bills?",
      description: "See how much of your income goes to housing and debts, and what is left each month after your bills.",
      applyHref: "/apply/buy",
    });
    expect(CALCULATORS[6].slug).toBe("investment");
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
