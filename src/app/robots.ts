import type { MetadataRoute } from "next";
import { getTenantOrigin } from "@/server/tenant/config";

/** Staging/preview environments are fully disallowed so they never get
 *  indexed; production allows everything except API routes. */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const isProd = process.env.NEXT_PUBLIC_SITE_ENV === "production";
  if (!isProd) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }
  const origin = await getTenantOrigin();
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/"] }],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
