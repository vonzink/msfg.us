import { describe, expect, it } from "vitest";
import golden from "./golden.json";
import { calculateBreakeven, type BreakevenInput } from "./math";

const NONE = Number.NaN;
/** A golden input as the model takes it: "not given" is NaN here and null in the JSON. */
const toInput = (i: (typeof golden.cases)[number]["input"]): BreakevenInput => ({
  ...i,
  newLoanAmount: i.newLoanAmount ?? NONE,
  keepMonths: i.keepMonths ?? NONE,
});
const cases = golden.cases.map((c) => ({ ...c, model: toInput(c.input) }));
const named = (name: string) => cases.find((c) => c.name === name)!.model;
const example = named("example");

describe("matches the dashboard (golden cases from msfg-calc)", () => {
  it.each(cases)("$name", ({ model, expected }) => {
    const r = calculateBreakeven(model)!;
    expect(r).not.toBeNull();
    expect(r.current.payment).toBe(expected.currentPayment);
    expect(r.next.payment).toBe(expected.newPayment);
    expect(r.monthlySavings).toBe(expected.monthlySavings);
    expect(r.breakevenMonths).toBe(expected.breakevenMonths);
    expect(r.keep?.netSavings ?? null).toBe(expected.netSavings);
  });

  it("has the hand-checked example: $2,262.84 now, $1,995.91 new, $266.93 saved, 23 months", () => {
    const r = calculateBreakeven(example)!;
    expect([r.current.payment, r.next.payment, r.monthlySavings, r.breakevenMonths]).toEqual([2262.84, 1995.91, 266.93, 23]);
  });
});

describe("breakeven", () => {
  it("does not exist when the new payment is not lower", () => {
    const r = calculateBreakeven(named("no-savings"))!;
    expect(r.monthlySavings).toBeLessThan(0);
    expect(r.breakevenMonths).toBeNull();
    const equal = calculateBreakeven({ ...example, currentRate: 0.07, monthsLeft: 360 })!;
    expect(equal.monthlySavings).toBe(0);
    expect(equal.breakevenMonths).toBeNull();
  });

  it("is immediate with no closing costs", () => {
    expect(calculateBreakeven(named("zero-closing-costs"))!.breakevenMonths).toBe(0);
  });
});

describe("interest over the life of each loan (not on the dashboard, hand-checked)", () => {
  it("is the payments still to be made minus what is owed", () => {
    const r = calculateBreakeven(example)!;
    expect(r.current.interestRemaining).toBeCloseTo(2262.84 * 324 - 300000, 2); // $433,160.16
    expect(r.next.interestTotal).toBeCloseTo(1995.91 * 360 - 300000, 2); // $418,527.60
    expect(r.interestDifference).toBeCloseTo(-14632.56, 2);
  });

  it("shows a lower payment costing more interest when the term is stretched", () => {
    const r = calculateBreakeven(named("longer-term-more-interest"))!;
    expect(r.monthlySavings).toBeGreaterThan(0);
    expect(r.interestDifference).toBeCloseTo(82871.28, 2);
  });

  it("leaves mortgage insurance out of the interest figures", () => {
    const plain = calculateBreakeven(example)!;
    const withMi = calculateBreakeven(named("with-mi"))!;
    expect(withMi.current.interestRemaining).toBe(plain.current.interestRemaining);
    expect(withMi.next.interestTotal).toBe(plain.next.interestTotal);
    expect(withMi.current).toMatchObject({ principalAndInterest: 2262.84, mi: 140, payment: 2402.84 });
  });
});

describe("the new loan amount", () => {
  it("defaults to the current balance plus any cash out", () => {
    expect(calculateBreakeven(example)!.newLoanAmount).toBe(300000);
    expect(calculateBreakeven({ ...example, cashOut: 40000 })!.newLoanAmount).toBe(340000);
    expect(calculateBreakeven({ ...example, cashOut: 40000, newLoanAmount: 0 })!.newLoanAmount).toBe(340000);
    expect(calculateBreakeven({ ...example, newLoanAmount: 306000 })!.newLoanAmount).toBe(306000);
  });
});

describe("how long the loan is kept", () => {
  it("gives net savings only when a period is given", () => {
    expect(calculateBreakeven(example)!.keep).toBeNull();
    expect(calculateBreakeven({ ...example, keepMonths: 0 })!.keep).toBeNull();
    expect(calculateBreakeven({ ...example, keepMonths: 60 })!.keep).toEqual({ months: 60, netSavings: 10015.8 });
  });
});

describe("inputs that give no result", () => {
  it.each([
    ["a zero balance", { currentBalance: 0 }],
    ["a balance that is not a number", { currentBalance: NONE }],
    ["a current rate of zero", { currentRate: 0 }],
    ["a current rate of 30%", { currentRate: 0.3 }],
    ["a current rate that is not a number", { currentRate: NONE }],
    ["a new rate of zero", { newRate: 0 }],
    ["a new rate that is not a number", { newRate: NONE }],
    ["no months left", { monthsLeft: 0 }],
    ["months left that are not a whole number", { monthsLeft: 12.5 }],
    ["a new term of zero", { newTermMonths: 0 }],
    ["a negative loan amount with no balance to fall back on", { newLoanAmount: -1, currentBalance: -1 }],
  ])("returns null for %s", (_name, changes) => {
    expect(calculateBreakeven({ ...example, ...changes })).toBeNull();
  });

  it("counts junk or negative closing costs, insurance and debt payments as zero", () => {
    const r = calculateBreakeven({ ...example, closingCosts: NONE, currentMi: -50, newMi: NONE, debtPaymentsPaidOff: -1, cashOut: NONE })!;
    expect(r.closingCosts).toBe(0);
    expect(r.monthlySavings).toBe(266.93);
    expect(r.newLoanAmount).toBe(300000);
  });
});
