import { describe, expect, it } from "vitest";
import { downPaymentField, parseNumber, parseRate, switchDownUnit } from "./fields";

describe("parseRate", () => {
  it("reads a percent as a decimal", () => {
    expect(parseRate("7")).toBeCloseTo(0.07, 12);
    expect(parseRate("6.875%")).toBeCloseTo(0.06875, 12);
    expect(parseRate(" 0 ")).toBe(0);
    expect(parseRate("-5")).toBeCloseTo(-0.05, 12);
  });

  it("reads a decimal comma as a decimal point", () => {
    expect(parseRate("3,5")).toBeCloseTo(0.035, 12);
  });

  it("is NaN, not zero, for anything it cannot read as one number", () => {
    for (const text of ["", " ", ".", "%", "abc", "9..0", "9.0.1", "7..5", "1-2"]) {
      expect(Number.isNaN(parseRate(text)), JSON.stringify(text)).toBe(true);
    }
    expect(Number.isNaN(parseRate(undefined))).toBe(true);
  });
});

describe("the down payment box", () => {
  it("is a percent or a dollar amount, under the same id and label", () => {
    expect(downPaymentField("pct")).toEqual({ id: "downPayment", label: "Down payment", type: "pct", example: "20" });
    expect(downPaymentField("usd")).toEqual({ id: "downPayment", label: "Down payment", type: "money", example: "80,000" });
  });
});

describe("switching the down payment between percent and dollars", () => {
  const example = { homePrice: "400,000", downPayment: "20", downUnit: "pct", rate: "7" };

  it("keeps the same down payment, converted to the new unit", () => {
    const dollars = switchDownUnit(example, "usd");
    expect(dollars).toMatchObject({ downUnit: "usd", downPayment: "80,000" });
    expect(parseNumber(dollars.downPayment)).toBe(80000);
    expect(switchDownUnit(dollars, "pct")).toMatchObject({ downUnit: "pct", downPayment: "20" });
  });

  it("leaves every other field alone", () => {
    expect(switchDownUnit(example, "usd")).toEqual({ ...example, downUnit: "usd", downPayment: "80,000" });
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
