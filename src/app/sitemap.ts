import type { MetadataRoute } from "next";
import { getTenantConfig, getTenantOrigin } from "@/server/tenant/config";
import { enabledCalculators } from "@/calculators/registry";
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
  "/texas-required-notice",
  "/nmls-consumer-access",
  "/sitemap",
  "/about",
  "/careers",
  "/know-your-lender",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [origin, config] = await Promise.all([getTenantOrigin(), getTenantConfig()]);
  // Calculators come from the registry, so a switched-off one leaves the sitemap too.
  const calculators = enabledCalculators(config.calculators).map((c) => c.path);
  const routes = [...ROUTES, ...(calculators.length ? ["/calculators"] : []), ...calculators];
  const entries = await Promise.all(
    routes.map(async (route) => sitemapEntry(origin, route, await getPageSeo(route))),
  );
  return entries.filter((e): e is NonNullable<typeof e> => e !== null);
}
