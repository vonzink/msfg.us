import "server-only";
import { revalidateTag } from "next/cache";

/** Cache tag for a tenant's published config. Keep tag strings centralized. */
export function configTag(tenantId: string): string {
  return `t:${tenantId}:config`;
}

/** Cache tag for a tenant's per-path SEO overrides. */
export function seoTag(tenantId: string, path: string): string {
  return `t:${tenantId}:seo:${path}`;
}

/**
 * Invalidate a CMS cache tag. In THIS Next build `revalidateTag` REQUIRES a
 * cache-profile arg; `"max"` = stale-while-revalidate (publish marks the tag
 * stale; the next request re-fetches). The single-arg form is deprecated and
 * fails `tsc`. Wrapped here so the signature is isolated to one call site.
 */
export function revalidateCmsTag(tag: string): void {
  revalidateTag(tag, "max");
}
