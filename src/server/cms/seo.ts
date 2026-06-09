import "server-only";
import { z } from "zod";
import { unstable_cache } from "next/cache";
import { draftMode } from "next/headers";
import { getTenant } from "@/server/tenant/resolve";
import { getPublishedData, getDraftData } from "./versioning";
import { seoTag } from "./cache";

/**
 * Per-page SEO overrides (PAGE_SEO editable, keyed by route path). Every field is
 * optional; an admin sets only what should differ from the global config.seo
 * defaults. `include`/`priority`/`changefreq` drive the sitemap.
 */
export const PageSeoSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  canonical: z.string().optional(),
  ogTitle: z.string().optional(),
  ogDescription: z.string().optional(),
  ogImage: z.string().optional(),
  /** Raw robots directive, e.g. "noindex,follow". Omitted => inherit global. */
  robots: z.string().optional(),
  /** Arbitrary JSON-LD object rendered as <script type="application/ld+json">. */
  jsonLd: z.record(z.string(), z.unknown()).optional(),
  /** Sitemap inclusion (default true). */
  include: z.boolean().default(true),
  priority: z.number().min(0).max(1).optional(),
  changefreq: z
    .enum(["always", "hourly", "daily", "weekly", "monthly", "yearly", "never"])
    .optional(),
});

export type PageSeo = z.infer<typeof PageSeoSchema>;

/** Parse raw PAGE_SEO revision data, falling back to a safe default. */
export function parsePageSeo(raw: unknown): PageSeo {
  const result = PageSeoSchema.safeParse(raw ?? {});
  return result.success ? result.data : { include: true };
}

function publishedSeoReader(tenantId: string, path: string) {
  return unstable_cache(
    async () => parsePageSeo(await getPublishedData(tenantId, "PAGE_SEO", path)),
    ["page-seo", tenantId, path],
    { tags: [seoTag(tenantId, path)] },
  );
}

/** Resolve a route's SEO overrides. Draft-Mode editors see the working draft. */
export async function getPageSeo(path: string): Promise<PageSeo> {
  const tenant = await getTenant();

  let isDraft = false;
  try {
    isDraft = (await draftMode()).isEnabled;
  } catch {
    isDraft = false; // outside a request scope (e.g. sitemap build, unit tests)
  }
  if (isDraft) {
    const draft = await getDraftData(tenant.id, "PAGE_SEO", path);
    if (draft != null) return parsePageSeo(draft);
  }

  return publishedSeoReader(tenant.id, path)();
}
