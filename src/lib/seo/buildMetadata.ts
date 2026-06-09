import "server-only";
import type { Metadata } from "next";
import type { TenantConfig } from "@/content/site";
import { getTenantConfig, getTenantOrigin } from "@/server/tenant/config";
import { getPageSeo, type PageSeo } from "@/server/cms/seo";

/** Parse a raw robots string ("noindex,follow") into Next's robots object. */
function parseRobots(robots: string): { index: boolean; follow: boolean } {
  const t = robots.toLowerCase();
  return { index: !t.includes("noindex"), follow: !t.includes("nofollow") };
}

/**
 * Pure merge: global config.seo defaults <- per-page overrides. `isProd` gates
 * indexability (staging/dev is always noindex, like the root layout).
 */
export function mergePageMetadata(
  config: TenantConfig,
  page: PageSeo,
  origin: string,
  isProd: boolean,
): Metadata {
  const { seo, brand } = config;
  const title = page.title ?? seo.titleDefault;
  const description = page.description ?? seo.description;

  const robots = isProd
    ? page.robots
      ? parseRobots(page.robots)
      : { index: true, follow: true }
    : { index: false, follow: false };

  const meta: Metadata = {
    metadataBase: new URL(origin),
    title,
    description,
    applicationName: brand.shortName,
    robots,
    openGraph: {
      title: page.ogTitle ?? seo.ogTitle,
      description: page.ogDescription ?? seo.ogDescription,
      siteName: seo.siteName,
      type: "website",
      ...(page.ogImage ?? seo.ogImage ? { images: [page.ogImage ?? seo.ogImage!] } : {}),
    },
  };
  if (page.canonical) meta.alternates = { canonical: page.canonical };
  return meta;
}

/**
 * Resolve the full Metadata for a route: config.seo defaults merged with the
 * route's PAGE_SEO overrides. Call from a route's `generateMetadata`.
 *
 * NOTE: Uses `process.env.NEXT_PUBLIC_SITE_ENV` (not `serverEnv`) to match
 * the prod-detection in `src/app/layout.tsx` exactly. `serverEnv` explicitly
 * excludes NEXT_PUBLIC_* variables (they belong to the client bundle).
 */
export async function buildMetadata(path: string): Promise<Metadata> {
  const [config, origin, page] = await Promise.all([
    getTenantConfig(),
    getTenantOrigin(),
    getPageSeo(path),
  ]);
  const isProd = process.env.NEXT_PUBLIC_SITE_ENV === "production";
  return mergePageMetadata(config, page, origin, isProd);
}
