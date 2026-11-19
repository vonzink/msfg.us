import { describe, expect, it } from "vitest";
import { downPaymentField, moneyOnBlur, parseNumber, parseRate, switchDownUnit, typedAmount } from "./fields";

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

describe("typedAmount: an amount where 0 is an answer", () => {
  it("reads one number, dropping $, %, commas and spaces", () => {
    expect(typedAmount("$1,234.50")).toBe(1234.5);
    expect(typedAmount(" 2 400 ")).toBe(2400);
    expect(typedAmount("20%")).toBe(20);
    expect(typedAmount(".5")).toBe(0.5);
    expect(typedAmount("-5")).toBe(-5);
    expect(typedAmount("0")).toBe(0);
    expect(typedAmount("0.00")).toBe(0);
  });

  it("is NaN, never 0, for empty or anything that is not one number", () => {
    for (const text of ["", " ", ".", "-", "abc", "4..8", "15o", "1-2", "$"]) {
      expect(Number.isNaN(typedAmount(text)), JSON.stringify(text)).toBe(true);
    }
    expect(Number.isNaN(typedAmount(undefined))).toBe(true);
  });
});

describe("what a money box holds after focus leaves it", () => {
  it("groups the digits and keeps up to two decimals", () => {
    expect(moneyOnBlur("4800")).toBe("4,800");
    expect(moneyOnBlur("$1,234.567")).toBe("1,234.57");
    expect(moneyOnBlur("4800", true)).toBe("4,800");
  });

  it("empties a 0 and anything unreadable, as it always has", () => {
    for (const text of ["0", "0.00", "", "abc", ".", "$"]) expect(moneyOnBlur(text), JSON.stringify(text)).toBe("");
  });

  it("keeps a typed 0 as 0 when the field says 0 is an answer, and still empties what is not a number", () => {
    for (const text of ["0", "0.00", "$0", " 0 "]) expect(moneyOnBlur(text, true), JSON.stringify(text)).toBe("0");
    for (const text of ["", " ", "abc", ".", "$"]) expect(moneyOnBlur(text, true), JSON.stringify(text)).toBe("");
  });
});

describe("switching the down payment unit where zero down is an answer", () => {
  const zero = { homePrice: "400,000", downPayment: "0", downUnit: "pct", rate: "7" };

  it("clears a 0 by default, as it always has", () => {
    expect(switchDownUnit(zero, "usd").downPayment).toBe("");
  });

  it("keeps a typed 0 in either direction when asked to", () => {
    expect(switchDownUnit(zero, "usd", true)).toEqual({ ...zero, downUnit: "usd", downPayment: "0" });
    expect(switchDownUnit({ ...zero, downUnit: "usd", downPayment: "0.00" }, "pct", true)).toMatchObject({ downUnit: "pct", downPayment: "0" });
    expect(switchDownUnit({ ...zero, homePrice: "" }, "usd", true).downPayment).toBe("0");
  });

  it("converts everything else exactly as without it", () => {
    const example = { ...zero, downPayment: "20" };
    expect(switchDownUnit(example, "usd", true)).toEqual(switchDownUnit(example, "usd"));
    expect(switchDownUnit(example, "pct", true)).toBe(example);
    expect(switchDownUnit(zero, "pct", true)).toBe(zero);
    expect(switchDownUnit({ ...example, downPayment: "" }, "usd", true).downPayment).toBe("");
    expect(switchDownUnit({ ...example, downPayment: "abc" }, "usd", true).downPayment).toBe("");
  });
});
