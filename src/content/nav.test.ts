import { describe, it, expect } from "vitest";
import {
  NAV,
  FOOTER_COLUMNS,
  FOOTER_LEGAL_LINKS,
  footerColumnsFor,
  navigationForFeatures,
  type NavLink,
} from "@/content/nav";
import { CALCULATORS } from "@/calculators/registry";

const KNOWN = new Set([
  "/", "/buy", "/refinance", "/home-equity", "/rates", "/loan-officers", "/developers",
  "/apply/buy", "/apply/refi", "/apply/cash", "/coming-soon",
  "/licensing", "/privacy-notice", "/privacy-policy", "/terms", "/accessibility",
  "/texas-required-notice", "/nmls-consumer-access", "/sitemap",
  "/veterans", "/reverse", "/investment", "/commercial",
  "/about", "/careers", "/know-your-lender", "/resources/mortgage-glossary",
  "/calculators", "/calculators/investment", "/calculators/mortgage", "/calculators/buydown",
]);

function allLinks(): NavLink[] {
  return [
    ...NAV.flatMap((n) => [{ label: n.label, href: n.href }, ...n.items]),
    ...FOOTER_COLUMNS.flatMap((c) => c.links),
    ...FOOTER_LEGAL_LINKS,
  ];
}

describe("nav/footer links", () => {
  it("models Purchase and Refinance as direct primary links", () => {
    const purchase = NAV.find((item) => item.label === "Purchase");
    const refinance = NAV.find((item) => item.label === "Refinance");

    expect(purchase).toEqual({ label: "Purchase", href: "/buy", items: [] });
    expect(refinance).toEqual({
      label: "Refinance",
      href: "/refinance",
      items: [],
    });
  });

  it("lists the enabled calculators under Mortgage Calculators, linking to the landing page", () => {
    const two = CALCULATORS.slice(0, 2);
    const item = navigationForFeatures({ ratesNavigation: true }, two).find((i) => i.label === "Mortgage Calculators");
    expect(item).toEqual({
      label: "Mortgage Calculators",
      href: "/calculators",
      items: two.map((c) => ({ label: c.label, href: c.path })),
    });
  });

  it("drops the Mortgage Calculators menu when no calculator is enabled", () => {
    const labels = navigationForFeatures({ ratesNavigation: true }, []).map((i) => i.label);
    expect(labels).not.toContain("Mortgage Calculators");
    expect(labels).toContain("Purchase");
  });

  it("never links a calculator to the coming-soon page, in the menu or the footer", () => {
    const menu = navigationForFeatures({ ratesNavigation: true }, CALCULATORS).flatMap((i) => [i, ...i.items]);
    const footer = footerColumnsFor(CALCULATORS).flatMap((c) => c.links);
    const promised = [...menu, ...footer, ...FOOTER_COLUMNS.flatMap((c) => c.links)].filter(
      (l) => /calculator/i.test(l.label) && l.href === "/coming-soon",
    );
    expect(promised).toEqual([]);
  });

  it("puts the enabled calculators first in the footer's Resources column", () => {
    const resources = footerColumnsFor(CALCULATORS).find((c) => c.heading === "Resources")!;
    expect(resources.links.slice(0, CALCULATORS.length)).toEqual(CALCULATORS.map((c) => ({ label: c.label, href: c.path })));
    expect(resources.links.map((l) => l.href)).toContain("/buy");
  });

  it("hides every rates link when rates navigation is disabled", () => {
    const navigation = navigationForFeatures({ ratesNavigation: false }, CALCULATORS);
    const hrefs = navigation.flatMap((item) => [
      item.href,
      ...item.items.map((sub) => sub.href),
    ]);

    expect(hrefs).not.toContain("/rates");
  });

  it("preserves rates links for tenants that enable them", () => {
    const navigation = navigationForFeatures({ ratesNavigation: true }, CALCULATORS);
    expect(navigation.map((i) => i.label)).toEqual(NAV.map((i) => i.label));
    expect(navigation.find((i) => i.href === "/rates")).toEqual(NAV.find((i) => i.href === "/rates"));
  });

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
