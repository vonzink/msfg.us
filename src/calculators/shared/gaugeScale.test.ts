import { describe, expect, it } from "vitest";
import { dialPosition, rate, type Scale } from "./gaugeScale";

const s: Scale = { min: 0, fair: 10, good: 20, max: 40 };

describe("rating", () => {
  it("gives a value exactly on a cutoff the better zone", () => {
    expect(rate(9.99, s)).toBe("poor");
    expect(rate(10, s)).toBe("fair");
    expect(rate(20, s)).toBe("good");
  });
});

describe("needle position", () => {
  it("puts each cutoff at a third of the dial", () => {
    expect(dialPosition(0, s)).toBeCloseTo(0);
    expect(dialPosition(10, s)).toBeCloseTo(1 / 3);
    expect(dialPosition(20, s)).toBeCloseTo(2 / 3);
    expect(dialPosition(40, s)).toBeCloseTo(1);
  });

  it("moves evenly within a zone", () => {
    expect(dialPosition(5, s)).toBeCloseTo(1 / 6);
    expect(dialPosition(30, s)).toBeCloseTo(5 / 6);
  });

  it("pins values past either end", () => {
    expect(dialPosition(-100, s)).toBe(0);
    expect(dialPosition(1000, s)).toBe(1);
  });
});
