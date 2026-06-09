import { describe, it, expect } from "vitest";
import { sitemapEntry, defaultPriority, defaultChangefreq } from "./sitemap.helpers";

describe("sitemap helpers", () => {
  it("defaults: home=1.0, apply=0.6, others=0.8; rates=daily else weekly", () => {
    expect(defaultPriority("")).toBe(1);
    expect(defaultPriority("/apply/buy")).toBe(0.6);
    expect(defaultPriority("/buy")).toBe(0.8);
    expect(defaultChangefreq("/rates")).toBe("daily");
    expect(defaultChangefreq("/buy")).toBe("weekly");
  });

  it("builds an entry, page-seo overriding priority/changefreq", () => {
    const e = sitemapEntry("https://msfg.us", "/buy", { include: true, priority: 0.9, changefreq: "monthly" });
    expect(e).toEqual({ url: "https://msfg.us/buy", priority: 0.9, changeFrequency: "monthly" });
  });

  it("returns null when the page is excluded (include:false)", () => {
    expect(sitemapEntry("https://msfg.us", "/buy", { include: false })).toBeNull();
  });

  it("falls back to defaults when page-seo omits priority/changefreq", () => {
    const e = sitemapEntry("https://msfg.us", "", { include: true });
    expect(e).toEqual({ url: "https://msfg.us", priority: 1, changeFrequency: "weekly" });
  });
});
