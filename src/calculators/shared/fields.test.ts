import { describe, expect, it } from "vitest";
import { parseRate } from "./fields";

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
