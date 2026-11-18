import { describe, expect, it } from "vitest";
import { switchDownUnit } from "../shared/fields";
import { BLANK, DETAIL_FIELDS, exampleValues, FRONT_FIELDS, keepTypedZero, switchUnitKeepingZero, toInput } from "./fields";
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

  const FIVE = { monthlyRent: "2,400", homePrice: "400,000", downPayment: "20", rate: "7", stayYears: "7" };
  const COSTS = ["yearlyTax", "yearlyInsurance", "yearlyMaintenance"] as const;

  it("F1: after Clear the five front inputs are not enough: the three costs are not entered", () => {
    const input = toInput({ ...BLANK, ...FIVE });
    expect(input).toMatchObject({ appreciation: 0.03, rentIncrease: 0.03, sellingCosts: 0.06, investmentReturn: 0.05 });
    for (const id of COSTS) expect(Number.isNaN(input[id]), id).toBe(true);
    expect(calculateRentVsBuy(input)).toBeNull();
  });

  it("F1: after Clear, the five inputs and the example's three costs give the example again", () => {
    const r = calculateRentVsBuy(toInput({ ...BLANK, ...FIVE, yearlyTax: "4,800", yearlyInsurance: "1,800", yearlyMaintenance: "4,000" }))!;
    expect(r.difference).toBe(18816.32);
  });

  it("F1: a typed 0 in a cost is entered; empty or unreadable is not", () => {
    const zeros = toInput({ ...BLANK, ...FIVE, yearlyTax: "0", yearlyInsurance: "0", yearlyMaintenance: "0.00" });
    expect(zeros).toMatchObject({ yearlyTax: 0, yearlyInsurance: 0, yearlyMaintenance: 0 });
    expect(calculateRentVsBuy(zeros)).not.toBeNull();
    for (const id of COSTS) {
      for (const text of ["", " ", ".", "abc", "4..8", "-"]) {
        expect(Number.isNaN(toInput({ ...example, [id]: text })[id]), `${id} ${JSON.stringify(text)}`).toBe(true);
        expect(result({ [id]: text }), `${id} ${JSON.stringify(text)}`).toBeNull();
      }
      expect(toInput({ ...example, [id]: "$1,234.50" })[id]).toBe(1234.5);
    }
  });

  it("keeps a typed 0 when the money box would empty it on leaving the field", () => {
    for (const id of ["downPayment", ...COSTS]) {
      expect(keepTypedZero(id, "0", ""), id).toBe("0");
      expect(keepTypedZero(id, "0.00", ""), id).toBe("0");
      expect(keepTypedZero(id, "", ""), id).toBe("");
      expect(keepTypedZero(id, "abc", ""), id).toBe("");
      expect(keepTypedZero(id, "4800", "4,800"), id).toBe("4,800");
    }
    expect(keepTypedZero("homePrice", "0", "")).toBe("");
    expect(keepTypedZero("monthlyRent", "0", "")).toBe("");
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
    expect(result({ downUnit: "usd", downPayment: "0" })!.loanAmount).toBe(400000);
  });

  it("F2: an empty or unreadable down payment is not entered, in either unit", () => {
    for (const downUnit of ["pct", "usd"]) {
      for (const downPayment of ["", " ", "2..5", ".", "abc"]) {
        const name = `${downUnit} ${JSON.stringify(downPayment)}`;
        expect(Number.isNaN(toInput({ ...example, downUnit, downPayment }).downPayment), name).toBe(true);
        expect(result({ downUnit, downPayment }), name).toBeNull();
      }
    }
    expect(toInput({ ...example, downPayment: "2.5" }).downPayment).toBe(10000);
    expect(toInput({ ...example, downPayment: "20%" }).downPayment).toBe(80000);
  });

  it("F2: keeps a typed 0 down when the unit changes, and converts everything else as before", () => {
    const zero = { ...example, downPayment: "0" };
    expect(switchUnitKeepingZero(zero, "usd")).toMatchObject({ downUnit: "usd", downPayment: "0" });
    expect(switchUnitKeepingZero({ ...zero, downUnit: "usd" }, "pct")).toMatchObject({ downUnit: "pct", downPayment: "0" });
    expect(result(switchUnitKeepingZero(zero, "usd"))!.loanAmount).toBe(400000);
    expect(switchUnitKeepingZero(example, "usd")).toEqual(switchDownUnit(example, "usd"));
    expect(switchUnitKeepingZero(example, "pct")).toBe(example);
    expect(switchUnitKeepingZero({ ...example, downPayment: "" }, "usd").downPayment).toBe("");
  });

  it("counts a negative yearly cost as zero", () => {
    expect(result({ yearlyTax: "-50", yearlyInsurance: "-1", yearlyMaintenance: "-4,000" })!.buying).toMatchObject({ propertyTax: 0, insurance: 0, maintenance: 0 });
  });
});
