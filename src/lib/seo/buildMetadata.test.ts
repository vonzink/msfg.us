import { describe, it, expect } from "vitest";
import { mergePageMetadata } from "./buildMetadata";
import { DEFAULT_TENANT_CONFIG } from "@/content/site";

const origin = "https://msfg.us";
const cfg = DEFAULT_TENANT_CONFIG;

describe("mergePageMetadata", () => {
  it("uses global config.seo when the page has no overrides", () => {
    const m = mergePageMetadata(cfg, { include: true }, origin, true);
    expect(m.description).toBe(cfg.seo.description);
    expect(m.title).toBe(cfg.seo.titleDefault);
    expect(m.robots).toEqual({ index: true, follow: true });
  });

  it("overrides title/description/canonical/og from the page", () => {
    const m = mergePageMetadata(
      cfg,
      { include: true, title: "Buy a Home", description: "Purchase loans.", canonical: "/buy", ogTitle: "Buy" },
      origin,
      true,
    );
    expect(m.title).toBe("Buy a Home");
    expect(m.description).toBe("Purchase loans.");
    expect(m.alternates).toEqual({ canonical: "/buy" });
    expect((m.openGraph as { title?: string }).title).toBe("Buy");
  });

  it("honors a per-page robots override (noindex)", () => {
    const m = mergePageMetadata(cfg, { include: true, robots: "noindex,follow" }, origin, true);
    expect(m.robots).toEqual({ index: false, follow: true });
  });

  it("forces noindex in non-prod regardless of page robots", () => {
    const m = mergePageMetadata(cfg, { include: true, robots: "index,follow" }, origin, false);
    expect(m.robots).toEqual({ index: false, follow: false });
  });

  it("routeDefaults.title shows when page omits title", () => {
    const m = mergePageMetadata(
      cfg,
      { include: true },
      origin,
      true,
      { title: "Buy a Home — Route Default Title | MSFG" },
    );
    expect(m.title).toBe("Buy a Home — Route Default Title | MSFG");
  });

  it("page.title beats routeDefaults.title", () => {
    const m = mergePageMetadata(
      cfg,
      { include: true, title: "Admin SEO Override Title" },
      origin,
      true,
      { title: "Buy a Home — Route Default Title | MSFG" },
    );
    expect(m.title).toBe("Admin SEO Override Title");
  });
});
