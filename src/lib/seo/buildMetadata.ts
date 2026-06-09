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
 * Route-level default metadata. Sits between the global config.seo defaults
 * and the per-page PAGE_SEO admin overrides in the precedence chain:
 *   PAGE_SEO override > RouteDefaults > global config.seo
 */
export type RouteDefaults = {
  title?: string;
  description?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  canonical?: string;
};

/**
 * Pure merge: global config.seo defaults <- routeDefaults <- per-page overrides.
 * `isProd` gates indexability (staging/dev is always noindex, like the root layout).
 */
export function mergePageMetadata(
  config: TenantConfig,
  page: PageSeo,
  origin: string,
  isProd: boolean,
  routeDefaults?: RouteDefaults,
): Metadata {
  const { seo, brand } = config;
  const title = page.title ?? routeDefaults?.title ?? seo.titleDefault;
  const description = page.description ?? routeDefaults?.description ?? seo.description;

  const robots = isProd
    ? page.robots
      ? parseRobots(page.robots)
      : { index: true, follow: true }
    : { index: false, follow: false };

  const ogImage = page.ogImage ?? routeDefaults?.ogImage ?? seo.ogImage;

  const meta: Metadata = {
    metadataBase: new URL(origin),
    title,
    description,
    applicationName: brand.shortName,
    robots,
    openGraph: {
      title: page.ogTitle ?? routeDefaults?.ogTitle ?? seo.ogTitle,
      description: page.ogDescription ?? routeDefaults?.ogDescription ?? seo.ogDescription,
      siteName: seo.siteName,
      type: "website",
      ...(ogImage ? { images: [ogImage] } : {}),
    },
  };
  const canonical = page.canonical ?? routeDefaults?.canonical;
  if (canonical) meta.alternates = { canonical };
  return meta;
}

/**
 * Resolve the full Metadata for a route: config.seo defaults merged with
 * optional route-level defaults and the route's PAGE_SEO admin overrides.
 * Call from a route's `generateMetadata`.
 *
 * Precedence: PAGE_SEO override > routeDefaults > global config.seo
 *
 * NOTE: Uses `process.env.NEXT_PUBLIC_SITE_ENV` (not `serverEnv`) to match
 * the prod-detection in `src/app/layout.tsx` exactly. `serverEnv` explicitly
 * excludes NEXT_PUBLIC_* variables (they belong to the client bundle).
 */
export async function buildMetadata(
  path: string,
  routeDefaults?: RouteDefaults,
): Promise<Metadata> {
  const [config, origin, page] = await Promise.all([
    getTenantConfig(),
    getTenantOrigin(),
    getPageSeo(path),
  ]);
  const isProd = process.env.NEXT_PUBLIC_SITE_ENV === "production";
  return mergePageMetadata(config, page, origin, isProd, routeDefaults);
}
