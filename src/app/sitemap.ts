import type { MetadataRoute } from "next";
import { getTenantOrigin } from "@/server/tenant/config";
import { getPageSeo } from "@/server/cms/seo";
import { sitemapEntry } from "./sitemap.helpers";

const ROUTES = [
  "",
  "/buy",
  "/refinance",
  "/home-equity",
  "/veterans",
  "/reverse",
  "/investment",
  "/commercial",
  "/rates",
  "/loan-officers",
  "/developers",
  "/apply/buy",
  "/apply/refi",
  "/apply/cash",
  "/licensing",
  "/privacy-notice",
  "/privacy-policy",
  "/terms",
  "/accessibility",
  "/nmls-consumer-access",
  "/sitemap",
  "/about",
  "/careers",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = await getTenantOrigin();
  const entries = await Promise.all(
    ROUTES.map(async (route) => sitemapEntry(origin, route, await getPageSeo(route))),
  );
  return entries.filter((e): e is NonNullable<typeof e> => e !== null);
}
