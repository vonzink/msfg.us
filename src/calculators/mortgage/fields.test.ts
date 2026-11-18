import { describe, expect, it } from "vitest";
import { BLANK, DETAIL_FIELDS, exampleValues, FRONT_FIELDS, switchDownUnit, toInput } from "./fields";
import { calculateMortgage } from "./math";

const start = { month: 0, year: 2027 };
const example = exampleValues(7);
const result = (changes: Record<string, string>) => calculateMortgage(toInput({ ...example, ...changes }, start));

describe("mortgage fields", () => {
  it("has six inputs up front (plus the down payment unit) and four behind Add detail", () => {
    expect(FRONT_FIELDS.map((f) => f.id)).toEqual(["homePrice", "downPayment", "downUnit", "rate", "termYears", "yearlyTax", "yearlyInsurance"]);
    expect(DETAIL_FIELDS.map((f) => f.id)).toEqual(["monthlyHoa", "monthlyPmi", "extraAmount", "extraFrequency"]);
  });

  it("opens with a worked example at the tenant's rate", () => {
    const input = toInput(example, start);
    expect(input).toMatchObject({ homePrice: 400000, downPayment: 80000, annualRate: 0.07, termYears: 30, yearlyTax: 4800, yearlyInsurance: 1800 });
    expect(exampleValues(6.5).rate).toBe("6.5");
    expect(calculateMortgage(input)!.monthlyPI).toBe(2128.97);
  });

  it("reads the down payment as dollars or as a percent of the price", () => {
    expect(toInput({ ...example, downUnit: "usd", downPayment: "50,000" }, start).downPayment).toBe(50000);
    expect(toInput({ ...example, downUnit: "pct", downPayment: "10" }, start).downPayment).toBe(40000);
  });

  it("clears to empty fields but keeps the choices", () => {
    expect(BLANK.homePrice).toBe("");
    expect(BLANK.rate).toBe("");
    expect(BLANK.termYears).toBe("30");
    expect(BLANK.downUnit).toBe("pct");
    expect(BLANK.extraFrequency).toBe("monthly");
  });
});

describe("switching the down payment between percent and dollars", () => {
  it("keeps the same down payment, converted to the new unit", () => {
    const dollars = switchDownUnit(example, "usd");
    expect(dollars).toMatchObject({ downUnit: "usd", downPayment: "80,000" });
    expect(toInput(dollars, start).downPayment).toBe(80000);
    expect(switchDownUnit(dollars, "pct")).toMatchObject({ downUnit: "pct", downPayment: "20" });
  });

  it("rounds a converted percent to two places", () => {
    expect(switchDownUnit({ ...example, downUnit: "usd", downPayment: "33,333" }, "pct").downPayment).toBe("8.33");
  });

  it("clears the box when there is no price to convert against", () => {
    expect(switchDownUnit({ ...example, homePrice: "" }, "usd").downPayment).toBe("");
    expect(switchDownUnit({ ...example, homePrice: "", downUnit: "usd", downPayment: "50,000" }, "pct").downPayment).toBe("");
  });

  it("changes nothing when the unit is already selected", () => {
    expect(switchDownUnit(example, "pct")).toEqual(example);
  });
});

describe("junk in a field gives no result, never a crash", () => {
  it.each([
    ["letters for the price", { homePrice: "abc" }],
    ["an empty price", { homePrice: "" }],
    ["a down payment over 100%", { downPayment: "120" }],
    ["a down payment in dollars above the price", { downUnit: "usd", downPayment: "500,000" }],
    ["a 99% rate", { rate: "99" }],
    ["a negative rate", { rate: "-5" }],
    ["an empty rate", { rate: "" }],
    ["letters for the rate", { rate: "abc" }],
    ["a rate that is only a decimal point so far", { rate: "." }],
    ["a negative down payment", { downPayment: "-5" }],
    ["a cleared form", BLANK],
  ])("%s", (_name, changes) => {
    expect(result(changes)).toBeNull();
  });

  it("treats junk in an optional field as zero", () => {
    // Principal and interest plus $150 a month of insurance; the tax and HOA entries are ignored.
    expect(result({ yearlyTax: "abc", monthlyHoa: "-50" })!.first.total).toBe(2278.97);
  });

  it("accepts a typed 0% rate", () => {
    expect(result({ rate: "0" })!.monthlyPI).toBe(888.89);
  });
});
