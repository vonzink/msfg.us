import { describe, expect, it } from "vitest";
import { roundCents } from "@/lib/finance";
import golden from "./golden.json";
import { calculateBuydown, type BuydownInput } from "./math";

const cases = golden.cases.map((c) => ({ ...c, input: c.input as BuydownInput }));
const base = cases.find((c) => c.name === "2-1")!.input;

describe("matches the dashboard (golden cases from msfg-calc)", () => {
  it.each(cases)("$name", ({ input, expected }) => {
    const r = calculateBuydown(input)!;
    expect(r).not.toBeNull();
    expect(roundCents(r.totalCost)).toBe(expected.totalCost);
    expect(
      r.periods.map((p) => ({
        year: p.year,
        reduced: p.reduced,
        ratePct: Number((p.rate * 100).toFixed(6)),
        principalAndInterest: roundCents(p.principalAndInterest),
        total: roundCents(p.total),
        monthlySavings: roundCents(p.monthlySavings),
        yearlySavings: roundCents(p.yearlySavings),
      })),
    ).toEqual(expected.periods);
  });

  it("has the hand-checked 2-1 figures: $2,128.97 full, $1,717.83 and $1,918.56 reduced", () => {
    const r = calculateBuydown(base)!;
    expect(r.periods.map((p) => roundCents(p.principalAndInterest))).toEqual([1717.83, 1918.56, 2128.97]);
    expect(roundCents(r.full.principalAndInterest)).toBe(2128.97);
    expect(r.full).toBe(r.periods.at(-1));
  });
});

describe("the buydown cost", () => {
  it("is the sum of the reduced years' savings", () => {
    for (const { input } of cases) {
      const r = calculateBuydown(input)!;
      const saved = r.periods.filter((p) => p.reduced).reduce((t, p) => t + p.yearlySavings, 0);
      expect(r.totalCost).toBeCloseTo(saved, 6);
    }
  });

  it("does not change with tax, insurance or HOA", () => {
    expect(calculateBuydown({ ...base, yearlyTax: 4800, yearlyInsurance: 1800, monthlyHoa: 100 })!.totalCost).toBe(calculateBuydown(base)!.totalCost);
  });

  it("says when a reduced rate was stopped at 0%", () => {
    expect(calculateBuydown({ ...base, annualRate: 0.02, type: "3-2-1" })!.flooredAtZero).toBe(true);
    expect(calculateBuydown({ ...base, annualRate: 0.03, type: "3-2-1" })!.flooredAtZero).toBe(false);
    expect(calculateBuydown(base)!.flooredAtZero).toBe(false);
  });
});

describe("inputs that give no result", () => {
  it.each([
    ["a zero loan amount", { loanAmount: 0 }],
    ["a negative loan amount", { loanAmount: -1 }],
    ["a zero rate", { annualRate: 0 }],
    ["a negative rate", { annualRate: -0.01 }],
    ["a rate above 25%", { annualRate: 0.26 }],
    ["a term of zero", { termYears: 0 }],
    ["a term that is not whole years", { termYears: 12.5 }],
    ["a loan amount that is not a number", { loanAmount: Number.NaN }],
    ["a rate that is not a number", { annualRate: Number.NaN }],
  ])("returns null for %s", (_name, changes) => {
    expect(calculateBuydown({ ...base, ...changes })).toBeNull();
  });

  it("reports how much of each payment is tax, insurance and HOA", () => {
    expect(calculateBuydown(base)!.monthlyExtras).toBe(0);
    expect(calculateBuydown({ ...base, yearlyTax: 4800, yearlyInsurance: 1800, monthlyHoa: 100 })!.monthlyExtras).toBe(650);
  });

  it("counts junk or negative tax, insurance and HOA as zero", () => {
    const r = calculateBuydown({ ...base, yearlyTax: Number.NaN, yearlyInsurance: -500, monthlyHoa: -1 })!;
    expect(r.full.total).toBe(r.full.principalAndInterest);
  });
});
