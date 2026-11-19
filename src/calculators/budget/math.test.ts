import { describe, expect, it } from "vitest";
import golden from "./golden.json";
import { BACK_BANDS, bandFor, calculateBudget, FRONT_BANDS, RATE_RANGE, roundShare, type Band, type BudgetInput } from "./math";

const cases = golden.cases;
const named = (name: string): BudgetInput => cases.find((c) => c.name === name)!.input;
const example = named("example");
const calc = (changes: Partial<BudgetInput> = {}) => calculateBudget({ ...example, ...changes });
/** A ratio as the dashboard displays it: a percent to two decimals. */
const pct = (ratio: number) => Number((ratio * 100).toFixed(2));
/** The dashboard's status line as one of the three bands. */
const bandOfStatus = (status: string): Band => {
  if (status.startsWith("Within")) return "comfortable";
  if (status.startsWith("Above")) return "stretching";
  if (status.startsWith("Exceeds")) return "high";
  throw new Error("unexpected status: " + status);
};

describe("matches the dashboard (golden cases from msfg-calc)", () => {
  it("has the eight cases of the plan", () => {
    expect(cases.map((c) => c.name)).toEqual([
      "example", "stretching", "high", "band-edges", "with-savings-and-balances", "no-debts-no-living", "expenses-over-income", "itemized",
    ]);
  });

  it.each(cases)("$name", ({ input, expected }) => {
    const r = calculateBudget(input)!;
    expect(r).not.toBeNull();
    expect(pct(r.frontRatio)).toBe(expected.frontRatioPct);
    expect(pct(r.backRatio)).toBe(expected.backRatioPct);
    expect(r.frontBand).toBe(bandOfStatus(expected.frontStatus));
    expect(r.backBand).toBe(bandOfStatus(expected.backStatus));
    expect(r.residual).toBe(expected.residual);
    expect(r.spendable).toBe(expected.spendable);
    expect(r.totalExpenses).toBe(expected.totalExpenses);
    expect(r.cashFlow).toBe(expected.cashFlow);
    // The dashboard shows "0 months" where this model has nothing to show.
    expect(r.reserveMonths ?? 0).toBe(expected.reserveMonths);
  });

  it("has the hand-checked example: 30.00% and 36.67%, $5,700 after housing and debts, $1,220 left", () => {
    const r = calc()!;
    expect(r.frontRatio).toBeCloseTo(0.3, 12); // 2,700 / 9,000
    expect(pct(r.backRatio)).toBe(36.67); // 3,300 / 9,000
    expect(r).toMatchObject({
      frontBand: "comfortable", backBand: "comfortable",
      residual: 5700, // 9,000 - 2,700 - 600
      taxAmount: 1980, // 22% of 9,000
      savingsAmount: 0,
      spendable: 7020, // 9,000 - 1,980
      totalExpenses: 5800, // 2,700 + 600 + 2,500
      cashFlow: 1220, // 7,020 - 5,800
      reserveMonths: null,
    });
  });

  it("D1: what is left after all expenses, before tax and savings, is the income less housing, debts and living costs", () => {
    expect(calc()!.residualAfterLiving).toBe(3200); // 9,000 - 5,800
    expect(calc({ savingsRate: 0.1 })!.residualAfterLiving).toBe(3200); // tax and savings are not in it
    // 5,000 - 1,600 - 750 - 1,700 = 950, while the cash flow is 5,000 - 1,100 - 4,050 = -150.
    expect(calc({ grossIncome: 5000, housing: 1600, debts: 750, living: 1700 })).toMatchObject({ residual: 2650, residualAfterLiving: 950, cashFlow: -150 });
    expect(calc({ grossIncome: 4000, taxRate: 0.2, housing: 2500, debts: 1200, living: 1500 })!.residualAfterLiving).toBe(-1200);
    expect(Object.is(calc({ grossIncome: 5800 })!.residualAfterLiving, 0)).toBe(true);
  });

  it("the itemized case is the example typed line by line", () => {
    expect(named("itemized")).toEqual(example);
    expect(calculateBudget(named("itemized"))).toEqual(calc());
  });

  it("has the band of each case", () => {
    const bands = Object.fromEntries(cases.map((c) => [c.name, [calculateBudget(c.input)!.frontBand, calculateBudget(c.input)!.backBand]]));
    expect(bands).toEqual({
      example: ["comfortable", "comfortable"],
      stretching: ["stretching", "stretching"],
      high: ["high", "high"],
      "band-edges": ["comfortable", "comfortable"],
      "with-savings-and-balances": ["comfortable", "comfortable"],
      "no-debts-no-living": ["comfortable", "comfortable"],
      "expenses-over-income": ["high", "high"],
      itemized: ["comfortable", "comfortable"],
    });
  });
});

describe("bands", () => {
  it("are the dashboard's: 32% and 47% of income for housing, 47% and 55% for housing and debts", () => {
    expect(FRONT_BANDS).toEqual({ comfortable: 0.32, stretching: 0.47 });
    expect(BACK_BANDS).toEqual({ comfortable: 0.47, stretching: 0.55 });
  });

  it("put a ratio exactly on an edge in the band below it", () => {
    expect(bandFor(0.32, FRONT_BANDS)).toBe("comfortable");
    expect(bandFor(0.3201, FRONT_BANDS)).toBe("stretching");
    expect(bandFor(0.47, FRONT_BANDS)).toBe("stretching");
    expect(bandFor(0.4701, FRONT_BANDS)).toBe("high");
    expect(bandFor(0.47, BACK_BANDS)).toBe("comfortable");
    expect(bandFor(0.4701, BACK_BANDS)).toBe("stretching");
    expect(bandFor(0.55, BACK_BANDS)).toBe("stretching");
    expect(bandFor(0.5501, BACK_BANDS)).toBe("high");
    expect(bandFor(0, FRONT_BANDS)).toBe("comfortable");
    expect(bandFor(3, BACK_BANDS)).toBe("high");
  });

  it("the edges hold for ratios worked out from amounts", () => {
    // 3,200 and 4,700 of 10,000: the golden band-edges case. 4,700 and 5,500 of 10,000: the upper edges.
    expect(calc({ grossIncome: 10000, housing: 3200, debts: 1500 })).toMatchObject({ frontBand: "comfortable", backBand: "comfortable" });
    expect(calc({ grossIncome: 10000, housing: 4700, debts: 800 })).toMatchObject({ frontBand: "stretching", backBand: "stretching" });
    expect(calc({ grossIncome: 10000, housing: 4701, debts: 800 })).toMatchObject({ frontBand: "high", backBand: "high" });
  });
});

describe("B1: a band is read from the share as it is shown, rounded to a hundredth of a percent", () => {
  it("rounds a share to four decimal places", () => {
    expect(roundShare(4233 / 9000)).toBe(0.4703);
    expect(roundShare(2411.1 / 5130)).toBe(0.47);
    expect(roundShare(0.366666)).toBe(0.3667);
    expect(roundShare(0)).toBe(0);
  });

  it("puts a share that shows as the edge in the lower band, and one a hundredth above it in the upper", () => {
    expect(bandFor(0.47004, BACK_BANDS)).toBe("comfortable");
    expect(bandFor(0.4700499, FRONT_BANDS)).toBe("stretching");
    expect(bandFor(0.47006, BACK_BANDS)).toBe("stretching");
    expect(bandFor(0.4701, FRONT_BANDS)).toBe("high");
    expect(bandFor(0.55004, BACK_BANDS)).toBe("stretching");
    expect(bandFor(0.32004, FRONT_BANDS)).toBe("comfortable");
  });

  it("the reviewer's cases: 4,233 of 9,000 is 47.03% and the upper band; 2,411.10 of 5,130 is exactly 47% and the lower", () => {
    expect(calc({ grossIncome: 9000, housing: 4233, debts: 0 })).toMatchObject({ frontBand: "high", backBand: "stretching" });
    expect(calc({ grossIncome: 5130, housing: 2411.1, debts: 0 })).toMatchObject({ frontBand: "stretching", backBand: "comfortable" });
    // With cents the edge holds too: 5,500.00 of 10,000 and a cent either side of what shows as 55.00%.
    expect(calc({ grossIncome: 10000, housing: 5500, debts: 0 })!.backBand).toBe("stretching");
    expect(calc({ grossIncome: 10000, housing: 5500.49, debts: 0 })!.backBand).toBe("stretching");
    expect(calc({ grossIncome: 10000, housing: 5500.5, debts: 0 })!.backBand).toBe("high");
  });
});

describe("months of housing the balances cover", () => {
  it("is whole months, rounded down", () => {
    expect(calc({ balances: 25000 })!.reserveMonths).toBe(9); // 25,000 / 2,700 = 9.26
    expect(calc({ balances: 2699 })!.reserveMonths).toBe(0);
    expect(calc({ balances: 2700 })!.reserveMonths).toBe(1);
  });

  it("is null without balances", () => {
    for (const balances of [0, Number.NaN, -500]) expect(calc({ balances })!.reserveMonths, String(balances)).toBeNull();
  });

  it("is null without housing", () => {
    const r = calc({ housing: 0, balances: 25000 })!;
    expect(r.reserveMonths).toBeNull();
    expect(r).toMatchObject({ frontRatio: 0, frontBand: "comfortable", residual: 8400, cashFlow: 3920 });
  });
});

describe("nothing to work out gives no result", () => {
  it.each([
    ["income of zero", { grossIncome: 0 }],
    ["a negative income", { grossIncome: -9000 }],
    ["an income that was not entered", { grossIncome: Number.NaN }],
    ["an endless income", { grossIncome: Number.POSITIVE_INFINITY }],
    ["a tax rate that was not entered", { taxRate: Number.NaN }],
    ["a negative tax rate", { taxRate: -0.01 }],
    ["a tax rate above 100%", { taxRate: 1.01 }],
    ["a negative savings rate", { savingsRate: -0.01 }],
    ["a savings rate above 100%", { savingsRate: 1.01 }],
    ["housing that was not entered", { housing: Number.NaN }],
    ["negative housing", { housing: -1 }],
    ["debts that were not entered", { debts: Number.NaN }],
    ["negative debts", { debts: -1 }],
    ["living costs that were not entered", { living: Number.NaN }],
    ["negative living costs", { living: -1 }],
  ])("%s", (_name, changes) => {
    expect(calc(changes)).toBeNull();
  });

  it("exports the range a rate has to be in", () => {
    expect(RATE_RANGE).toEqual({ low: 0, high: 1 });
    expect(calc({ taxRate: 0 })).not.toBeNull();
    expect(calc({ taxRate: 1 })).not.toBeNull();
  });

  it("but zero is an answer for the tax rate, housing, debts and living costs", () => {
    const r = calc({ taxRate: 0, housing: 0, debts: 0, living: 0 })!;
    expect(r).toMatchObject({ frontRatio: 0, backRatio: 0, residual: 9000, taxAmount: 0, spendable: 9000, totalExpenses: 0, cashFlow: 9000 });
  });
});

describe("the savings rate", () => {
  it("is 0 when it was not entered", () => {
    expect(calc({ savingsRate: Number.NaN })).toEqual(calc({ savingsRate: 0 }));
    expect(calc({ savingsRate: Number.NaN })!.savingsAmount).toBe(0);
  });

  it("comes off the gross income, beside the tax", () => {
    expect(calc({ savingsRate: 0.1 })).toMatchObject({ savingsAmount: 900, spendable: 6120, cashFlow: 320 });
  });
});

describe("never NaN, Infinity or a negative zero", () => {
  const sound = (r: object) => {
    for (const [key, value] of Object.entries(r)) {
      if (typeof value !== "number") continue;
      expect(Number.isFinite(value), key).toBe(true);
      expect(Object.is(value, -0), key).toBe(false);
    }
  };

  it("with tax plus savings of 100%: nothing is spendable", () => {
    const r = calc({ taxRate: 0.6, savingsRate: 0.4 })!;
    sound(r);
    expect(r).toMatchObject({ taxAmount: 5400, savingsAmount: 3600, spendable: 0, cashFlow: -5800 });
  });

  it("with a 100% tax rate", () => {
    const r = calc({ taxRate: 1 })!;
    sound(r);
    expect(r).toMatchObject({ spendable: 0, cashFlow: -5800 });
  });

  it("with tax plus savings above 100%: spendable income is negative", () => {
    const r = calc({ taxRate: 0.7, savingsRate: 0.5 })!;
    sound(r);
    expect(r).toMatchObject({ spendable: -1800, cashFlow: -7600 });
  });

  it("with expenses above income: the residual and the cash flow are negative", () => {
    const r = calc({ grossIncome: 3000 })!;
    sound(r);
    expect(r).toMatchObject({ residual: -300, frontBand: "high", backBand: "high", cashFlow: -3460 }); // 3,000 x 0.78 - 5,800
    expect(r.backRatio).toBeCloseTo(1.1, 12);
  });

  it("when everything comes to exactly zero", () => {
    const r = calc({ taxRate: 0, housing: 9000, debts: 0, living: 0 })!;
    sound(r);
    expect(r).toMatchObject({ residual: 0, cashFlow: 0, frontRatio: 1 });
  });

  it("rounds each figure to cents", () => {
    const r = calc({ grossIncome: 3333.33, taxRate: 0.0765, savingsRate: 0.05 })!;
    expect(r.taxAmount).toBe(255); // 254.9997
    expect(r.savingsAmount).toBe(166.67); // 166.6665
    expect(r.spendable).toBe(2911.66); // 3,333.33 - 254.9997 - 166.6665 = 2,911.6638
  });
});
