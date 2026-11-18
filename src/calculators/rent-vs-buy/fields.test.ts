import { describe, expect, it } from "vitest";
import { switchDownUnit } from "../shared/fields";
import { BLANK, DETAIL_FIELDS, exampleValues, FRONT_FIELDS, toInput } from "./fields";
import golden from "./golden.json";
import { calculateRentVsBuy } from "./math";

const example = exampleValues(7);
const result = (changes: Record<string, string>) => calculateRentVsBuy(toInput({ ...example, ...changes }));
const field = (id: string) => [...FRONT_FIELDS, ...DETAIL_FIELDS].find((f) => f.id === id)!;
const ASSUMPTION_RATES = ["appreciation", "rentIncrease", "sellingCosts", "investmentReturn"];

describe("rent vs buy fields", () => {
  it("has five inputs up front (plus the down payment unit) and eight behind Add detail", () => {
    expect(FRONT_FIELDS.map((f) => f.id)).toEqual(["monthlyRent", "homePrice", "downPayment", "downUnit", "rate", "stayYears"]);
    expect(DETAIL_FIELDS.map((f) => f.id)).toEqual([
      "termYears", "yearlyTax", "yearlyInsurance", "yearlyMaintenance", "appreciation", "rentIncrease", "sellingCosts", "investmentReturn",
    ]);
  });

  it("has the pinned labels", () => {
    expect([...FRONT_FIELDS, ...DETAIL_FIELDS].map((f) => f.label)).toEqual([
      "Monthly rent", "Home price", "Down payment", "Down payment as", "Interest rate", "Years you plan to stay",
      "Loan term", "Property tax", "Homeowners insurance", "Maintenance",
      "Home value rises", "Rent rises", "Selling costs", "Return if the down payment were invested",
    ]);
  });

  it("has the pinned hints, types and choices", () => {
    expect(field("monthlyRent")).toMatchObject({ type: "money", hint: "Per month." });
    expect(field("stayYears")).toMatchObject({ type: "num", suffix: "yr" });
    expect(field("termYears").options!.map((o) => o.value)).toEqual(["10", "15", "20", "25", "30"]);
    expect(field("downUnit").options!.map((o) => o.value)).toEqual(["pct", "usd"]);
    for (const id of ["yearlyTax", "yearlyInsurance"]) expect(field(id)).toMatchObject({ type: "money", hint: "Per year." });
    expect(field("yearlyMaintenance")).toMatchObject({ type: "money", hint: "Per year. About 1% of the home price is a common rule of thumb." });
    for (const id of ["appreciation", "rentIncrease", "investmentReturn"]) expect(field(id)).toMatchObject({ type: "pct", hint: "Per year." });
    expect(field("sellingCosts")).toMatchObject({ type: "pct", hint: "Of the sale price." });
  });

  it("opens with the pinned example values at the tenant's rate", () => {
    expect(example).toEqual({
      monthlyRent: "2,400", homePrice: "400,000", downPayment: "20", downUnit: "pct", rate: "7", stayYears: "7",
      termYears: "30", yearlyTax: "4,800", yearlyInsurance: "1,800", yearlyMaintenance: "4,000",
      appreciation: "3", rentIncrease: "3", sellingCosts: "6", investmentReturn: "5",
    });
    expect(exampleValues(6.5).rate).toBe("6.5");
  });

  it("at 7% is exactly the golden example, with buying pulling ahead in year 5", () => {
    const input = toInput(example);
    expect(input).toEqual(golden.cases.find((c) => c.name === "example")!.input);
    const r = calculateRentVsBuy(input)!;
    expect(r.pullAheadYear).toBe(5);
    expect(r.monthlyPayment).toBe(2128.97);
  });

  it("gives the same input for a down payment in dollars and in percent", () => {
    const dollars = { ...example, downUnit: "usd", downPayment: "80,000" };
    expect(toInput(dollars)).toEqual(toInput(example));
    expect(toInput(switchDownUnit(example, "usd"))).toEqual(toInput(example));
    expect(toInput({ ...example, downPayment: "10" }).downPayment).toBe(40000);
    expect(toInput({ ...example, downUnit: "usd", downPayment: "50,000" }).downPayment).toBe(50000);
  });

  it("turns the loan term into months and the stay into a whole year", () => {
    expect(toInput({ ...example, termYears: "15" }).termMonths).toBe(180);
    expect(toInput({ ...example, stayYears: "7.4" }).stayYears).toBe(7);
    expect(toInput({ ...example, stayYears: "9.5" }).stayYears).toBe(10);
    expect(Number.isNaN(toInput({ ...example, stayYears: "" }).stayYears)).toBe(true);
    expect(Number.isNaN(toInput({ ...example, stayYears: "abc" }).stayYears)).toBe(true);
  });

  it("clears to empty amounts, the default choices and the four starting assumption rates", () => {
    expect(BLANK).toEqual({
      monthlyRent: "", homePrice: "", downPayment: "", downUnit: "pct", rate: "", stayYears: "",
      termYears: "30", yearlyTax: "", yearlyInsurance: "", yearlyMaintenance: "",
      appreciation: "3", rentIncrease: "3", sellingCosts: "6", investmentReturn: "5",
    });
    for (const id of ASSUMPTION_RATES) expect(BLANK[id], id).toBe(example[id]);
  });

  it("after Clear needs only the five front inputs again, with empty costs counted as zero", () => {
    const input = toInput({ ...BLANK, monthlyRent: "2,400", homePrice: "400,000", downPayment: "20", rate: "7", stayYears: "7" });
    expect(input).toMatchObject({ yearlyTax: 0, yearlyInsurance: 0, yearlyMaintenance: 0, appreciation: 0.03, rentIncrease: 0.03, sellingCosts: 0.06, investmentReturn: 0.05 });
    expect(calculateRentVsBuy(input)).not.toBeNull();
  });
});

describe("nothing to compare gives no result, never a crash", () => {
  it.each([
    ["a cleared form", BLANK],
    ["an empty rent", { monthlyRent: "" }],
    ["letters for the rent", { monthlyRent: "abc" }],
    ["an empty price", { homePrice: "" }],
    ["letters for the price", { homePrice: "abc" }],
    ["an empty stay", { stayYears: "" }],
    ["letters for the stay", { stayYears: "abc" }],
    ["a stay of zero", { stayYears: "0" }],
    ["a stay past 40 years", { stayYears: "41" }],
    ["an empty rate", { rate: "" }],
    ["a rate that is only a decimal point so far", { rate: "." }],
    ["a rate with two decimal points", { rate: "7..5" }],
    ["a 99% rate", { rate: "99" }],
    ["a down payment over 100%", { downPayment: "120" }],
    ["a down payment in dollars above the price", { downUnit: "usd", downPayment: "500,000" }],
    ["a negative down payment", { downPayment: "-5" }],
  ])("%s", (_name, changes) => {
    expect(result(changes)).toBeNull();
  });

  it.each(ASSUMPTION_RATES)("an emptied or junk %s", (id) => {
    for (const text of ["", ".", "3..5", "abc"]) expect(result({ [id]: text }), JSON.stringify(text)).toBeNull();
  });

  it.each(ASSUMPTION_RATES)("but a typed 0 in %s is a real 0%%", (id) => {
    const r = result({ [id]: "0" });
    expect(r).not.toBeNull();
    expect(toInput({ ...example, [id]: "0" })[id as "appreciation"]).toBe(0);
  });

  it("accepts a typed 0% interest rate and a zero down payment", () => {
    expect(result({ rate: "0" })!.monthlyPayment).toBe(888.89);
    expect(result({ downPayment: "0" })!.loanAmount).toBe(400000);
    expect(result({ downPayment: "" })!.loanAmount).toBe(400000);
  });

  it("treats junk in a yearly cost as zero", () => {
    expect(result({ yearlyTax: "abc", yearlyInsurance: "", yearlyMaintenance: "-50" })!.buying).toMatchObject({ propertyTax: 0, insurance: 0, maintenance: 0 });
  });
});
