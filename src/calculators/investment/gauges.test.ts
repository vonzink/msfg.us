import { describe, expect, it } from "vitest";
import { dialPosition, rate } from "../shared/gaugeScale";
import { SCALES } from "./gauges";

describe("gauge ratings", () => {
  it("monthly cash flow: losing money is poor, under 10% of rent is fair, 10%+ is good", () => {
    const s = SCALES.cashFlowShare;
    expect(rate(-50 / 3780, s)).toBe("poor");
    expect(rate(0, s)).toBe("fair");
    expect(rate(300 / 3780, s)).toBe("fair");
    expect(rate(378 / 3780, s)).toBe("good");
    expect(rate(2166 / 3780, s)).toBe("good");
  });

  it("cash-on-cash: under 4% poor, 4-8% fair, 8%+ good", () => {
    expect(rate(-0.13, SCALES.cashOnCash)).toBe("poor");
    expect(rate(0.039, SCALES.cashOnCash)).toBe("poor");
    expect(rate(0.05, SCALES.cashOnCash)).toBe("fair");
    expect(rate(0.08, SCALES.cashOnCash)).toBe("good");
  });

  it("cap rate: under 5% poor, 5-7% fair, 7%+ good", () => {
    expect(rate(0.042, SCALES.capRate)).toBe("poor");
    expect(rate(0.065, SCALES.capRate)).toBe("fair");
    expect(rate(0.073, SCALES.capRate)).toBe("good");
  });

  it("debt coverage: under 1.00 poor, 1.00-1.25 fair, 1.25+ good", () => {
    expect(rate(0.68, SCALES.dcr)).toBe("poor");
    expect(rate(1, SCALES.dcr)).toBe("fair");
    expect(rate(1.2, SCALES.dcr)).toBe("fair");
    expect(rate(1.25, SCALES.dcr)).toBe("good");
  });
});

describe("needle position", () => {
  it("keeps the needle in the zone the rating names", () => {
    for (const scale of Object.values(SCALES)) {
      for (let v = scale.min - 1; v <= scale.max + 1; v += (scale.max - scale.min) / 97) {
        const t = dialPosition(v, scale);
        const zone = t < 1 / 3 ? "poor" : t < 2 / 3 ? "fair" : "good";
        expect(zone).toBe(rate(v, scale));
      }
    }
  });
});
