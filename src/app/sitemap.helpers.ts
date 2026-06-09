import type { MetadataRoute } from "next";
import type { PageSeo } from "@/server/cms/seo";

type Entry = MetadataRoute.Sitemap[number];
type Changefreq = NonNullable<Entry["changeFrequency"]>;

export function defaultPriority(route: string): number {
  if (route === "") return 1;
  if (route.startsWith("/apply")) return 0.6;
  return 0.8;
}

export function defaultChangefreq(route: string): Changefreq {
  return route === "/rates" ? "daily" : "weekly";
}

/** Build one sitemap entry, applying PAGE_SEO overrides. null => excluded. */
export function sitemapEntry(origin: string, route: string, page: PageSeo): Entry | null {
  if (page.include === false) return null;
  return {
    url: `${origin}${route}`,
    priority: page.priority ?? defaultPriority(route),
    changeFrequency: (page.changefreq as Changefreq | undefined) ?? defaultChangefreq(route),
  };
}
