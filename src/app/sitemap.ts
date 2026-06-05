import type { MetadataRoute } from "next";
import { getTenantOrigin } from "@/server/tenant/config";

const ROUTES = [
  "",
  "/buy",
  "/refinance",
  "/home-equity",
  "/rates",
  "/loan-officers",
  "/apply/buy",
  "/apply/refi",
  "/apply/cash",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = await getTenantOrigin();
  return ROUTES.map((route) => ({
    url: `${origin}${route}`,
    changeFrequency: route === "/rates" ? "daily" : "weekly",
    priority: route === "" ? 1 : route.startsWith("/apply") ? 0.6 : 0.8,
  }));
}
