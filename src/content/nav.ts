/**
 * Navigation model — header mega-nav and footer columns.
 * Routing rules (from PAGES.md): Buy/Refi/Equity -> category pages,
 * Rates -> /rates, Loan Officers -> /loan-officers, "Apply now"/CTAs ->
 * /apply/{intent}. Secondary links without a page yet (calculators, About,
 * Careers, etc.) point at /coming-soon until those features ship.
 */

export type NavLink = { label: string; href: string; badge?: string };
export type NavItem = { label: string; href: string; items: NavLink[] };

export const NAV: NavItem[] = [
  {
    label: "Buy",
    href: "/buy",
    items: [
      { label: "Apply now", href: "/apply/buy" },
      { label: "Purchase rates", href: "/rates" },
      { label: "Affordability calculator", href: "/coming-soon" },
      { label: "Mortgage calculator", href: "/coming-soon" },
      { label: "Rent vs buy calculator", href: "/coming-soon" },
      { label: "Find an agent", href: "/loan-officers" },
      { label: "VA loans", href: "/buy", badge: "New" },
    ],
  },
  {
    label: "Refinance",
    href: "/refinance",
    items: [
      { label: "Apply now", href: "/apply/refi" },
      { label: "Refinance rates", href: "/rates" },
      { label: "Cash-out calculator", href: "/coming-soon" },
    ],
  },
  {
    label: "Home Equity",
    href: "/home-equity",
    items: [
      { label: "Apply now", href: "/apply/cash" },
      { label: "Calculate your cash", href: "/coming-soon" },
      { label: "HELOC vs. cash-out", href: "/home-equity" },
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
      { label: "Find by language", href: "/loan-officers" },
      { label: "Schedule a call", href: "/loan-officers" },
    ],
  },
];

export type FooterColumn = { heading: string; links: NavLink[] };

export const FOOTER_COLUMNS: FooterColumn[] = [
  {
    heading: "Resources",
    links: [
      { label: "Affordability calculator", href: "/coming-soon" },
      { label: "Mortgage calculator", href: "/coming-soon" },
      { label: "Rent vs buy calculator", href: "/coming-soon" },
      { label: "HELOC calculator", href: "/coming-soon" },
      { label: "Buy a home", href: "/buy" },
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
