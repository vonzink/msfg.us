/**
 * Navigation model — header mega-nav and footer columns.
 * Routing rules (from PAGES.md): Purchase/Refi/Equity -> category pages,
 * Rates -> /rates, Loan Officers -> /loan-officers, "Apply now"/CTAs ->
 * /apply/{intent}. Secondary links without a page yet (About, Careers, etc.)
 * point at /coming-soon until those features ship. Calculator links are never
 * written here: they come from src/calculators/registry.ts, so a calculator is
 * in the menu and footer only while it is live and switched on.
 */
import type { CalculatorEntry } from "@/calculators/registry";

export type NavLink = { label: string; href: string; badge?: string };
export type NavItem = { label: string; href: string; items: NavLink[] };

const CALCULATORS_MENU = "Mortgage Calculators";

const calculatorLinks = (calculators: CalculatorEntry[]): NavLink[] =>
  calculators.map((c) => ({ label: c.label, href: c.path }));

export const NAV: NavItem[] = [
  {
    label: "Purchase",
    href: "/buy",
    items: [],
  },
  {
    label: "Refinance",
    href: "/refinance",
    items: [],
  },
  {
    // Links are filled from the registry by navigationForFeatures.
    label: CALCULATORS_MENU,
    href: "/calculators",
    items: [],
  },
  {
    label: "Services",
    href: "/#services",
    items: [
      { label: "MSFG Mortgage", href: "/buy" },
      { label: "MSFG Veterans", href: "/veterans" },
      { label: "MSFG Reverse", href: "/reverse" },
      { label: "MSFG Investment", href: "/investment" },
      { label: "MSFG Commercial", href: "/commercial" },
      { label: "MSFG Equity", href: "/home-equity" },
    ],
  },
  {
    label: "Rates",
    href: "/rates",
    items: [
      { label: "Purchase rates", href: "/rates" },
      { label: "Refinance rates", href: "/rates" },
      { label: "Cash-out rates", href: "/rates" },
      { label: "HELOC rates", href: "/rates" },
      { label: "VA rates", href: "/rates" },
    ],
  },
  {
    label: "Loan Officers",
    href: "/loan-officers",
    items: [
      { label: "Meet the team", href: "/loan-officers" },
      { label: "Find by location", href: "/loan-officers" },
      { label: "Schedule a call", href: "/loan-officers" },
    ],
  },
];

/**
 * Resolve the primary navigation for a tenant without removing the dormant
 * routes. Rates can be restored by publishing the corresponding feature flag.
 * `calculators` is the tenant's enabled calculators (enabledCalculators in the
 * registry); with none, the calculators menu is left out.
 */
export function navigationForFeatures(
  { ratesNavigation }: { ratesNavigation: boolean },
  calculators: CalculatorEntry[],
): NavItem[] {
  const withCalculators = NAV.flatMap((item) => {
    if (item.label !== CALCULATORS_MENU) return [item];
    return calculators.length ? [{ ...item, items: calculatorLinks(calculators) }] : [];
  });
  if (ratesNavigation) return withCalculators;

  return withCalculators.filter((item) => item.href !== "/rates").map((item) => ({
    ...item,
    items: item.items.filter((sub) => sub.href !== "/rates"),
  }));
}

export type FooterColumn = { heading: string; links: NavLink[] };

export const FOOTER_COLUMNS: FooterColumn[] = [
  {
    heading: "Resources",
    links: [
      { label: "Buy a home", href: "/buy" },
      { label: "Mortgage Glossary", href: "/resources/mortgage-glossary" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "About us", href: "/about" },
      { label: "Careers", href: "/careers" },
      { label: "Media", href: "/coming-soon" },
      { label: "Know Your Lender", href: "/know-your-lender" },
      { label: "Loan officers", href: "/loan-officers" },
      { label: "Developers", href: "/developers" },
      { label: "FAQs", href: "/coming-soon" },
    ],
  },
];

/** Contact & legal links column (rendered with live contact details). */
/** Footer columns with the tenant's enabled calculators leading the Resources column. */
export function footerColumnsFor(calculators: CalculatorEntry[]): FooterColumn[] {
  return FOOTER_COLUMNS.map((col) =>
    col.heading === "Resources" ? { ...col, links: [...calculatorLinks(calculators), ...col.links] } : col,
  );
}

export const FOOTER_LEGAL_LINKS: NavLink[] = [
  { label: "Licensing & Disclosures", href: "/licensing" },
  { label: "Privacy Notice", href: "/privacy-notice" },
  { label: "Privacy Policy", href: "/privacy-policy" },
  { label: "Terms of Use", href: "/terms" },
  { label: "Accessibility", href: "/accessibility" },
  { label: "Texas Consumer Notice", href: "/texas-required-notice" },
  { label: "NMLS Consumer Access", href: "/nmls-consumer-access" },
  { label: "Site Map", href: "/sitemap" },
];
