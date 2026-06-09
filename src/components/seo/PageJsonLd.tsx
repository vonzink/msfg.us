import { getPageSeo } from "@/server/cms/seo";
import { JsonLd } from "@/components/JsonLd";

/** Renders a route's per-page JSON-LD (PAGE_SEO.jsonLd) if an admin set one.
 *  Server component — safe in any marketing page body. */
export async function PageJsonLd({ path }: { path: string }) {
  const page = await getPageSeo(path);
  if (!page.jsonLd || typeof page.jsonLd !== "object") return null;
  return <JsonLd data={page.jsonLd as Record<string, unknown>} />;
}
