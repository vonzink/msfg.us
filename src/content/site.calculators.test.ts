import { describe, expect, it } from "vitest";
import { DEFAULT_TENANT_CONFIG, TenantConfigSchema } from "./site";

describe("calculator settings", () => {
  it("fills defaults for a config saved before the settings existed", () => {
    const { calculators: _c, ...old } = DEFAULT_TENANT_CONFIG;
    const { calculatorDisclaimer: _d, exampleRateNote: _n, ...oldLegal } = old.legal;
    const parsed = TenantConfigSchema.parse({ ...old, legal: oldLegal });
    expect(parsed.calculators).toEqual({ disabled: [], exampleRatePct: 7 });
    expect(parsed.legal.exampleRateNote).toBe("Example rate for illustration, not an offer.");
    expect(parsed.legal.calculatorDisclaimer).toMatch(/^This is an estimate/);
  });

  it("rejects an example rate outside 0 to 25", () => {
    const bad = { ...DEFAULT_TENANT_CONFIG, calculators: { disabled: [], exampleRatePct: 40 } };
    expect(TenantConfigSchema.safeParse(bad).success).toBe(false);
  });
});
