import "server-only";
import { z } from "zod";

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
