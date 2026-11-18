import { describe, expect, it } from "vitest";
import golden from "./golden.json";
import { calculateMortgage, paymentBreakdown, type MortgageInput } from "./math";

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
    ["a negative down payment", { downPayment: -20000 }],
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

  it("reports the extra principal apart from the regular first payment", () => {
    const r = calculateMortgage({ ...reference, extraAmount: 200, extraFrequency: "annually" })!;
    expect(r.extra).toEqual({ amount: 200, frequency: "annually" });
    expect(r.first.total).toBe(1831.76);
    expect(calculateMortgage(reference)!.extra.amount).toBe(0);
  });

  it("totals what is paid in each year, including tax, insurance and fees", () => {
    const r = calculateMortgage(reference)!;
    expect(r.years[0].paid).toBe(21981.12); // 12 payments of $1,831.76
    const paid = r.years.reduce((t, y) => t + y.paid, 0);
    expect(Math.abs(paid - r.totalCost)).toBeLessThan(0.005);
  });

  it("gives the payoff month and year from the start date", () => {
    const r = calculateMortgage({ ...reference, startMonth: 0, startYear: 2027 })!;
    expect(r.payoff).toEqual({ month: 11, year: 2056 });
  });
});

describe("one payment, broken down (the slider)", () => {
  const r = calculateMortgage({ ...reference, monthlyPmi: 90, extraAmount: 200 })!;

  it("splits the first payment and gives principal against interest", () => {
    const b = paymentBreakdown(r, 1)!;
    // The dashboard's reference row: $148.43 principal and $1,250.00 interest.
    expect(b.parts).toEqual([
      { key: "principal", label: "Principal", value: 148.43 },
      { key: "interest", label: "Interest", value: 1250 },
      { key: "tax", label: "Property tax", value: 208.33 },
      { key: "insurance", label: "Homeowners insurance", value: 125 },
      { key: "hoa", label: "HOA dues", value: 100 },
      { key: "pmi", label: "Mortgage insurance", value: 0 },
      { key: "extra", label: "Extra principal", value: 200 },
    ]);
    expect(b.total).toBe(2031.76);
    expect(b.balance).toBe(199651.57);
    expect(b.principalShare).toBeCloseTo(0.1061, 4);
    expect(b.interestShare).toBeCloseTo(0.8939, 4);
    expect(b).toMatchObject({ paymentNum: 1, loanYear: 1 });
  });

  it("shows interest shrinking and principal growing later in the loan", () => {
    const late = paymentBreakdown(r, 200)!;
    expect(late.principalShare).toBeGreaterThan(0.5);
    expect(late.loanYear).toBe(17);
  });

  it("clamps a payment number past the end of the loan to the last payment", () => {
    expect(paymentBreakdown(r, 9999)!.paymentNum).toBe(r.schedule.length);
    expect(paymentBreakdown(r, 0)!.paymentNum).toBe(1);
  });
});
