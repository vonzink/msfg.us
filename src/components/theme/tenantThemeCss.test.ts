import { describe, it, expect } from "vitest";
import { buildTenantThemeCss } from "./tenantThemeCss";
import { DEFAULT_TENANT_CONFIG } from "@/content/site";

describe("buildTenantThemeCss", () => {
  it("maps MSFG theme tokens to the correct CSS variable names", () => {
    const css = buildTenantThemeCss(DEFAULT_TENANT_CONFIG.theme);
    expect(css.startsWith(":root{")).toBe(true);
    expect(css.endsWith("}")).toBe(true);
    expect(css).toContain("--color-green-800:#0b3d30;");
    expect(css).toContain("--color-spring:#1fb463;");
    expect(css).toContain("--color-spring-soft:rgba(31, 180, 99, 0.14);");
    expect(css).toContain("--color-mint:#7fe3a8;");
    expect(css).toContain("--color-on-dark:rgba(255, 255, 255, 0.92);");
    expect(css).toContain("--radius-md:9px;");
    expect(css).toContain("--lip:#0c6b39;");
    expect(css).toContain(
      '--font-sans:var(--font-hanken), system-ui, -apple-system, "Segoe UI", sans-serif;',
    );
  });

  it("reflects a swapped second-tenant theme (swap proof)", () => {
    const css = buildTenantThemeCss({
      ...DEFAULT_TENANT_CONFIG.theme,
      green800: "#101820",
      spring: "#ff8800",
      mint: "#ffd1a3",
      radiusMd: "2px",
    });
    expect(css).toContain("--color-green-800:#101820;");
    expect(css).toContain("--color-spring:#ff8800;");
    expect(css).toContain("--color-mint:#ffd1a3;");
    expect(css).toContain("--radius-md:2px;");
    // Untouched tokens keep MSFG values.
    expect(css).toContain("--color-ink:#0b231c;");
  });
});
