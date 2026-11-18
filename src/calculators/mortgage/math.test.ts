import { describe, expect, it } from "vitest";
import golden from "./golden.json";
import { calculateMortgage, type MortgageInput } from "./math";

const cases = golden.cases.map((c) => ({ ...c, input: c.input as MortgageInput }));
const reference = cases.find((c) => c.name === "reference")!.input;

describe("matches the dashboard (golden cases from msfg-calc)", () => {
  it.each(cases)("$name", ({ input, expected }) => {
    const r = calculateMortgage(input)!;
    expect(r).not.toBeNull();
    expect(r.loanAmount).toBe(expected.loanAmount);
    expect(r.monthlyPI).toBe(expected.monthlyPI);
    expect(r.totalInterest).toBe(expected.totalInterest);
    expect(r.totalCost).toBe(expected.totalCost);
    expect(r.interestSaved).toBe(expected.interestSaved);
    expect(r.monthsSaved).toBe(expected.monthsSaved);
    expect(r.pmiEndPayment).toBe(expected.pmiEndPayment);
    expect(r.schedule).toHaveLength(expected.scheduleLength);
    const last = r.schedule.length - 1;
    expect([r.schedule[0], r.schedule[Math.min(11, last)], r.schedule[last]]).toEqual(expected.rows);
  });

  it("has the dashboard's reference figures (checked by hand against msfg-calc's own test)", () => {
    const r = calculateMortgage(reference)!;
    expect(r.monthlyPI).toBe(1398.43);
    expect(r.first).toEqual({ principalAndInterest: 1398.43, tax: 208.33, insurance: 125, hoa: 100, pmi: 0, total: 1831.76 });
  });
});

describe("inputs the dashboard rejects", () => {
  it.each([
    ["down payment equal to the price", { downPayment: 250000 }],
    ["a negative price", { homePrice: -1 }],
    ["a rate above 25%", { annualRate: 0.26 }],
    ["a negative rate", { annualRate: -0.01 }],
    ["a term of zero", { termYears: 0 }],
    ["a term over 40 years", { termYears: 41 }],
    ["a term that is not whole years", { termYears: 12.5 }],
    ["a price that is not a number", { homePrice: Number.NaN }],
  ])("returns null for %s", (_name, changes) => {
    expect(calculateMortgage({ ...reference, ...changes })).toBeNull();
  });
});

describe("the schedule", () => {
  it("ends at zero with no negative balance when an extra payment exceeds the balance", () => {
    const r = calculateMortgage({ ...reference, extraAmount: 500000, extraFrequency: "one-time" })!;
    expect(r.schedule.every((row) => row.balance >= 0)).toBe(true);
    expect(r.schedule.at(-1)!.balance).toBe(0);
    expect(r.schedule).toHaveLength(1);
  });

  it("rolls up by year: principal plus extra repays the loan", () => {
    const r = calculateMortgage({ ...reference, extraAmount: 200 })!;
    const repaid = r.years.reduce((t, y) => t + y.principal + y.extra, 0);
    expect(Math.abs(repaid - r.loanAmount)).toBeLessThan(0.005);
    expect(r.years.at(-1)!.endBalance).toBe(0);
    expect(r.years[0].year).toBe(1);
  });

  it("gives the payoff month and year from the start date", () => {
    const r = calculateMortgage({ ...reference, startMonth: 0, startYear: 2027 })!;
    expect(r.payoff).toEqual({ month: 11, year: 2056 });
  });
});
