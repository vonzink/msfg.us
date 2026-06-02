import type { MetadataRoute } from "next";
import { SITE } from "@/content/site";

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

export default function sitemap(): MetadataRoute.Sitemap {
  return ROUTES.map((route) => ({
    url: `${SITE.url}${route}`,
    changeFrequency: route === "/rates" ? "daily" : "weekly",
    priority: route === "" ? 1 : route.startsWith("/apply") ? 0.6 : 0.8,
  }));
}
