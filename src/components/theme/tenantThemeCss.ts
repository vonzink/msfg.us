import type { TenantConfig } from "@/content/site";

type Theme = TenantConfig["theme"];

/**
 * Build the `:root{…}` CSS that overrides the Tailwind-v4 `@theme` variables
 * (src/app/globals.css) with a tenant's theme values. Each field maps 1:1 to a
 * CSS variable name. Injected uniformly for every tenant (MSFG's is a harmless
 * echo of the build-time defaults). Pure → unit-tested.
 */
export function buildTenantThemeCss(theme: Theme): string {
  const v: Array<[string, string]> = [
    // Deep emerald system
    ["--color-green-900", theme.green900],
    ["--color-green-850", theme.green850],
    ["--color-green-800", theme.green800],
    ["--color-green-700", theme.green700],
    ["--color-green-600", theme.green600],
    ["--color-green-glow", theme.greenGlow],
    // Action green
    ["--color-spring", theme.spring],
    ["--color-spring-2", theme.spring2],
    ["--color-spring-3", theme.spring3],
    ["--color-spring-soft", theme.springSoft],
    // Headline accent
    ["--color-mint", theme.mint],
    // Neutrals
    ["--color-ink", theme.ink],
    ["--color-paper", theme.paper],
    ["--color-paper-2", theme.paper2],
    ["--color-muted", theme.muted],
    ["--color-line", theme.line],
    // On-dark text + hairlines
    ["--color-on-dark", theme.onDark],
    ["--color-on-dark-2", theme.onDark2],
    ["--color-on-dark-3", theme.onDark3],
    ["--color-hair-dark", theme.hairDark],
    // Radii
    ["--radius-sm", theme.radiusSm],
    ["--radius-md", theme.radiusMd],
    ["--radius-lg", theme.radiusLg],
    ["--radius-xl", theme.radiusXl],
    // Non-utility tokens
    ["--lip", theme.lip],
    ["--font-sans", theme.fontFamily],
  ];
  const body = v.map(([name, value]) => `${name}:${value};`).join("");
  return `:root{${body}}`;
}
