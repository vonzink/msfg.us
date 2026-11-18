import { describe, expect, it } from "vitest";
import { formatUSD } from "@/lib/finance";
import golden from "./golden.json";
import { calculateBlended, type Debt } from "./math";

const NONE = Number.NaN;
/** A golden debt as the model takes it. A blank rate or payment on the dashboard is NaN or 0 here. */
const toDebt = (d: { name: string; balance: number | string; ratePct: number | string; payment: number | string }): Debt => ({
  name: d.name,
  balance: Number(d.balance),
  rate: d.ratePct === "" ? NONE : Number(d.ratePct) / 100,
  payment: d.payment === "" ? 0 : Number(d.payment),
});
const cases = golden.cases.map((c) => ({ ...c, input: c.debts.map(toDebt) }));
const two = cases.find((c) => c.name === "mortgage-and-heloc")!.input;

describe("matches the dashboard (golden cases from msfg-calc)", () => {
  it.each(cases)("$name", ({ input, expected }) => {
    const r = calculateBlended(input, NONE)!;
    expect(`${(r.blendedRate * 100).toFixed(3)}%`).toBe(expected.blendedRate);
    expect(formatUSD(r.totalBalance)).toBe(expected.totalBalance);
    expect(formatUSD(r.totalPayment)).toBe(expected.totalPayment);
  });

  it("has the hand-checked figure: (250,000 x 3.5 + 60,000 x 9) / 310,000 = 4.565%", () => {
    expect(calculateBlended(two, NONE)!.blendedRate).toBeCloseTo(0.0456452, 7);
  });
});

describe("each debt's share", () => {
  it("adds up to the whole balance", () => {
    for (const { input } of cases) {
      const r = calculateBlended(input, NONE)!;
      expect(r.debts.reduce((t, d) => t + d.share, 0)).toBeCloseTo(1, 10);
    }
    expect(calculateBlended(two, NONE)!.debts.map((d) => Math.round(d.share * 100))).toEqual([81, 19]);
  });

  it("counts a debt with no rate at 0% and says so", () => {
    const r = calculateBlended([two[0], { ...two[1], rate: NONE }], NONE)!;
    expect(r.debts.map((d) => d.missingRate)).toEqual([false, true]);
    expect(r.debts[1].rate).toBe(0);
    expect(r.blendedRate).toBeCloseTo((250000 * 0.035) / 310000, 10);
    expect(calculateBlended([{ ...two[0], rate: -0.01 }], NONE)!.debts[0].missingRate).toBe(true);
    expect(calculateBlended([{ ...two[0], rate: 0 }], NONE)!.debts[0].missingRate).toBe(false);
  });

  it("leaves out rows without a balance above zero", () => {
    const r = calculateBlended([two[0], { ...two[1], balance: 0 }, { ...two[1], balance: -500 }, { ...two[1], balance: NONE }], NONE)!;
    expect(r.debts).toHaveLength(1);
    expect(r.totalBalance).toBe(250000);
    expect(r.totalPayment).toBe(1123);
  });
});

describe("no result", () => {
  it("is null for no debts and for debts with no balance", () => {
    expect(calculateBlended([], NONE)).toBeNull();
    expect(calculateBlended([{ name: "A", balance: 0, rate: 0.05, payment: 100 }], NONE)).toBeNull();
    expect(calculateBlended([{ name: "A", balance: NONE, rate: 0.05, payment: 100 }], NONE)).toBeNull();
  });
});

describe("comparing against one new rate", () => {
  it("gives the new rate minus the blended rate", () => {
    const r = calculateBlended(two, 0.07)!;
    expect(r.comparison!.rate).toBe(0.07);
    expect(r.comparison!.difference).toBeCloseTo(0.07 - 0.0456452, 6);
    expect(calculateBlended(two, 0.03)!.comparison!.difference).toBeLessThan(0);
  });

  it("is zero when the rates are equal", () => {
    expect(calculateBlended([{ name: "A", balance: 100000, rate: 0.06, payment: 0 }], 0.06)!.comparison!.difference).toBe(0);
  });

  it("is absent without a usable comparison rate", () => {
    expect(calculateBlended(two, NONE)!.comparison).toBeNull();
    expect(calculateBlended(two, -0.02)!.comparison).toBeNull();
  });
});

describe("monthly savings against one new loan", () => {
  const paying = [{ ...two[0], payment: 1123 }, { ...two[1], payment: 450 }];

  it("is today's payments minus the payment on one new loan for the whole balance", () => {
    const c = calculateBlended(paying, 0.07, 30)!.comparison!;
    // $310,000 at 7% over 30 years is $2,062.44 a month, against $1,573 now.
    expect(c.newPayment).toBeCloseTo(2062.44, 2);
    expect(c.termYears).toBe(30);
    expect(c.monthlySavings).toBeCloseTo(1573 - 2062.44, 2);
  });

  it("is positive when the new payment is lower", () => {
    const high = [{ name: "Card", balance: 20000, rate: 0.24, payment: 800 }, { name: "Car", balance: 15000, rate: 0.09, payment: 520 }];
    const c = calculateBlended(high, 0.07, 30)!.comparison!;
    expect(c.newPayment).toBeCloseTo(232.86, 2);
    expect(c.monthlySavings).toBeCloseTo(1320 - 232.86, 2);
  });

  it("changes with the new loan's term", () => {
    const thirty = calculateBlended(paying, 0.07, 30)!.comparison!.newPayment;
    const fifteen = calculateBlended(paying, 0.07, 15)!.comparison!.newPayment;
    expect(fifteen).toBeGreaterThan(thirty);
    expect(fifteen).toBeCloseTo(2786.37, 2);
  });

  it("is not given until every counted debt has a payment, so a missing one cannot flatter it", () => {
    const c = calculateBlended([paying[0], { ...paying[1], payment: 0 }], 0.07, 30)!.comparison!;
    expect(c.monthlySavings).toBeNull();
    expect(c.missingPayments).toBe(1);
    expect(c.newPayment).toBeCloseTo(2062.44, 2);
    expect(calculateBlended(paying, 0.07, 30)!.comparison!.missingPayments).toBe(0);
  });

  it("ignores the payment of a row that has no balance", () => {
    const c = calculateBlended([...paying, { name: "Paid off", balance: 0, rate: 0.05, payment: 300 }], 0.07, 30)!.comparison!;
    expect(c.monthlySavings).toBeCloseTo(1573 - 2062.44, 2);
  });

  it("falls back to 30 years for a term that is not a whole number of years from 1 to 40", () => {
    for (const term of [0, -5, 12.5, 99, Number.NaN]) {
      expect(calculateBlended(paying, 0.07, term)!.comparison!.termYears, String(term)).toBe(30);
    }
  });
});
