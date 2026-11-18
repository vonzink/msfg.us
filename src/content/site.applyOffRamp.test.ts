import { describe, it, expect } from "vitest";
import { TenantConfigSchema, DEFAULT_TENANT_CONFIG, deriveApplyOffRamp } from "./site";

describe("applyOffRamp config", () => {
  it("parses an object MISSING applyOffRamp to MSFG defaults", () => {
    // A pre-existing published CMS revision predates the applyOffRamp block.
    // Start from a known-valid config and strip applyOffRamp entirely.
    const raw = structuredClone(DEFAULT_TENANT_CONFIG) as Record<string, unknown>;
    delete raw.applyOffRamp;
    const parsed = TenantConfigSchema.parse(raw);
    const off = deriveApplyOffRamp(parsed);
    expect(off.finishScreen).toBe("rendered");
    expect(off.channels).toEqual(["call", "text", "email"]);
    expect(off.slaCopy).toBe("within ~15 minutes");
  });

  it("respects an explicit applyOffRamp override", () => {
    const raw = {
      ...structuredClone(DEFAULT_TENANT_CONFIG),
      applyOffRamp: {
        channels: ["email"],
        slaCopy: "within one business day",
        finishScreen: "autoRedirect",
      },
    };
    const parsed = TenantConfigSchema.parse(raw);
    const off = deriveApplyOffRamp(parsed);
    expect(off.channels).toEqual(["email"]);
    expect(off.slaCopy).toBe("within one business day");
    expect(off.finishScreen).toBe("autoRedirect");
  });

  it("falls back to MSFG defaults when applyOffRamp is undefined at runtime (stale/partial cached config)", () => {
    // A cached/partial tenant config (e.g. an unstable_cache snapshot predating
    // this field) can reach deriveApplyOffRamp WITHOUT the schema default applied
    // — it must not crash. Regression test for the runtime
    // "Cannot read properties of undefined (reading 'channels')" bug.
    const cfg = {
      ...structuredClone(DEFAULT_TENANT_CONFIG),
      applyOffRamp: undefined,
    } as unknown as Parameters<typeof deriveApplyOffRamp>[0];
    const off = deriveApplyOffRamp(cfg);
    expect(off.finishScreen).toBe("rendered");
    expect(off.channels).toEqual(["call", "text", "email"]);
    expect(off.slaCopy).toBe("within ~15 minutes");
  });
});
