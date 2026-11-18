import { describe, expect, it } from "vitest";
import { BLANK, DETAIL_FIELDS, exampleValues, FRONT_FIELDS, toInput } from "./fields";
import { calculateBreakeven } from "./math";

const example = exampleValues(7);
const result = (changes: Record<string, string>) => calculateBreakeven(toInput({ ...example, ...changes }));

describe("refinance breakeven fields", () => {
  it("has six inputs up front and six behind Add detail", () => {
    expect(FRONT_FIELDS.map((f) => f.id)).toEqual(["currentBalance", "currentRate", "yearsLeft", "newRate", "newTermYears", "closingCosts"]);
    expect(DETAIL_FIELDS.map((f) => f.id)).toEqual(["newLoanAmount", "cashOut", "debtPaymentsPaidOff", "currentMi", "newMi", "keepYears"]);
  });

  it("opens on a one-point rate drop from the tenant's example rate, breaking even in 23 months", () => {
    const input = toInput(example);
    expect(input).toMatchObject({ currentBalance: 300000, monthsLeft: 324, newTermMonths: 360, closingCosts: 6000 });
    expect(input.currentRate).toBeCloseTo(0.08, 12);
    expect(input.newRate).toBeCloseTo(0.07, 12);
    expect(calculateBreakeven(input)!.breakevenMonths).toBe(23);
    expect(exampleValues(6.5)).toMatchObject({ newRate: "6.5", currentRate: "7.5" });
  });

  it("turns years, including part years, into whole months", () => {
    expect(toInput({ ...example, yearsLeft: "22.5" }).monthsLeft).toBe(270);
    expect(toInput({ ...example, keepYears: "7" }).keepMonths).toBe(84);
    expect(toInput({ ...example, newTermYears: "15" }).newTermMonths).toBe(180);
  });

  it("leaves the optional figures as not given when they are empty", () => {
    const input = toInput(example);
    expect(Number.isNaN(input.newLoanAmount)).toBe(true);
    expect(Number.isNaN(input.keepMonths)).toBe(true);
    expect(calculateBreakeven(input)!.keep).toBeNull();
    expect(result({ keepYears: "5" })!.keep).toEqual({ months: 60, netSavings: 10015.8 });
  });

  it("clears to empty fields but keeps the term choice", () => {
    expect(BLANK).toMatchObject({ currentBalance: "", currentRate: "", newRate: "", newTermYears: "30" });
  });
});

describe("junk in a field gives no result, never a crash", () => {
  it.each([
    ["an empty balance", { currentBalance: "" }],
    ["letters for the balance", { currentBalance: "abc" }],
    ["an empty current rate", { currentRate: "" }],
    ["an empty new rate", { newRate: "" }],
    ["a rate that is only a decimal point so far", { newRate: "." }],
    ["a rate with two decimal points", { currentRate: "7..5" }],
    ["a 99% rate", { newRate: "99" }],
    ["no years left", { yearsLeft: "" }],
    ["zero years left", { yearsLeft: "0" }],
    ["a cleared form", BLANK],
  ])("%s", (_name, changes) => {
    expect(result(changes)).toBeNull();
  });
});
