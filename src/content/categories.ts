/**
 * Category-page configuration — one config-driven template powers
 * /buy, /refinance, /home-equity. Ported from the prototype's `CATS`
 * object (design-reference/.../prototype/category.jsx).
 *
 * All program copy, stats, and audiences are marketing placeholders —
 * confirm MSFG's actual programs & eligibility before launch.
 */

/** Apply-flow intent target. equity maps to the `cash` intent. */
export type Intent = "buy" | "refi" | "cash";

/** Program-card icon key — maps to a lucide icon in the renderer. */
export type ProgramIcon =
  | "conv"
  | "fha"
  | "va"
  | "usda"
  | "jumbo"
  | "arm"
  | "heloc"
  | "cashout";

/**
 * Which numeric field a QuickEstimate input represents. The renderer uses
 * this to derive the loan principal and to format the field (% vs $):
 * - `price`   → Home price ($), paired with a `downPct` input
 * - `downPct` → Down payment (%) of price
 * - `balance` → existing Loan balance ($)
 * - `cashout` → Cash out added to the balance ($)
 * - `value`   → Home value ($)
 * - `mortgage`→ current Mortgage balance subtracted from value ($)
 */
export type EstimateFieldKind =
  | "price"
  | "downPct"
  | "balance"
  | "cashout"
  | "value"
  | "mortgage";

/** How the estimator derives the amortized principal from inputs a & b. */
export type PrincipalMode =
  | "priceDown" // a = price, b = down% → a * (1 - b/100)
  | "balancePlus" // a = balance, b = cash out → a + b
  | "valueMinus"; // a = home value, b = mortgage balance → a - b

export type EstimateField = {
  /** Visible label (prototype copy). */
  label: string;
  kind: EstimateFieldKind;
  /** Initial value shown on load (matches prototype defaults). */
  default: number;
};

export type QuickEstimateConfig = {
  /** Card title per category. */
  title: string;
  /** Assumed APR used for the amortization (also shown in the subhead). */
  apr: number;
  /** How to combine the two inputs into a loan principal. */
  principal: PrincipalMode;
  /** Term used for the amortization, in months. */
  termMonths: number;
  /** The two numeric inputs, in display order. */
  inputs: [EstimateField, EstimateField];
};

/** A single "How it works" step: [title, description]. */
export type Step = readonly [title: string, desc: string];

/** A loan-program card. */
export type Program = {
  icon: ProgramIcon;
  title: string;
  desc: string;
  /** Rendered as "Best for · {audience}". */
  audience: string;
};

export type CategoryConfig = {
  /** Apply-flow intent (`/apply/{intent}`). */
  intent?: Intent;
  /** Primary CTA + program-card href. Defaults to /apply/{intent}. Set for products with no apply funnel (e.g. /loan-officers). */
  ctaHref?: string;
  /** Eyebrow tag (next to the Mark). */
  tag: string;
  /** Short crumb label. */
  crumb: string;
  /** Headline: [leadingText, mintAccentPhrase]. */
  h1: readonly [string, string];
  /** Sub copy under the headline. */
  sub: string;
  /** Primary CTA label (links to `/apply/{intent}`). */
  cta: string;
  /** Hero stat pairs: [number, label]. */
  stats: ReadonlyArray<readonly [num: string, label: string]>;
  /** Live-estimator config; omit for products without a payment estimate (the hero renders single-column). */
  quote?: QuickEstimateConfig;
  /** "How it works" — exactly four steps. */
  steps: readonly [Step, Step, Step, Step];
  /** Loan-programs section heading. */
  optsTitle: string;
  /** Loan-program cards. */
  opts: readonly Program[];
};

export type CategoryKey = "buy" | "refi" | "equity" | "veterans" | "reverse" | "investment" | "commercial";

export const CATS: Partial<Record<CategoryKey, CategoryConfig>> & Record<"buy" | "refi" | "equity", CategoryConfig> = {
  buy: {
    intent: "buy",
    tag: "Buy a home",
    crumb: "Buy",
    h1: ["Buy with clarity. ", "Close in 21 days."],
    sub: "A pre-approval you can stand behind, a process you can actually follow, and a local loan officer on call the whole way.",
    cta: "Start my application",
    stats: [
      ["$1.4B+", "funded"], // [PLACEHOLDER]
      ["21 days", "avg. close"], // [PLACEHOLDER]
      ["4.9★", "612 reviews"], // [PLACEHOLDER]
    ],
    quote: {
      title: "Estimate your payment",
      apr: 6.375, // [PLACEHOLDER]
      principal: "priceDown",
      termMonths: 360,
      inputs: [
        { label: "Home price", kind: "price", default: 485000 },
        { label: "Down payment", kind: "downPct", default: 10 },
      ],
    },
    steps: [
      [
        "Get pre-approved",
        "Answer a few quick questions and connect with a licensed loan officer to get pre-approved — no credit pull on this site.",
      ],
      [
        "Find your home",
        "Shop with confidence; we back your agent on every offer.",
      ],
      [
        "Lock & underwrite",
        "Lock your rate, then we drive appraisal, title, and conditions.",
      ],
      [
        "Close & move in",
        "Sign, get your keys, and meet your dedicated servicing team.",
      ],
    ],
    optsTitle: "Loan programs for buyers",
    opts: [
      {
        icon: "conv",
        title: "Conventional",
        desc: "Flexible terms from 3% down for strong credit.",
        audience: "Most popular",
      },
      {
        icon: "fha",
        title: "FHA",
        desc: "Lower down payment and credit requirements.",
        audience: "First-time buyers",
      },
      {
        icon: "va",
        title: "VA",
        desc: "0% down, no PMI for service members & veterans.",
        audience: "Veterans",
      },
      {
        icon: "usda",
        title: "USDA",
        desc: "Zero-down options in eligible rural & suburban areas.",
        audience: "Rural",
      },
    ],
  },

  refi: {
    intent: "refi",
    tag: "Refinance",
    crumb: "Refinance",
    h1: ["Refinance to a ", "payment that fits."],
    sub: "Lower your rate, shorten your term, or tap equity — we'll run the break-even in plain English before you commit.",
    cta: "See my refinance options",
    stats: [
      ["$312/mo", "avg. savings"], // [PLACEHOLDER]
      ["18 days", "avg. close"], // [PLACEHOLDER]
      ["4.9★", "612 reviews"], // [PLACEHOLDER]
    ],
    quote: {
      title: "Estimate your new payment",
      apr: 6.125, // [PLACEHOLDER]
      principal: "balancePlus",
      termMonths: 360,
      inputs: [
        { label: "Loan balance", kind: "balance", default: 360000 },
        { label: "Cash out", kind: "cashout", default: 0 },
      ],
    },
    steps: [
      [
        "Tell us your goal",
        "Lower payment, shorter term, or cash out — we tailor from there.",
      ],
      [
        "Get your number",
        "A clear break-even and side-by-side rate comparison.",
      ],
      [
        "Lock & underwrite",
        "We handle the appraisal and paperwork end to end.",
      ],
      ["Close at home", "Sign digitally; your new payment starts next cycle."],
    ],
    optsTitle: "Refinance options",
    opts: [
      {
        icon: "arm",
        title: "Rate & term",
        desc: "Lower your rate or change your loan length.",
        audience: "Lower payment",
      },
      {
        icon: "cashout",
        title: "Cash-out",
        desc: "Replace your loan and take equity as cash.",
        audience: "Access equity",
      },
      {
        icon: "va",
        title: "VA IRRRL",
        desc: "Streamlined refinance for existing VA loans.",
        audience: "Veterans",
      },
      {
        icon: "fha",
        title: "FHA streamline",
        desc: "Simplified refinance for current FHA borrowers.",
        audience: "FHA borrowers",
      },
    ],
  },

  equity: {
    intent: "cash",
    tag: "Home Equity",
    crumb: "Home Equity",
    h1: ["Put your equity ", "to work."],
    sub: "A fast, fully digital HELOC or cash-out — for renovations, debt payoff, or whatever's next.",
    cta: "Calculate my cash",
    stats: [
      ["3-day", "digital HELOC"], // [PLACEHOLDER]
      ["$0", "application fee"], // [PLACEHOLDER]
      ["4.9★", "612 reviews"], // [PLACEHOLDER]
    ],
    quote: {
      title: "Estimate your available cash",
      apr: 7.25, // [PLACEHOLDER]
      principal: "valueMinus",
      termMonths: 360,
      inputs: [
        { label: "Home value", kind: "value", default: 600000 },
        { label: "Mortgage balance", kind: "mortgage", default: 0 },
      ],
    },
    steps: [
      [
        "Tell us about your home",
        "Value and current balance set your available equity.",
      ],
      [
        "Pick HELOC or cash-out",
        "We compare both for your situation, side by side.",
      ],
      [
        "Quick verification",
        "Digital income and asset checks — no branch visit needed.",
      ],
      ["Funds in days", "Draw what you need, when you need it."],
    ],
    optsTitle: "Ways to access equity",
    opts: [
      {
        icon: "heloc",
        title: "HELOC",
        desc: "A revolving line you draw from as needed.",
        audience: "Flexible",
      },
      {
        icon: "cashout",
        title: "Cash-out refinance",
        desc: "Replace your mortgage and take a lump sum.",
        audience: "Lump sum",
      },
    ],
  },

  veterans: {
    intent: "buy",
    tag: "MSFG Veterans",
    crumb: "Veterans",
    h1: ["Your VA benefit. ", "Maximized."],
    sub: "VA purchase, refinance, and IRRRL — benefit-focused lending for veterans, active-duty service members, and eligible surviving spouses.",
    cta: "Get pre-approved",
    stats: [
      ["$0", "down payment"],
      ["No PMI", "ever"],
      ["4.9★", "612 reviews"], // [PLACEHOLDER]
    ],
    quote: {
      title: "Estimate your payment",
      apr: 6.375, // [PLACEHOLDER]
      principal: "priceDown",
      termMonths: 360,
      inputs: [
        { label: "Home price", kind: "price", default: 485000 },
        { label: "Down payment", kind: "downPct", default: 0 },
      ],
    },
    steps: [
      ["Confirm eligibility", "We help you obtain your Certificate of Eligibility (COE) and confirm your entitlement."],
      ["Get pre-approved", "A few quick questions and a licensed VA-savvy loan officer — no credit pull on this site."],
      ["Find your home", "Shop with a $0-down, no-PMI pre-approval sellers take seriously."],
      ["Close & move in", "We drive appraisal, title, and conditions to a smooth closing."],
    ],
    optsTitle: "VA loan options",
    opts: [
      { icon: "va", title: "VA purchase", desc: "0% down, no monthly PMI, competitive rates.", audience: "Buyers" },
      { icon: "va", title: "VA IRRRL", desc: "Streamlined rate-reduction refinance of an existing VA loan.", audience: "Lower payment" },
      { icon: "cashout", title: "VA cash-out", desc: "Tap equity or refinance a non-VA loan into a VA loan.", audience: "Access equity" },
      { icon: "jumbo", title: "VA jumbo", desc: "High-balance VA financing above conforming limits.", audience: "High-cost areas" },
    ],
  },

  investment: {
    intent: "buy",
    tag: "MSFG Investment",
    crumb: "Investment",
    h1: ["Build wealth, ", "one property at a time."],
    sub: "Financing for rental properties, DSCR loans, second homes, and portfolio investors — qualify on the property's cash flow, not just your W-2.",
    cta: "Start my application",
    stats: [
      ["DSCR", "qualify on rent"],
      ["1–4 units", "& portfolios"], // [PLACEHOLDER]
      ["4.9★", "612 reviews"], // [PLACEHOLDER]
    ],
    quote: {
      title: "Estimate your payment",
      apr: 7.125, // [PLACEHOLDER]
      principal: "priceDown",
      termMonths: 360,
      inputs: [
        { label: "Purchase price", kind: "price", default: 425000 },
        { label: "Down payment", kind: "downPct", default: 25 },
      ],
    },
    steps: [
      ["Tell us the deal", "Property, rents, and your goals — we match the right program."],
      ["Get pre-approved", "DSCR options qualify on the property's cash flow; full-doc options also available."],
      ["Lock & underwrite", "We coordinate appraisal, rent schedule, and conditions."],
      ["Close & scale", "Fund this one, then come back for the next."],
    ],
    optsTitle: "Investment loan options",
    opts: [
      { icon: "cashout", title: "DSCR", desc: "Qualify on the property's rental cash flow — no personal income docs.", audience: "Rental investors" },
      { icon: "conv", title: "Conventional investment", desc: "Up to 4 financed units with competitive conventional terms.", audience: "Full-doc buyers" },
      { icon: "fha", title: "Second home", desc: "Financing for a vacation or secondary residence.", audience: "Second homes" },
      { icon: "jumbo", title: "Portfolio & jumbo", desc: "Higher loan amounts and multi-property portfolios.", audience: "Scaling investors" },
    ],
  },

  reverse: {
    // No apply funnel + no payment estimator — specialist consult.
    ctaHref: "/loan-officers",
    tag: "MSFG Reverse",
    crumb: "Reverse",
    h1: ["Tap your equity. ", "Stay in your home."],
    sub: "A reverse mortgage (HECM) lets homeowners 62+ convert home equity into cash — with no required monthly mortgage payment, while you keep the title to your home.",
    cta: "Talk to a reverse specialist",
    stats: [
      ["62+", "eligible age"],
      ["$0", "required monthly payment"], // [PLACEHOLDER]
      ["FHA-insured", "HECM"], // [PLACEHOLDER]
    ],
    steps: [
      ["See if you qualify", "Homeowners 62+ with sufficient equity in a primary residence may be eligible."],
      ["Independent counseling", "A HUD-approved counselor reviews the program with you — required and protective."],
      ["Appraisal & approval", "We order the appraisal and confirm your available proceeds."],
      ["Receive your funds", "Take a lump sum, line of credit, monthly draws, or a combination."],
    ],
    optsTitle: "Reverse mortgage options",
    opts: [
      { icon: "heloc", title: "HECM", desc: "The FHA-insured Home Equity Conversion Mortgage for 62+.", audience: "Most common" },
      { icon: "conv", title: "HECM for Purchase", desc: "Buy a more suitable home and use a reverse mortgage in one step.", audience: "Right-sizing" },
      { icon: "cashout", title: "Reverse refinance", desc: "Refinance an existing reverse mortgage to better terms or more proceeds.", audience: "Existing borrowers" },
    ],
  },

  commercial: {
    // No consumer apply funnel — specialist consult.
    ctaHref: "/loan-officers",
    tag: "MSFG Commercial",
    crumb: "Commercial",
    h1: ["Financing for ", "business real estate."],
    sub: "Lending solutions for commercial property, multifamily, mixed-use, and investor-owned real estate — structured around your business and your asset.",
    cta: "Talk to a commercial specialist",
    stats: [
      ["Multifamily", "5+ units"], // [PLACEHOLDER]
      ["Mixed-use", "& retail"], // [PLACEHOLDER]
      ["Investor", "focused"], // [PLACEHOLDER]
    ],
    steps: [
      ["Tell us the project", "Property type, business plan, and goals frame the right structure."],
      ["Review scenarios", "We compare programs, rates, and terms across our lender network."],
      ["Underwrite & appraise", "We coordinate the commercial appraisal and due diligence."],
      ["Fund & grow", "Close with a partner who's ready for your next acquisition."],
    ],
    optsTitle: "Commercial loan options",
    opts: [
      { icon: "conv", title: "Multifamily", desc: "Apartment buildings and 5+ unit residential properties.", audience: "Multifamily" },
      { icon: "jumbo", title: "Mixed-use & retail", desc: "Storefronts, offices, and mixed-use buildings.", audience: "Mixed-use" },
      { icon: "cashout", title: "Investor / DSCR commercial", desc: "Cash-flow-based financing for investor-owned commercial real estate.", audience: "Investors" },
    ],
  },
};
