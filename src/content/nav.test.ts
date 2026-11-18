import { describe, it, expect } from "vitest";
import {
  NAV,
  FOOTER_COLUMNS,
  FOOTER_LEGAL_LINKS,
  navigationForFeatures,
  type NavLink,
} from "@/content/nav";

const KNOWN = new Set([
  "/", "/buy", "/refinance", "/home-equity", "/rates", "/loan-officers", "/developers",
  "/apply/buy", "/apply/refi", "/apply/cash", "/coming-soon",
  "/licensing", "/privacy-notice", "/privacy-policy", "/terms", "/accessibility",
  "/texas-required-notice", "/nmls-consumer-access", "/sitemap",
  "/veterans", "/reverse", "/investment", "/commercial",
  "/about", "/careers", "/know-your-lender", "/resources/mortgage-glossary",
  "/calculators/investment",
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

  it("groups the requested tools under Mortgage Calculators", () => {
    const calculators = NAV.find(
      (item) => item.label === "Mortgage Calculators",
    );

    expect(calculators).toEqual({
      label: "Mortgage Calculators",
      href: "/coming-soon",
      items: [
        { label: "Affordability calculator", href: "/coming-soon" },
        { label: "Mortgage calculator", href: "/coming-soon" },
        { label: "Rent vs buy calculator", href: "/coming-soon" },
        { label: "Cash-out calculator", href: "/coming-soon" },
        { label: "Investment calculator", href: "/calculators/investment" },
      ],
    });
  });

  it("hides every rates link when rates navigation is disabled", () => {
    const navigation = navigationForFeatures({ ratesNavigation: false });
    const hrefs = navigation.flatMap((item) => [
      item.href,
      ...item.items.map((sub) => sub.href),
    ]);

    expect(hrefs).not.toContain("/rates");
  });

  it("preserves rates links for tenants that enable them", () => {
    const navigation = navigationForFeatures({ ratesNavigation: true });
    expect(navigation).toEqual(NAV);
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
