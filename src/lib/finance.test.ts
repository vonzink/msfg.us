import { describe, expect, it } from "vitest";
import { formatUSDCents, monthlyPayment, roundCents } from "./finance";

describe("roundCents", () => {
  it("rounds half a cent up, including values binary floats store just under the half", () => {
    expect(roundCents(1.005)).toBe(1.01);
    expect(roundCents(1398.4299)).toBe(1398.43);
    expect(roundCents(-0.004)).toBe(-0);
  });
});

describe("monthlyPayment", () => {
  it("is the standard amortized payment", () => {
    expect(roundCents(monthlyPayment(200000, 7.5, 360))).toBe(1398.43);
  });
  it("divides evenly at a zero rate", () => {
    expect(monthlyPayment(120000, 0, 120)).toBe(1000);
  });
});

describe("formatUSDCents", () => {
  it("always shows two decimals and treats junk as zero", () => {
    expect(formatUSDCents(262.3)).toBe("$262.30");
    expect(formatUSDCents(1866.666)).toBe("$1,866.67");
    expect(formatUSDCents(Number.NaN)).toBe("$0.00");
  });
});
