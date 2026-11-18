import { describe, expect, it } from "vitest";
import golden from "./golden.json";
import {
  ASSUMPTION_RANGE, buyingSlipsBack, calculateRentVsBuy, COST_INFLATION, MAX_YEARS, RATE_LIMIT, SELLING_COSTS_RANGE,
  type RentVsBuyInput, type YearPoint,
} from "./math";

const cases = golden.cases;
const named = (name: string): RentVsBuyInput => cases.find((c) => c.name === name)!.input;
const example = named("example");
const calc = (changes: Partial<RentVsBuyInput> = {}) => calculateRentVsBuy({ ...example, ...changes });

describe("matches the dashboard (golden cases from msfg-calc)", () => {
  it("was recorded with the model's fixed cost inflation", () => {
    expect(golden.costInflationPct).toBe(COST_INFLATION * 100);
  });

  it.each(cases)("$name", ({ input, expected }) => {
    const r = calculateRentVsBuy(input)!;
    expect(r).not.toBeNull();
    expect(r.monthlyPayment).toBe(expected.monthlyPayment);
    expect(r.buying.downPayment).toBe(expected.downPayment);
    expect(r.buying.mortgagePayments).toBe(expected.mortgagePayments);
    expect(r.buying.propertyTax).toBe(expected.propertyTax);
    expect(r.buying.insurance).toBe(expected.insurance);
    expect(r.buying.maintenance).toBe(expected.maintenance);
    expect(r.buying.totalPaid).toBe(expected.totalPaid);
    expect(r.buying.equity).toBe(expected.equity);
    expect(r.buying.netCost).toBe(expected.netCostBuying);
    expect(r.renting.rentPaid).toBe(expected.rentPaid);
    expect(r.renting.downPaymentGrowth).toBe(expected.downPaymentGrowth);
    expect(r.renting.netCost).toBe(expected.netCostRenting);
    expect(r.years.map((y) => y.year)).toEqual(expected.differenceByYear.map((_, i) => i + 1));
    expect(r.years.map((y) => y.difference)).toEqual(expected.differenceByYear);
    expect(r.difference).toBe(expected.differenceByYear.at(-1));
  });

  it("has the hand-checked example: $2,128.97 a month, buying ahead by $18,816.32 after 7 years, from year 5", () => {
    const r = calc()!;
    expect(r.loanAmount).toBe(320000);
    expect(r.monthlyPayment).toBe(2128.97);
    expect(r.difference).toBe(18816.32);
    expect(r.ahead).toBe("buying");
    expect(r.years[0].difference).toBe(-20817.02);
    expect(r.pullAheadYear).toBe(5);
  });

  it("gives each year's two net costs, and the last year is the result", () => {
    const r = calc()!;
    expect(r.years).toHaveLength(7);
    const last = r.years[6];
    expect(last).toEqual({ year: 7, netCostBuying: r.buying.netCost, netCostRenting: r.renting.netCost, difference: r.difference });
  });
});

describe("what the buyer ends up owning (hand-checked)", () => {
  it("is the home value minus the loan balance minus selling costs", () => {
    const { buying } = calc()!;
    expect(buying.homeValue).toBe(491949.55); // 400,000 x 1.03^7
    expect(buying.sellingCosts).toBe(29516.97); // 6% of it
    expect(buying.loanBalance).toBe(291671.73);
    expect(buying.equity).toBe(170760.85); // 491,949.55 - 291,671.73 - 29,516.97, before rounding
  });

  it("can be negative, when the sale would not cover the loan and the selling costs", () => {
    // Year 1 with nothing down and no rise in value: owes 395,936.76, sells for 400,000 less 24,000.
    const { buying } = calc({ downPayment: 0, appreciation: 0, stayYears: 1 })!;
    expect(buying.loanBalance).toBe(395936.76);
    expect(buying.equity).toBe(-19936.76);
    expect(buying.netCost).toBeCloseTo(buying.totalPaid + 19936.76, 2);
  });
});

describe("renting", () => {
  it("reports the monthly rent in the last year of the stay", () => {
    expect(calc()!.renting.lastMonthlyRent).toBe(2865.73); // 2,400 x 1.03^6
    expect(calc({ stayYears: 1 })!.renting.lastMonthlyRent).toBe(2400);
  });

  it("comes out ahead with a low rent and a short stay, and buying pulls ahead only later", () => {
    const r = calculateRentVsBuy(named("renting-ahead"))!;
    expect(r.ahead).toBe("renting");
    expect(r.difference).toBeLessThan(0);
    expect(r.pullAheadYear).not.toBeNull();
    expect(r.pullAheadYear!).toBeGreaterThan(3);
    expect(r.pullAheadYear!).toBeLessThanOrEqual(MAX_YEARS);
  });
});

describe("the year buying pulls ahead", () => {
  it("is the first year, when buying is ahead from the start", () => {
    expect(calculateRentVsBuy(named("zero-rate"))!.pullAheadYear).toBe(1);
  });

  it("does not depend on how long the stay is", () => {
    expect(calc({ stayYears: 2 })!.pullAheadYear).toBe(5);
    expect(calc({ stayYears: 40 })!.pullAheadYear).toBe(5);
  });

  it("is null when buying is never ahead within 40 years", () => {
    // A falling home value against a very low rent.
    const r = calc({ monthlyRent: 500, appreciation: -0.05 })!;
    expect(r.pullAheadYear).toBeNull();
    expect(r.ahead).toBe("renting");
  });
});

describe("a stay longer than the loan (the one deliberate difference from the dashboard)", () => {
  it("stops the payments when the loan ends: a 15-year loan over 20 years is 180 payments", () => {
    const r = calc({ termMonths: 180, stayYears: 20 })!;
    expect(r.monthlyPayment).toBe(2876.25);
    // 2,876.2505 x 180, the same total as the full 15-year golden case.
    expect(r.buying.mortgagePayments).toBe(517725.08);
    expect(r.buying.loanBalance).toBe(0);
    expect(r.buying.equity).toBe(679097.82); // 400,000 x 1.03^20 x 0.94, nothing owed
    for (const y of r.years) expect(Number.isFinite(y.netCostBuying) && Number.isFinite(y.netCostRenting)).toBe(true);
    // Years 16 to 20 add no mortgage payments.
    const at15 = calc({ termMonths: 180, stayYears: 15 })!;
    expect(at15.buying.mortgagePayments).toBe(r.buying.mortgagePayments);
    expect(r.years.slice(0, 15).map((y) => y.difference)).toEqual(at15.years.map((y) => y.difference));
  });
});

describe("down payment", () => {
  it("equal to the price means no loan: a payment of 0 and still a result", () => {
    const r = calc({ downPayment: 400000 })!;
    expect(r).not.toBeNull();
    expect(r.loanAmount).toBe(0);
    expect(r.monthlyPayment).toBe(0);
    expect(r.buying.mortgagePayments).toBe(0);
    expect(r.buying.loanBalance).toBe(0);
    expect(r.buying.downPayment).toBe(400000);
  });

  it("of zero works", () => {
    const r = calc({ downPayment: 0 })!;
    expect(r.loanAmount).toBe(400000);
    expect(r.renting.downPaymentGrowth).toBe(0);
  });
});

describe("nothing to compare gives null", () => {
  it.each<[string, Partial<RentVsBuyInput>]>([
    ["no rent", { monthlyRent: 0 }],
    ["a negative rent", { monthlyRent: -100 }],
    ["junk rent", { monthlyRent: Number.NaN }],
    ["no price", { homePrice: 0 }],
    ["junk price", { homePrice: Number.NaN }],
    ["a negative down payment", { downPayment: -1 }],
    ["a down payment above the price", { downPayment: 400000.01 }],
    ["a junk down payment", { downPayment: Number.NaN }],
    ["a rate that was not entered", { rate: Number.NaN }],
    ["a negative rate", { rate: -0.01 }],
    ["a 30% rate", { rate: 0.3 }],
    ["a stay of zero", { stayYears: 0 }],
    ["a stay of part of a year", { stayYears: 7.5 }],
    ["a stay past 40 years", { stayYears: 41 }],
    ["a junk stay", { stayYears: Number.NaN }],
    ["no loan term", { termMonths: 0 }],
    ["a junk loan term", { termMonths: Number.NaN }],
    ["appreciation not entered", { appreciation: Number.NaN }],
    ["rent increase not entered", { rentIncrease: Number.NaN }],
    ["selling costs not entered", { sellingCosts: Number.NaN }],
    ["investment return not entered", { investmentReturn: Number.NaN }],
    ["appreciation above 30%", { appreciation: 0.31 }],
    ["appreciation below -20%", { appreciation: -0.21 }],
    ["rent increase above 30%", { rentIncrease: 0.31 }],
    ["rent increase below -20%", { rentIncrease: -0.21 }],
    ["investment return above 30%", { investmentReturn: 0.31 }],
    ["investment return below -20%", { investmentReturn: -0.21 }],
    ["negative selling costs", { sellingCosts: -0.01 }],
    ["selling costs above 20%", { sellingCosts: 0.21 }],
    ["property tax not entered", { yearlyTax: Number.NaN }],
    ["insurance not entered", { yearlyInsurance: Number.NaN }],
    ["maintenance not entered", { yearlyMaintenance: Number.NaN }],
  ])("%s", (_name, changes) => {
    expect(calc(changes)).toBeNull();
  });

  it("accepts the edges: 0% rate, 40 years, and the ends of each assumption's range", () => {
    expect(calc({ rate: 0 })).not.toBeNull();
    expect(calc({ stayYears: MAX_YEARS })!.years).toHaveLength(40);
    expect(calc({ appreciation: -0.2, rentIncrease: 0.3, investmentReturn: -0.2, sellingCosts: 0.2 })).not.toBeNull();
    expect(calc({ appreciation: 0.3, rentIncrease: -0.2, investmentReturn: 0.3, sellingCosts: 0 })).not.toBeNull();
  });
});

describe("property tax, insurance and maintenance", () => {
  it("F1: give no result until all three are entered, and a 0 is an entry", () => {
    for (const id of ["yearlyTax", "yearlyInsurance", "yearlyMaintenance"] as const) {
      expect(calc({ [id]: Number.NaN }), id).toBeNull();
      expect(calc({ [id]: 0 }), id).not.toBeNull();
    }
    const none = calc({ yearlyTax: 0, yearlyInsurance: 0, yearlyMaintenance: 0 })!;
    expect(none.buying).toMatchObject({ propertyTax: 0, insurance: 0, maintenance: 0 });
    expect(none.buying.totalPaid).toBe(258833.31); // down payment plus 84 payments
    expect(none.difference).toBe(100038.41); // the figure the page used to show for costs left empty
  });

  it("count as zero when negative", () => {
    const none = calc({ yearlyTax: 0, yearlyInsurance: 0, yearlyMaintenance: 0 })!;
    expect(calc({ yearlyTax: -4800, yearlyInsurance: -1800, yearlyMaintenance: Number.NEGATIVE_INFINITY })).toEqual(none);
  });

  it("rise each year: tax with the home's value, insurance and maintenance by 3%", () => {
    const r = calc({ stayYears: 2 })!;
    expect(r.buying.propertyTax).toBe(9744); // 4,800 + 4,800 x 1.03
    expect(r.buying.insurance).toBe(3654); // 1,800 + 1,800 x 1.03
    expect(r.buying.maintenance).toBe(8120); // 4,000 + 4,000 x 1.03
    const flat = calc({ stayYears: 2, appreciation: 0 })!;
    expect(flat.buying.propertyTax).toBe(9600);
    expect(flat.buying.insurance).toBe(3654);
  });
});

describe("a tie", () => {
  it("is even, not renting ahead", () => {
    // Nothing down on a 0% ten-year loan, sold after a year with no costs and no change in value:
    // 12,000 of payments come straight back as equity, leaving 12,000 of maintenance against 12,000 of rent.
    const r = calculateRentVsBuy({
      monthlyRent: 1000, homePrice: 120000, downPayment: 0, rate: 0, stayYears: 1, termMonths: 120,
      yearlyTax: 0, yearlyInsurance: 0, yearlyMaintenance: 12000,
      appreciation: 0, rentIncrease: 0, sellingCosts: 0, investmentReturn: 0,
    })!;
    expect(r.buying.netCost).toBe(12000);
    expect(r.renting.netCost).toBe(12000);
    expect(r.difference).toBe(0);
    expect(r.ahead).toBe("even");
    expect(r.pullAheadYear).toBeNull();
  });
});

describe("F3: the limits the checks and the prompts share", () => {
  it("are the pinned values", () => {
    expect(RATE_LIMIT).toBe(0.3);
    expect(ASSUMPTION_RANGE).toEqual({ low: -0.2, high: 0.3 });
    expect(SELLING_COSTS_RANGE).toEqual({ low: 0, high: 0.2 });
  });

  it("are what the model checks against", () => {
    expect(calc({ rate: RATE_LIMIT })).toBeNull();
    expect(calc({ rate: RATE_LIMIT - 0.0001 })).not.toBeNull();
    for (const id of ["appreciation", "rentIncrease", "investmentReturn"] as const) {
      expect(calc({ [id]: ASSUMPTION_RANGE.low }), id).not.toBeNull();
      expect(calc({ [id]: ASSUMPTION_RANGE.high }), id).not.toBeNull();
      expect(calc({ [id]: ASSUMPTION_RANGE.low - 0.0001 }), id).toBeNull();
      expect(calc({ [id]: ASSUMPTION_RANGE.high + 0.0001 }), id).toBeNull();
    }
    expect(calc({ sellingCosts: SELLING_COSTS_RANGE.low })).not.toBeNull();
    expect(calc({ sellingCosts: SELLING_COSTS_RANGE.high })).not.toBeNull();
    expect(calc({ sellingCosts: SELLING_COSTS_RANGE.high + 0.0001 })).toBeNull();
  });
});

describe("F7: buying ahead, then not", () => {
  const point = (year: number, difference: number): YearPoint => ({ year, netCostBuying: 0, netCostRenting: difference, difference });
  const series = (...differences: number[]) => differences.map((d, i) => point(i + 1, d));

  it("is true only when a year after the first ahead year is not ahead", () => {
    expect(buyingSlipsBack(series(-5, -1, 3, 8))).toBe(false);
    expect(buyingSlipsBack(series(4, 8))).toBe(false);
    expect(buyingSlipsBack(series(-5, -1))).toBe(false);
    expect(buyingSlipsBack([])).toBe(false);
    expect(buyingSlipsBack(series(-5, 3, -1, 8))).toBe(true);
    expect(buyingSlipsBack(series(3, 0, 8))).toBe(true);
    expect(buyingSlipsBack(series(3, 8, -2))).toBe(true);
  });

  it("finds the reviewer's case: first ahead in year 5, behind in years 7 to 20, ahead at the end of 35 years", () => {
    const r = calculateRentVsBuy({
      monthlyRent: 5894, homePrice: 462086, downPayment: 16173, rate: 0.1175, stayYears: 35, termMonths: 240,
      yearlyTax: 544, yearlyInsurance: 4621, yearlyMaintenance: 8156,
      appreciation: 0.01, rentIncrease: -0.04, sellingCosts: 0.06, investmentReturn: -0.04,
    })!;
    expect(r.ahead).toBe("buying");
    // Behind for the first four years, ahead in years 5 and 6, behind again in years 7 to 20.
    expect(r.years.filter((y) => y.difference <= 0).map((y) => y.year)).toEqual([1, 2, 3, 4, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    expect(r.pullAheadYear).toBe(5);
    expect(buyingSlipsBack(r.years)).toBe(true);
    expect(buyingSlipsBack(calc()!.years)).toBe(false);
  });
});
