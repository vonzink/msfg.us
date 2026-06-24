import { describe, it, expect } from "vitest";
import { buildSiteMap } from "@/lib/siteMap";

describe("buildSiteMap", () => {
  const groups = buildSiteMap();

  it("returns named groups with links", () => {
    expect(groups.length).toBeGreaterThan(0);
    for (const g of groups) {
      expect(g.heading).toBeTruthy();
      expect(g.links.length).toBeGreaterThan(0);
    }
  });

  it("lists only real internal routes (no placeholders, no coming-soon, no externals)", () => {
    const KNOWN = new Set([
      "/", "/buy", "/refinance", "/home-equity", "/rates", "/loan-officers", "/developers",
      "/apply/buy", "/apply/refi", "/apply/cash",
      "/licensing", "/privacy-notice", "/privacy-policy", "/terms", "/accessibility",
      "/nmls-consumer-access", "/sitemap",
      "/about", "/careers", "/know-your-lender", "/resources/mortgage-glossary",
    ]);
    for (const g of groups) {
      for (const l of g.links) {
        expect(l.href.startsWith("http")).toBe(false);
        expect(l.href).not.toBe("/coming-soon");
        expect(KNOWN.has(l.href)).toBe(true);
      }
    }
  });

  it("includes the legal pages group", () => {
    const headings = groups.map((g) => g.heading);
    expect(headings).toContain("Legal & Compliance");
  });
});
