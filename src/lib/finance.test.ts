import { describe, expect, it } from "vitest";
import { formatUSDCents, monthlyPayment, remainingBalance, roundCents } from "./finance";

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

describe("remainingBalance", () => {
  it("is what is still owed after a number of payments", () => {
    // $300,000 at 6.5% over 15 years, after 10 years: $133,563.44 (the dashboard's own figure).
    expect(roundCents(remainingBalance(300000, 6.5, 180, 120))).toBe(133563.44);
    expect(remainingBalance(300000, 6.5, 180, 0)).toBe(300000);
  });
  it("is zero once the loan has run its term", () => {
    expect(remainingBalance(300000, 6.5, 180, 180)).toBe(0);
    expect(remainingBalance(300000, 6.5, 180, 999)).toBe(0);
  });
  it("falls in a straight line at a zero rate", () => {
    expect(remainingBalance(120000, 0, 120, 30)).toBe(90000);
  });
});

