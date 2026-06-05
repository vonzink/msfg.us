import { getTenantConfig } from "@/server/tenant/config";
import { buildTenantThemeCss } from "./tenantThemeCss";

/**
 * Async server component: emits a `<style>` overriding the Tailwind `@theme`
 * CSS variables with the active tenant's theme. Rendered inside `<head>` in the
 * root layout so it is SSR'd before paint — no FOUC/CLS.
 *
 * The `no-head-element` ESLint rule is skipped in the App Router (the rule's
 * `create` function returns early when `context.filename` includes `app/`), so
 * placing a raw `<head>` in `src/app/layout.tsx` is lint-clean.
 *
 * Only variable *values* change; components, class names, and utilities are
 * untouched — the build-time Tailwind utilities remain valid for every tenant.
 */
export async function TenantTheme() {
  const config = await getTenantConfig();
  const css = buildTenantThemeCss(config.theme);
  return <style data-tenant-theme dangerouslySetInnerHTML={{ __html: css }} />;
}
