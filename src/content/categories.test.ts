import { describe, it, expect } from "vitest";
import { CATS, type CategoryKey } from "./categories";

const SUBBRANDS: CategoryKey[] = ["veterans", "reverse", "investment", "commercial"];

describe("sub-brand category configs", () => {
  for (const key of SUBBRANDS) {
    it(`${key} is a well-formed category`, () => {
      const c = CATS[key]!;
      expect(c).toBeTruthy();
      expect(c.tag).toBeTruthy();
      expect(c.h1[0].length + c.h1[1].length).toBeGreaterThan(0);
      expect(c.sub).toBeTruthy();
      expect(c.cta).toBeTruthy();
      expect(c.steps).toHaveLength(4);
      expect(c.opts.length).toBeGreaterThan(0);
      // either an apply intent or an explicit CTA href must exist
      expect(Boolean(c.intent) || Boolean(c.ctaHref)).toBe(true);
    });
  }
  it("reverse + commercial route to a loan officer (no apply funnel)", () => {
    expect(CATS.reverse!.ctaHref).toBe("/loan-officers");
    expect(CATS.commercial!.ctaHref).toBe("/loan-officers");
    expect(CATS.reverse!.quote).toBeUndefined();
    expect(CATS.commercial!.quote).toBeUndefined();
  });
});
