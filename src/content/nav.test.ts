import { describe, it, expect } from "vitest";
import { NAV, FOOTER_COLUMNS, FOOTER_LEGAL_LINKS, type NavLink } from "@/content/nav";

const KNOWN = new Set([
  "/", "/buy", "/refinance", "/home-equity", "/rates", "/loan-officers", "/developers",
  "/apply/buy", "/apply/refi", "/apply/cash", "/coming-soon",
  "/licensing", "/privacy-notice", "/privacy-policy", "/terms", "/accessibility",
  "/texas-required-notice", "/nmls-consumer-access", "/sitemap",
  "/veterans", "/reverse", "/investment", "/commercial",
  "/about", "/careers", "/know-your-lender",
]);

function allLinks(): NavLink[] {
  return [
    ...NAV.flatMap((n) => [{ label: n.label, href: n.href }, ...n.items]),
    ...FOOTER_COLUMNS.flatMap((c) => c.links),
    ...FOOTER_LEGAL_LINKS,
  ];
}

describe("nav/footer links", () => {
  it("no internal link is the bare-home placeholder", () => {
    for (const l of allLinks()) {
      if (l.href.startsWith("http")) continue;
      expect(l.href, l.label).not.toBe("/");
    }
  });

  it("every internal link resolves to a known route", () => {
    for (const l of allLinks()) {
      if (l.href.startsWith("http")) continue;
      // Anchor links (e.g. "/#services") resolve to their base page.
      const path = l.href.split("#")[0] || "/";
      expect(KNOWN.has(path), `${l.label} -> ${l.href}`).toBe(true);
    }
  });

  it("exposes the new legal links", () => {
    const hrefs = FOOTER_LEGAL_LINKS.map((l) => l.href);
    for (const h of ["/licensing", "/privacy-notice", "/privacy-policy", "/terms", "/accessibility", "/nmls-consumer-access", "/sitemap"]) {
      expect(hrefs).toContain(h);
    }
  });
});
