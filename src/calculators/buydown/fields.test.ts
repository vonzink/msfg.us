import { describe, expect, it } from "vitest";
import { BLANK, DETAIL_FIELDS, exampleValues, FRONT_FIELDS, toInput } from "./fields";
import { calculateBuydown } from "./math";

const example = exampleValues(7);
const result = (changes: Record<string, string>) => calculateBuydown(toInput({ ...example, ...changes }));

describe("buydown fields", () => {
  it("has four inputs up front and three behind Add detail", () => {
    expect(FRONT_FIELDS.map((f) => f.id)).toEqual(["loanAmount", "rate", "termYears", "buydownType"]);
    expect(DETAIL_FIELDS.map((f) => f.id)).toEqual(["yearlyTax", "yearlyInsurance", "monthlyHoa"]);
  });

  it("opens on a 2-1 buydown of a $320,000 loan at the tenant's rate", () => {
    expect(toInput(example)).toEqual({ loanAmount: 320000, annualRate: 0.07, termYears: 30, type: "2-1", yearlyTax: 0, yearlyInsurance: 0, monthlyHoa: 0 });
    expect(exampleValues(6.5).rate).toBe("6.5");
  });

  it("offers the four temporary buydowns", () => {
    expect(FRONT_FIELDS.find((f) => f.id === "buydownType")!.options!.map((o) => o.value)).toEqual(["3-2-1", "2-1", "1-1", "1-0"]);
  });

  it("falls back to a 2-1 for a buydown type it does not know", () => {
    expect(toInput({ ...example, buydownType: "9-9-9" }).type).toBe("2-1");
  });

  it("clears to empty fields but keeps the choices", () => {
    expect(BLANK).toMatchObject({ loanAmount: "", rate: "", termYears: "30", buydownType: "2-1" });
  });
});

describe("junk in a field gives no result, never a crash", () => {
  it.each([
    ["letters for the loan amount", { loanAmount: "abc" }],
    ["an empty loan amount", { loanAmount: "" }],
    ["an empty rate", { rate: "" }],
    ["a rate that is only a decimal point so far", { rate: "." }],
    ["a 99% rate", { rate: "99" }],
    ["a rate with two decimal points", { rate: "7..5" }],
    ["a negative rate", { rate: "-5" }],
    ["a cleared form", BLANK],
  ])("%s", (_name, changes) => {
    expect(result(changes)).toBeNull();
  });
});
