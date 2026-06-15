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
  intent: Intent;
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
  /** Live-estimator config. */
  quote: QuickEstimateConfig;
  /** "How it works" — exactly four steps. */
  steps: readonly [Step, Step, Step, Step];
  /** Loan-programs section heading. */
  optsTitle: string;
  /** Loan-program cards. */
  opts: readonly Program[];
};

export type CategoryKey = "buy" | "refi" | "equity";

export const CATS: Record<CategoryKey, CategoryConfig> = {
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
};
