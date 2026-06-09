import { describe, it, expect } from "vitest";
import { parsePageSeo, type PageSeo } from "./seo";
import { seoTag } from "./cache";

describe("PageSeoSchema / parsePageSeo", () => {
  it("treats every field as optional (empty object is valid)", () => {
    expect(parsePageSeo({})).toEqual({ include: true });
  });

  it("parses a full page-seo object", () => {
    const raw = {
      title: "Buy a Home",
      description: "Purchase mortgages.",
      canonical: "https://msfg.us/buy",
      ogTitle: "Buy",
      ogDescription: "Purchase",
      ogImage: "/og/buy.png",
      robots: "noindex,follow",
      jsonLd: { "@type": "WebPage", name: "Buy" },
      include: false,
      priority: 0.9,
      changefreq: "weekly",
    };
    const p: PageSeo = parsePageSeo(raw);
    expect(p.title).toBe("Buy a Home");
    expect(p.robots).toBe("noindex,follow");
    expect(p.jsonLd).toEqual({ "@type": "WebPage", name: "Buy" });
    expect(p.include).toBe(false);
    expect(p.priority).toBe(0.9);
    expect(p.changefreq).toBe("weekly");
  });

  it("defaults include to true and drops unknown fields", () => {
    const p = parsePageSeo({ title: "X", bogus: 1 });
    expect(p.include).toBe(true);
    expect((p as Record<string, unknown>).bogus).toBeUndefined();
  });

  it("falls back to {include:true} on a non-object / invalid input", () => {
    expect(parsePageSeo(null)).toEqual({ include: true });
    expect(parsePageSeo({ priority: "high" })).toEqual({ include: true });
  });
});

describe("seoTag", () => {
  it("is per-tenant + per-path", () => {
    expect(seoTag("tenant_msfg", "/buy")).toBe("t:tenant_msfg:seo:/buy");
  });
});
