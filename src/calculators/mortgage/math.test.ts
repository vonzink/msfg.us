import { describe, expect, it } from "vitest";
import golden from "./golden.json";
import { monthlyPayment, roundCents } from "@/lib/finance";
import { calculateMortgage, loanAmountForPayment, paymentBreakdown, type MortgageInput } from "./math";

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

describe("the golden cases cover a refinance and odd terms", () => {
  it("has every case of the plan, the refinances recorded from the dashboard's refinance mode", () => {
    const names = golden.cases.map((c) => c.name);
    for (const name of ["refi-80", "refi-with-mi", "refi-15-year", "term-7", "term-13-with-mi", "term-29", "term-1"]) expect(names).toContain(name);
    const refinances = golden.cases.filter((c) => "dashboardMode" in c && c.dashboardMode === "refinance").map((c) => c.name);
    expect(refinances).toEqual(["refi-80", "refi-with-mi", "refi-15-year"]);
  });

  it("gives a refinance as the home value for the price and the equity for the down payment", () => {
    // refi-80: a $320,000 loan on a $400,000 home, the same loan as the purchase example.
    const refi = cases.find((c) => c.name === "refi-80")!;
    expect(refi.input).toMatchObject({ homePrice: 400000, downPayment: 80000 });
    expect(refi.expected.loanAmount).toBe(320000);
    expect(refi.expected.monthlyPI).toBe(2128.97);
  });
});

describe("terms that are not one of the five usual ones", () => {
  const at = (termYears: number, changes: Partial<MortgageInput> = {}) =>
    calculateMortgage({ ...reference, startMonth: 0, startYear: 2027, termYears, ...changes })!;

  it.each([1, 7, 13, 29])("a %i-year loan runs its full term, year by year, and ends at zero", (termYears) => {
    const r = at(termYears);
    expect(r.schedule).toHaveLength(termYears * 12);
    expect(r.years).toHaveLength(termYears);
    expect(r.years.map((y) => y.year)).toEqual(Array.from({ length: termYears }, (_, i) => i + 1));
    expect(r.schedule.at(-1)!.balance).toBe(0);
    expect(r.years.at(-1)!.endBalance).toBe(0);
    expect(r.payoff).toEqual({ month: 11, year: 2026 + termYears });
    const repaid = r.schedule.reduce((t, row) => t + row.principal, 0);
    expect(Math.abs(repaid - r.loanAmount)).toBeLessThan(0.005);
    // The last payment absorbs the rounding: it stays within a few dollars of the regular one.
    const last = r.schedule.at(-1)!;
    expect(Math.abs(last.principal + last.interest - r.monthlyPI)).toBeLessThan(5);
  });

  it("ends mortgage insurance when an odd-term loan reaches 78% of the price, before the midpoint", () => {
    // $250,000 home, nothing down, 13 years at 7.5%. 78% of the price is $195,000. The balance is
    // $195,678.62 after payment 49 and $194,388.18 after payment 50, so insurance is charged on
    // payments 1 to 49. The midpoint (13 x 6 + 1 = 79) comes later and does not decide.
    const r = at(13, { downPayment: 0, monthlyPmi: 100 });
    expect(r.schedule[48].balance).toBe(195678.62);
    expect(r.schedule[49].balance).toBe(194388.18);
    expect(r.pmiEndPayment).toBe(50);
    expect(r.schedule[48].pmi).toBe(100);
    expect(r.schedule[49].pmi).toBe(0);
  });

  it.each([
    // At a high rate the balance is still above 78% of the price half way through, so the
    // midpoint decides: insurance stops with payment term x 6 + 1.
    [13, 0.25, 79],
    [29, 0.12, 175],
  ])("ends mortgage insurance after the midpoint of a %i-year loan at a rate of %f", (termYears, annualRate, end) => {
    const r = at(termYears, { downPayment: 0, monthlyPmi: 100, annualRate });
    expect(end).toBe(termYears * 6 + 1);
    expect(r.schedule[end - 1].balance).toBeGreaterThan(250000 * 0.78);
    expect(r.pmiEndPayment).toBe(end);
    expect(r.schedule[end - 2].pmi).toBe(100);
    expect(r.schedule[end - 1].pmi).toBe(0);
    expect(r.years.reduce((t, y) => t + y.pmi, 0)).toBe(100 * (end - 1));
  });
});

describe("the loan amount a payment pays off", () => {
  /** Slack for floating point when two payments are compared; a cent of loan moves the payment far more. */
  const EPS = 1e-9;

  it("gives about $320,000 for $2,128.97 a month at 7% over 30 years (hand-checked)", () => {
    // A separate calculation: the worth today of 360 payments of $2,128.97, each discounted at
    // 7% / 12 a month, added up one by one. That sum is $320,000.3029..., so the largest loan in
    // whole cents the payment pays off is $320,000.30. ($320,000 itself has a payment of
    // $2,128.968, which is $2,128.97 to the cent.)
    let worth = 0;
    for (let k = 1; k <= 360; k++) worth += 2128.97 / Math.pow(1 + 0.07 / 12, k);
    expect(worth).toBeCloseTo(320000.303, 3);

    const loan = loanAmountForPayment(2128.97, 0.07, 30)!;
    expect(loan).toBe(320000.3);
    expect(loan).toBe(Math.floor(worth * 100) / 100);
    expect(roundCents(monthlyPayment(loan, 7, 360))).toBe(2128.97);
    // The model, given that loan, has the typed payment as its principal and interest.
    const r = calculateMortgage({ ...reference, homePrice: loan, downPayment: 0, annualRate: 0.07, termYears: 30 })!;
    expect(r.loanAmount).toBe(loan);
    expect(r.monthlyPI).toBe(2128.97);
  });

  it("never exceeds what the payment covers, and one cent more of loan would, across rates and terms", () => {
    const rates = [0, 0.00125, 0.01, 0.02875, 0.045, 0.06, 0.07, 0.0825, 0.1, 0.125, 0.15];
    const payments = [0.01, 1, 99.99, 850, 2128.97, 4321.09, 25000];
    let checked = 0;
    for (const rate of rates) {
      for (let termYears = 1; termYears <= 30; termYears++) {
        for (const payment of payments) {
          const loan = loanAmountForPayment(payment, rate, termYears);
          const months = termYears * 12;
          const label = `${payment} at ${rate} for ${termYears}`;
          if (loan === null) {
            // Only when not even one cent of loan is paid off by the payment.
            expect(monthlyPayment(0.01, rate * 100, months), label).toBeGreaterThan(payment + EPS);
            continue;
          }
          expect(loan, label).toBe(roundCents(loan));
          expect(loan, label).toBeGreaterThan(0);
          expect(monthlyPayment(loan, rate * 100, months), label).toBeLessThanOrEqual(payment + EPS);
          expect(monthlyPayment(roundCents(loan + 0.01), rate * 100, months), label).toBeGreaterThan(payment + EPS);
          // To the cent, the loan's payment is the payment typed.
          expect(roundCents(monthlyPayment(loan, rate * 100, months)), label).toBe(payment);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(2000);
  });

  it("is the payment times the number of months at 0%", () => {
    expect(loanAmountForPayment(1000, 0, 1)).toBe(12000);
    expect(loanAmountForPayment(888.89, 0, 30)).toBe(320000.4);
    expect(loanAmountForPayment(123.45, 0, 7)).toBe(10369.8);
  });

  it("handles a 1-year term", () => {
    // $60,000 at 5% for one year is $5,136.45 a month (the term-1 golden case).
    const loan = loanAmountForPayment(5136.45, 0.05, 1)!;
    expect(Math.abs(loan - 60000)).toBeLessThan(0.1);
    expect(roundCents(monthlyPayment(loan, 5, 12))).toBe(5136.45);
  });

  it.each([
    ["a payment of 0", 0, 0.07, 30],
    ["a negative payment", -500, 0.07, 30],
    ["a payment that is not a number", Number.NaN, 0.07, 30],
    ["an endless payment", Number.POSITIVE_INFINITY, 0.07, 30],
    ["a negative rate", 2000, -0.01, 30],
    ["a rate that is not a number", 2000, Number.NaN, 30],
    ["a rate above the model's limit of 25%", 2000, 0.26, 30],
    ["a term of 0", 2000, 0.07, 0],
    ["a term of 41 years", 2000, 0.07, 41],
    ["a term that is not whole years", 2000, 0.07, 7.5],
    ["a term that is not a number", 2000, 0.07, Number.NaN],
  ])("is null for %s", (_name, payment, rate, termYears) => {
    expect(loanAmountForPayment(payment, rate, termYears)).toBeNull();
  });

  it("accepts the model's own limits: 25% and 40 years", () => {
    expect(loanAmountForPayment(2000, 0.25, 40)).not.toBeNull();
  });
});

describe("loanAmountForPayment with a payment too large to count in cents", () => {
  it.each([600000000000, 1e15, 1e300, Number.MAX_VALUE])("returns at once, with no amount, for %d", (payment) => {
    expect(loanAmountForPayment(payment, 0.07, 30)).toBeNull();
    // A year at 0% is a much smaller loan; either way the call comes back.
    const short = loanAmountForPayment(payment, 0, 1);
    expect(short === null || short === payment * 12).toBe(true);
  }, 1000);

  it("still answers for a very large payment whose loan is a safe number of cents", () => {
    const loan = loanAmountForPayment(1e9, 0.07, 30)!;
    expect(monthlyPayment(loan, 7, 360)).toBeLessThanOrEqual(1e9 + 1e-6);
    expect(monthlyPayment(loan + 0.01, 7, 360)).toBeGreaterThan(1e9);
  }, 1000);
});
