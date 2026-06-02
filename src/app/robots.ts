import type { MetadataRoute } from "next";
import { SITE } from "@/content/site";

/** Staging/preview environments are fully disallowed so they never get
 *  indexed; production allows everything except API routes. */
export default function robots(): MetadataRoute.Robots {
  const isProd = SITE.env === "production";
  if (!isProd) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/"] }],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
