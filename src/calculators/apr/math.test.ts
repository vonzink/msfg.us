import { describe, expect, it } from "vitest";
import golden from "./golden.json";
import { calculateApr, MI_END_LTV, MIN_LOAN_AMOUNT, POINTS_LIMIT, PREPAID_INTEREST_DAYS, RATE_LIMIT, type AprInput } from "./math";

/** The golden file writes the automatic prepaid interest as null; the model takes NaN. */
const toInput = (input: (typeof golden.cases)[number]["input"]): AprInput => ({ ...input, prepaidInterest: input.prepaidInterest ?? Number.NaN });
const cases = golden.cases.map((c) => ({ name: c.name, input: toInput(c.input), expected: c.expected }));
const named = (name: string) => cases.find((c) => c.name === name)!;
const example = named("example").input;
const calc = (changes: Partial<AprInput> = {}) => calculateApr({ ...example, ...changes });
/** A rate as the dashboard displays it: a percent to three decimals. */
const pct3 = (rate: number) => Number((rate * 100).toFixed(3));

describe("matches the dashboard (golden cases from msfg-calc)", () => {
  it("has the ten cases of the plan, with the lender fees typed into the catalog's origination fee", () => {
    expect(cases.map((c) => c.name)).toEqual([
      "example", "no-fees", "points", "credit-smaller", "credit-larger", "with-mi", "mi-not-needed", "fifteen-year", "prepaid-typed", "zero-rate",
    ]);
    expect(golden.lenderFeesIn).toBe("origination_fee");
  });

  it.each(cases)("$name", ({ input, expected }) => {
    const r = calculateApr(input)!;
    expect(r).not.toBeNull();
    expect(pct3(r.apr)).toBe(expected.aprPct);
    expect(pct3(input.rate)).toBe(expected.noteRatePct);
    expect(pct3(r.spread)).toBe(expected.spreadPct);
    expect(r.principalAndInterest).toBe(expected.principalAndInterest);
    expect(r.amountFinanced).toBe(expected.amountFinanced);
    expect(r.financeCharge).toBe(expected.financeCharge);
    expect(r.totalOfPayments).toBe(expected.totalOfPayments);
    expect(r.fees.total).toBe(expected.feesTotal);
    expect(r.fees.prepaidInterest).toBe(expected.prepaidInterest);
    expect(r.miMonths).toBe(expected.miMonths);
  });

  it("has the hand-checked example", () => {
    const r = calc()!;
    expect(r.principalAndInterest).toBe(2128.97); // 320,000 at 7% over 360 months
    expect(r.fees).toEqual({
      lenderFees: 4000,
      pointsAmount: 0,
      prepaidInterest: 920.55, // 320,000 x 7% x 15 / 365
      prepaidInterestIsAutomatic: true,
      lenderCreditApplied: 0,
      total: 4920.55,
    });
    expect(r.amountFinanced).toBe(315079.45); // 320,000 - 4,920.55
    expect(r.totalOfPayments).toBe(766428.47);
    expect(r.financeCharge).toBe(451349.02); // 766,428.47 - 315,079.45
    expect(r.apr).toBeGreaterThan(0.0714);
    expect(r.apr).toBeLessThan(0.0717);
    expect(r.spread).toBe(r.apr - 0.07);
    expect(r.miMonths).toBe(0);
  });

  it("the fee breakdown adds up to the total in every case", () => {
    for (const { name, input } of cases) {
      const { fees } = calculateApr(input)!;
      const sum = fees.lenderFees + fees.pointsAmount + fees.prepaidInterest - fees.lenderCreditApplied;
      expect(Math.round(sum * 100), name).toBe(Math.round(fees.total * 100));
      expect(fees.total, name).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("A1: the fee lines add up to the cent as shown", () => {
  const sumOfRows = (r: NonNullable<ReturnType<typeof calculateApr>>) =>
    Math.round(r.fees.lenderFees * 100) + Math.round(r.fees.pointsAmount * 100) + Math.round(r.fees.prepaidInterest * 100) - Math.round(r.fees.lenderCreditApplied * 100);

  it("the reviewer's case: 1,295.00 + 62.51 + 136.14 - 500.00 is the total, 993.65", () => {
    // 50,004 x 0.125% = 62.505, shown as 62.51. 50,004 x 6.625% x 15 / 365 = 136.141, shown as 136.14.
    const r = calculateApr({ ...example, loanAmount: 50004, rate: 0.06625, lenderFees: 1295, points: 0.00125, lenderCredit: 500 })!;
    expect(r.fees).toEqual({ lenderFees: 1295, pointsAmount: 62.51, prepaidInterest: 136.14, prepaidInterestIsAutomatic: true, lenderCreditApplied: 500, total: 993.65 });
    expect(sumOfRows(r)).toBe(99365);
    expect(r.amountFinanced).toBe(49010.35); // 50,004 - 993.65
  });

  it("the reviewer's second case: points of 0.75% on 50,002 are 375.02", () => {
    // 50,002 x 0.75% = 375.015. 50,002 x 7% x 15 / 365 = 143.84. With 4,000 of fees: 4,518.86.
    const r = calculateApr({ ...example, loanAmount: 50002, points: 0.0075 })!;
    expect(r.fees).toMatchObject({ lenderFees: 4000, pointsAmount: 375.02, prepaidInterest: 143.84, total: 4518.86 });
    expect(sumOfRows(r)).toBe(451886);
    expect(r.amountFinanced).toBe(45483.14);
  });

  it("holds for typed amounts with parts of a cent, and odd points on odd loans", () => {
    for (const loanAmount of [50001, 50002, 50003, 50004, 123457, 333333]) {
      for (const points of [0, 0.00125, 0.00375, 0.0075, 0.01125]) {
        for (const [lenderFees, lenderCredit, prepaidInterest] of [[1295, 500, Number.NaN], [1000.005, 0.004, 10.015], [0.005, 0, 0.005], [400, 9000, Number.NaN]]) {
          const r = calculateApr({ ...example, loanAmount, points, lenderFees, lenderCredit, prepaidInterest })!;
          const at = JSON.stringify({ loanAmount, points, lenderFees, lenderCredit });
          expect(sumOfRows(r), at).toBe(Math.round(r.fees.total * 100));
          expect(Math.round(r.amountFinanced * 100), at).toBe(Math.round(loanAmount * 100) - Math.round(r.fees.total * 100));
        }
      }
    }
  });
});

describe("A7: a 0% loan with small fees", () => {
  it("shows its own APR, below the dashboard's floor of 0.010%", () => {
    // 50,000 at 0% over 360 months with 50 of fees: 49,950 financed, repaid as 138.89 a month.
    const r = calculateApr({ ...example, loanAmount: 50000, rate: 0, lenderFees: 50 })!;
    expect(r.fees.total).toBe(50);
    expect(pct3(r.apr)).toBe(0.007);
    expect(pct3(r.spread)).toBe(0.007);
  });

  it("leaves the dashboard's 0% case where it was", () => {
    expect(pct3(calculateApr(named("zero-rate").input)!.apr)).toBe(0.067);
  });
});

describe("A8: the smallest loan taken", () => {
  it("is 1,000", () => {
    expect(MIN_LOAN_AMOUNT).toBe(1000);
    expect(calc({ loanAmount: 999.99, lenderFees: 0 })).toBeNull();
    expect(calc({ loanAmount: 999, lenderFees: 0, prepaidInterest: 0 })).toBeNull();
    expect(calc({ loanAmount: 1, lenderFees: 0, prepaidInterest: 0 })).toBeNull();
    expect(calc({ loanAmount: 1000, lenderFees: 0 })).not.toBeNull();
    expect(calc({ loanAmount: 1000, lenderFees: 0, prepaidInterest: 0 })!.apr).toBe(0.07);
  });
});

describe("prepaid interest", () => {
  it("is 15 days of interest when not entered, to the cent", () => {
    expect(PREPAID_INTEREST_DAYS).toBe(15);
    expect(calc()!.fees).toMatchObject({ prepaidInterest: 920.55, prepaidInterestIsAutomatic: true });
    // 250,000 x 6.25% x 15 / 365 = 642.1232...
    expect(calculateApr(named("fifteen-year").input)!.fees.prepaidInterest).toBe(642.12);
  });

  it("is the typed amount when entered, and a typed 0 is 0", () => {
    expect(calc({ prepaidInterest: 1800 })!.fees).toMatchObject({ prepaidInterest: 1800, prepaidInterestIsAutomatic: false, total: 5800 });
    expect(calc({ prepaidInterest: 0 })!.fees).toMatchObject({ prepaidInterest: 0, prepaidInterestIsAutomatic: false, total: 4000 });
  });

  it("is nothing at a 0% rate", () => {
    const r = calculateApr(named("zero-rate").input)!;
    expect(r.fees).toMatchObject({ prepaidInterest: 0, prepaidInterestIsAutomatic: true, total: 2000 });
    expect(r.principalAndInterest).toBe(555.56); // 200,000 / 360
    expect(r.financeCharge).toBe(2000); // no interest: the finance charge is the fees
    expect(pct3(r.apr)).toBe(0.067);
  });
});

describe("points and the lender credit", () => {
  it("points are a share of the loan amount", () => {
    expect(POINTS_LIMIT).toEqual({ low: 0, high: 0.1 });
    expect(calc({ points: 0.01 })!.fees).toMatchObject({ pointsAmount: 3200, total: 8120.55 });
    expect(calc({ points: 0.1 })!.fees.pointsAmount).toBe(32000);
    expect(calc({ points: 0.00125 })!.fees.pointsAmount).toBe(400);
  });

  it("a credit comes off the lender fees and prepaid interest", () => {
    expect(calc({ lenderCredit: 1500 })!.fees).toMatchObject({ lenderCreditApplied: 1500, total: 3420.55 });
  });

  it("a credit larger than those fees takes them to zero and no further", () => {
    const r = calc({ lenderCredit: 9000 })!;
    expect(r.fees).toMatchObject({ lenderFees: 4000, prepaidInterest: 920.55, lenderCreditApplied: 4920.55, total: 0 });
    expect(Object.is(r.fees.total, 0)).toBe(true);
    expect(r.amountFinanced).toBe(320000);
  });

  it("a credit does not come off points", () => {
    const r = calc({ points: 0.01, lenderCredit: 9000 })!;
    expect(r.fees).toMatchObject({ pointsAmount: 3200, lenderCreditApplied: 4920.55, total: 3200 });
    expect(r.amountFinanced).toBe(316800);
    expect(r.apr).toBeGreaterThan(0.07);
  });

  it("a credit never makes the fees negative or the amount financed more than the loan", () => {
    for (const lenderCredit of [0, 1, 4920.54, 4920.55, 4920.56, 50000, 1e9]) {
      for (const points of [0, 0.02]) {
        const r = calc({ lenderCredit, points })!;
        expect(r.fees.total).toBeGreaterThanOrEqual(r.fees.pointsAmount);
        expect(r.fees.lenderCreditApplied).toBeLessThanOrEqual(lenderCredit);
        expect(r.fees.lenderCreditApplied).toBeGreaterThanOrEqual(0);
        expect(r.amountFinanced).toBeLessThanOrEqual(320000);
      }
    }
  });
});

describe("decision 4: no finance charge means an APR equal to the interest rate", () => {
  // Differs from the dashboard on purpose. With nothing counted the dashboard's solver stops a
  // hair under the rate, and it displays an APR of 7.000% with a spread of "-0.000%".
  it("the dashboard shows a spread of -0.000% for these two cases", () => {
    expect(named("no-fees").expected.spreadText).toBe("-0.000%");
    expect(named("credit-larger").expected.spreadText).toBe("-0.000%");
  });

  it.each(["no-fees", "credit-larger"])("%s: the APR is the rate itself and the spread is exactly 0", (name) => {
    const { input } = named(name);
    const r = calculateApr(input)!;
    expect(r.fees.total).toBe(0);
    expect(r.apr).toBe(input.rate);
    expect(Object.is(r.spread, 0)).toBe(true);
    expect(r.amountFinanced).toBe(input.loanAmount);
    expect(r.financeCharge).toBe(446428.47); // the interest alone
  });

  it("holds at any rate and term, 0% included", () => {
    for (const rate of [0, 0.00005, 0.03, 0.0675, 0.125, 0.2999]) {
      for (const termMonths of [120, 180, 360]) {
        const r = calc({ rate, termMonths, lenderFees: 0, prepaidInterest: 0 })!;
        expect(r.apr).toBe(rate);
        expect(Object.is(r.spread, 0)).toBe(true);
      }
    }
    expect(calc({ rate: 0, lenderFees: 0 })).toMatchObject({ apr: 0, spread: 0, financeCharge: 0, principalAndInterest: 888.89 });
  });

  it("holds when mortgage insurance is entered but no payment carries it", () => {
    const r = calc({ lenderFees: 0, prepaidInterest: 0, monthlyMi: 160, homeValue: 500000 })!; // 64% of the value
    expect(r.miMonths).toBe(0);
    expect(r.apr).toBe(0.07);
  });

  it("does not apply when only mortgage insurance is counted", () => {
    const r = calc({ lenderFees: 0, prepaidInterest: 0, monthlyMi: 160, homeValue: 340000 })!;
    expect(r.fees.total).toBe(0);
    expect(r.miMonths).toBeGreaterThan(0);
    expect(r.apr).toBeGreaterThan(0.07);
  });
});

describe("mortgage insurance", () => {
  it("ends when the balance reaches 78% of the home value", () => {
    expect(MI_END_LTV).toBe(0.78);
    // Month by month at 6.75%: 380,000 owes 312,030.36 after 138 payments and 311,320.86 after
    // 139. 78% of 400,000 is 312,000, so 139 payments carry it.
    const r = calculateApr(named("with-mi").input)!;
    expect(r.miMonths).toBe(139);
    expect(r.principalAndInterest).toBe(2464.67);
    expect(r.totalOfPayments).toBe(909522.2); // 2,464.6728 x 360 + 160 x 139
    expect(r.financeCharge).toBe(534076.31);
  });

  it("is not paid on a loan already at or under 78% of the home value", () => {
    const r = calculateApr(named("mi-not-needed").input)!; // 300,000 of 400,000 is 75%
    expect(r.miMonths).toBe(0);
    expect(r.totalOfPayments).toBe(700485.94); // principal and interest only
    expect(calc({ monthlyMi: 100, homeValue: 320000 / 0.78 + 1 })!.miMonths).toBe(0);
    expect(calc({ monthlyMi: 100, homeValue: 400000 })!.miMonths).toBeGreaterThan(0); // 80%
  });

  it("raises the APR and the finance charge, and leaves the fees and the amount financed alone", () => {
    const base = named("with-mi").input;
    const without = calculateApr({ ...base, monthlyMi: 0 })!;
    const withMi = calculateApr(base)!;
    expect(withMi.apr).toBeGreaterThan(without.apr);
    expect(withMi.fees).toEqual(without.fees);
    expect(withMi.amountFinanced).toBe(without.amountFinanced);
    expect(Math.round(withMi.financeCharge * 100)).toBe(Math.round((without.financeCharge + 160 * 139) * 100));
    expect(without.miMonths).toBe(0);
  });

  it("decision 3: entered without a home value there is no result", () => {
    // Differs from the dashboard on purpose: with no property value it charges the insurance for
    // the whole term. Here the home value is asked for instead.
    expect(calculateApr({ ...named("with-mi").input, homeValue: 0 })).toBeNull();
    expect(calc({ monthlyMi: 0.01, homeValue: 0 })).toBeNull();
    expect(calc({ monthlyMi: 0, homeValue: 0 })).not.toBeNull();
    expect(calc({ monthlyMi: 0, homeValue: 400000 })).toEqual(calc());
  });

  it("at a 0% rate ends on the straight-line balance", () => {
    // 360,000 over 360 months pays 1,000 a month; 78% of 400,000 is 312,000, reached after 48.
    const r = calc({ loanAmount: 360000, rate: 0, monthlyMi: 100, homeValue: 400000 })!;
    expect(r.miMonths).toBe(48);
    expect(r.totalOfPayments).toBe(364800);
  });
});

describe("no result", () => {
  it("has the limits the page names", () => {
    expect(RATE_LIMIT).toEqual({ low: 0, high: 0.3 });
  });

  it.each<[string, Partial<AprInput>]>([
    ["no loan amount", { loanAmount: 0 }],
    ["a negative loan amount", { loanAmount: -320000 }],
    ["an unreadable loan amount", { loanAmount: Number.NaN }],
    ["an endless loan amount", { loanAmount: Number.POSITIVE_INFINITY }],
    ["no rate", { rate: Number.NaN }],
    ["a negative rate", { rate: -0.01 }],
    ["a rate of 30%", { rate: 0.3 }],
    ["an endless rate", { rate: Number.POSITIVE_INFINITY }],
    ["no term", { termMonths: 0 }],
    ["a negative term", { termMonths: -360 }],
    ["a term that is not whole months", { termMonths: 180.5 }],
    ["an unreadable term", { termMonths: Number.NaN }],
    ["a term past 40 years", { termMonths: 481 }],
    ["unreadable lender fees", { lenderFees: Number.NaN }],
    ["negative lender fees", { lenderFees: -1 }],
    ["unreadable points", { points: Number.NaN }],
    ["negative points", { points: -0.01 }],
    ["points above 10%", { points: 0.1001 }],
    ["an unreadable lender credit", { lenderCredit: Number.NaN }],
    ["a negative lender credit", { lenderCredit: -1 }],
    ["unreadable mortgage insurance", { monthlyMi: Number.NaN }],
    ["negative mortgage insurance", { monthlyMi: -160, homeValue: 400000 }],
    ["an unreadable home value", { homeValue: Number.NaN }],
    ["a negative home value", { homeValue: -400000 }],
    ["negative prepaid interest", { prepaidInterest: -1 }],
    ["endless prepaid interest", { prepaidInterest: Number.POSITIVE_INFINITY }],
    ["mortgage insurance without a home value", { monthlyMi: 160 }],
    ["fees equal to the loan", { lenderFees: 320000, prepaidInterest: 0 }],
    ["fees larger than the loan", { lenderFees: 400000 }],
  ])("%s", (_name, changes) => {
    expect(calc(changes)).toBeNull();
  });

  it("fees that leave so little financed that the solver stops at its 100% ceiling", () => {
    // 1,000 financed against payments of 2,128.97 a month is far above 100% a year: no figure to show.
    expect(calc({ lenderFees: 319000, prepaidInterest: 0 })).toBeNull();
    expect(calc({ lenderFees: 300000, prepaidInterest: 0 })).toBeNull();
    // 120,000 financed against the same payments solves at about 21%.
    const r = calc({ lenderFees: 200000, prepaidInterest: 0 })!;
    expect(r.apr).toBeGreaterThan(0.2);
    expect(r.apr).toBeLessThan(0.22);
  });

  it("the edges that do give a result", () => {
    expect(calc({ rate: 0 })).not.toBeNull();
    expect(calc({ rate: 0.2999 })).not.toBeNull();
    expect(calc({ points: 0.1 })).not.toBeNull();
    expect(calc({ termMonths: 480 })).not.toBeNull();
    expect(calc({ lenderFees: 0, lenderCredit: 0, points: 0 })).not.toBeNull();
  });
});

describe("whatever is entered", () => {
  const grid: Partial<AprInput>[] = [];
  for (const rate of [0, 0.00002, 0.0001, 0.02, 0.07, 0.15, 0.2999]) {
    for (const lenderFees of [0, 0.01, 4000, 60000]) {
      for (const points of [0, 0.03, 0.1]) {
        for (const lenderCredit of [0, 2000, 90000]) {
          for (const termMonths of [120, 360]) {
            grid.push({ rate, lenderFees, points, lenderCredit, termMonths });
            grid.push({ rate, lenderFees, points, lenderCredit, termMonths, monthlyMi: 210, homeValue: 330000 });
          }
        }
      }
    }
  }

  it("the APR is never below the interest rate, and every figure is a number", () => {
    for (const changes of grid) {
      const r = calc(changes)!;
      const at = JSON.stringify(changes);
      expect(r, at).not.toBeNull();
      expect(r.apr, at).toBeGreaterThanOrEqual(changes.rate!);
      expect(r.spread, at).toBeGreaterThanOrEqual(0);
      expect(Object.is(r.spread, -0), at).toBe(false);
      const figures = [r.apr, r.spread, r.principalAndInterest, r.amountFinanced, r.financeCharge, r.totalOfPayments, r.miMonths, ...Object.values(r.fees).filter((v) => typeof v === "number")];
      for (const figure of figures) {
        expect(Number.isFinite(figure), at).toBe(true);
        expect(figure, at).toBeGreaterThanOrEqual(0);
        expect(Object.is(figure, -0), at).toBe(false);
      }
      expect(r.amountFinanced, at).toBeGreaterThan(0);
      expect(Math.round((r.totalOfPayments - r.amountFinanced) * 100), at).toBe(Math.round(r.financeCharge * 100));
    }
  });

  it("more fees mean a higher APR", () => {
    const aprs = [0, 1000, 4000, 12000].map((lenderFees) => calc({ lenderFees })!.apr);
    expect([...aprs].sort((a, b) => a - b)).toEqual(aprs);
    expect(new Set(aprs).size).toBe(4);
  });
});
