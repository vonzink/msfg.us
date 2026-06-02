/**
 * Site-wide brand, contact, and legal config — single source of truth.
 * Values marked [PLACEHOLDER] must be replaced with real MSFG data before
 * the apex (production) launch. See PROJECT plan "Replace before launch".
 */

export const SITE = {
  /** Canonical site URL; overridden per-environment via NEXT_PUBLIC_SITE_URL. */
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://msfg.us",
  env: process.env.NEXT_PUBLIC_SITE_ENV ?? "development",

  legalName: "Mountain State Financial Group, LLC",
  shortName: "MSFG",
  foundedYear: 1998,

  /** [PLACEHOLDER] company NMLS unique identifier. */
  nmls: "1234567",
  nmlsConsumerAccessUrl: "https://www.nmlsconsumeraccess.org/",

  /** [PLACEHOLDER] contact details. */
  phoneDisplay: "(303) 555-0142",
  phoneHref: "tel:+13035550142",
  email: "hello@msfg.us",

  tagline:
    "A family of companies serving every step of your homeownership journey — since 1998.",

  /** Licensed states (USPS code + full name). */
  states: [
    { code: "CO", name: "Colorado" },
    { code: "ND", name: "North Dakota" },
    { code: "SD", name: "South Dakota" },
    { code: "MN", name: "Minnesota" },
    { code: "TX", name: "Texas" },
    { code: "MI", name: "Michigan" },
    { code: "IN", name: "Indiana" },
  ],

  /** [PLACEHOLDER] hero / trust metrics. */
  stats: [
    { num: "$1.4B+", label: "funded loans" },
    { num: "4,200+", label: "families served" },
    { num: "21 days", label: "avg. close time" },
  ],
} as const;

/** Comma-joined licensed-state codes for disclosure copy. */
export const STATES_LINE = SITE.states.map((s) => s.code).join(", ");

/**
 * Legal strip shown in the footer of every page and (abbreviated) in
 * compliance contexts. [PLACEHOLDER] NMLS # until verified.
 */
export const LEGAL_STRIP = `${SITE.legalName}. NMLS #${SITE.nmls} [PLACEHOLDER]. Equal Housing Lender. Licensed in ${STATES_LINE}. Loans subject to credit and property approval. Rates and terms subject to change without notice. MSFG AI provides general information and estimates only and is not a commitment to lend. © ${SITE.foundedYear}–2026 MSFG, LLC.`;

/** Short marketing/automated-contact consent microcopy (TCPA). */
export const CONSENT_TCPA = `By submitting, you agree that ${SITE.shortName} and its affiliates may contact you about your inquiry by phone, text, and email — including via automated technology — at the number and address provided. Consent is not a condition of any purchase. Message and data rates may apply.`;

/** Rate-table assumptions disclaimer. */
export const RATES_DISCLAIMER =
  "Rates shown are indicative, assume a 740+ FICO score, a $300,000 loan on a single-family primary residence, and are not a commitment to lend. Your actual rate depends on your credit, property, loan amount, and a complete application. Rates and points are subject to change without notice.";

/** Texas-specific consumer notice (required where TX-licensed). */
export const TEXAS_NOTICE =
  "Texas Consumer Complaint and Recovery Fund Notice available upon request. Figure: Consumers wishing to file a complaint against a mortgage company or licensed residential mortgage loan originator should complete and send a complaint form to the Texas Department of Savings and Mortgage Lending.";

/** Homepage "Everything under one roof" — six family-of-companies cards. */
export const FAMILY_OF_COMPANIES = [
  {
    rest: "Mortgage",
    href: "/buy",
    desc: "Apply 100% online with expert support — or walk into a local branch.",
  },
  {
    rest: "Real Estate",
    href: "/",
    desc: "Match with a local partner agent and save on your home purchase.",
  },
  {
    rest: "Insurance",
    href: "/",
    desc: "Shop, bundle, and save on home, auto, and life coverage in one place.",
  },
  {
    rest: "Title & Closing",
    href: "/",
    desc: "Transparent rates on title insurance, handled under one roof.",
  },
  {
    rest: "Inspect",
    href: "/",
    desc: "Free repair estimates and fast report turnarounds before you commit.",
  },
  {
    rest: "HELOC",
    href: "/home-equity",
    desc: "Tap your equity with a fast, fully digital home equity line.",
  },
] as const;

/** Footer family list — four entries, shorter copy. */
export const FOOTER_FAMILY = [
  { rest: "Mortgage", desc: "Apply 100% online, with expert customer support." },
  {
    rest: "Real Estate",
    desc: "Connect with a local partner agent to find out how much you can save.",
  },
  { rest: "Insurance", desc: "Shop, bundle, and save on home, auto, and life coverage." },
  { rest: "Inspect", desc: "Free repair estimates and 24-hour report turnarounds." },
] as const;

export type FamilyCompany = (typeof FAMILY_OF_COMPANIES)[number];
