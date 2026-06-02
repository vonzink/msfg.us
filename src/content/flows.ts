/**
 * Application-flow ("apply wizard") configuration — the conversion spine.
 *
 * Source of truth: design-reference/design_handoff_msfg_site/prototype/apply.jsx
 * (`FLOW`). Step types, copy, options, and order are ported 1:1 from the
 * prototype. Option / eligibility copy is [PLACEHOLDER] until confirmed with
 * MSFG's real loan programs.
 *
 * The `account` step is a UI mock — wire to MSFG's real auth + LOS later.
 */

/** The three entry intents. Maps to the `/apply/[intent]` route segment. */
export type Intent = "buy" | "refi" | "cash";

/** All valid intents, used by generateStaticParams + notFound() guarding. */
export const INTENTS: readonly Intent[] = ["buy", "refi", "cash"] as const;

/**
 * Icon identifier for a choice option's tile. Resolved to a concrete glyph in
 * `ChoiceStep` (lucide-react), with the calendar variants rendering a short
 * `badge` label inside a calendar tile (e.g. "0–3", "6+", "15", "$").
 */
export type StepIconKey =
  | "cal"
  | "help"
  | "mailbox"
  | "palm"
  | "invest"
  | "house"
  | "condo"
  | "coop"
  | "manuf";

export type ChoiceOption = {
  /** Visible option label (also the stored answer value). */
  label: string;
  /** Icon tile glyph. */
  icon: StepIconKey;
  /** Optional short text shown inside a calendar tile (e.g. "0–3", "$"). */
  badge?: string;
};

type ChoiceStep = {
  type: "choice";
  /** Big h1 question. */
  q: string;
  opts: ChoiceOption[];
  /** Optional muted sub-line under the options. */
  sub?: string;
  /** When true, show the 5★ customer testimonial under the options. */
  review?: boolean;
};

type BinaryStep = {
  type: "binary";
  q: string;
  /** Optional underlined helper link text (non-navigating placeholder). */
  help?: string;
  /** When true, show the USA TODAY trust badge below the Yes/No buttons. */
  usatoday?: boolean;
};

type PlaceStep = {
  type: "place";
  q: string;
  /** Floating-label text for the single City/State/ZIP input. */
  field: string;
  /** Input placeholder example. */
  placeholder: string;
};

type FormStep = {
  type: "form";
  q: string;
};

type AccountStep = {
  type: "account";
  q: string;
};

export type Step = ChoiceStep | BinaryStep | PlaceStep | FormStep | AccountStep;

/**
 * Per-intent step sequences. Ported exactly from apply.jsx `FLOW`:
 * - buy: 7 steps, refi: 5 steps, cash: 4 steps.
 */
export const FLOW: Record<Intent, Step[]> = {
  buy: [
    {
      type: "choice",
      q: "When do you plan to buy?",
      opts: [
        { label: "0–3 months", icon: "cal", badge: "0–3" },
        { label: "3–6 months", icon: "cal", badge: "3–6" },
        { label: "6+ months", icon: "cal", badge: "6+" },
        { label: "Not sure", icon: "help" },
      ],
    },
    {
      type: "choice",
      q: "How will you use this home?",
      opts: [
        { label: "Primary residence", icon: "mailbox" },
        { label: "Second home", icon: "palm" },
        { label: "Investment property", icon: "invest" },
      ],
      sub: "Our fast, digital process has helped 4,200+ families save time and money. You're next!",
    },
    {
      type: "choice",
      q: "What type of home?",
      opts: [
        { label: "Single Family", icon: "house" },
        { label: "Condo", icon: "condo" },
        { label: "Co-op", icon: "coop" },
        { label: "Manufactured home", icon: "manuf" },
      ],
      review: true,
    },
    {
      type: "binary",
      q: "Have you owned any property in the last three years?",
      help: "What is a first-time home buyer?",
      usatoday: true,
    },
    {
      type: "place",
      q: "Where are you looking to buy?",
      field: "City, State, or ZIP code",
      placeholder: "e.g. Westminster, CO 80031",
    },
    { type: "form", q: "Let's start personalizing your offer!" },
    { type: "account", q: "Looks like you have an account with us already" },
  ],
  refi: [
    {
      type: "choice",
      q: "What's your refinance goal?",
      opts: [
        { label: "Lower my monthly payment", icon: "invest" },
        { label: "Shorten my loan term", icon: "cal", badge: "15" },
        { label: "Take cash out", icon: "house" },
        { label: "Not sure yet", icon: "help" },
      ],
    },
    {
      type: "choice",
      q: "How will you use this home?",
      opts: [
        { label: "Primary residence", icon: "mailbox" },
        { label: "Second home", icon: "palm" },
        { label: "Investment property", icon: "invest" },
      ],
    },
    {
      type: "place",
      q: "Where is the property?",
      field: "City, State, or ZIP code",
      placeholder: "e.g. Fargo, ND 58102",
    },
    { type: "form", q: "Let's start personalizing your offer!" },
    { type: "account", q: "Looks like you have an account with us already" },
  ],
  cash: [
    {
      type: "choice",
      q: "What will you use the cash for?",
      opts: [
        { label: "Home improvement", icon: "house" },
        { label: "Pay off debt", icon: "invest" },
        { label: "Major expense", icon: "cal", badge: "$" },
        { label: "Something else", icon: "help" },
      ],
    },
    {
      type: "place",
      q: "Where is the property?",
      field: "City, State, or ZIP code",
      placeholder: "e.g. Bismarck, ND 58501",
    },
    { type: "form", q: "Let's start personalizing your offer!" },
    { type: "account", q: "Looks like you have an account with us already" },
  ],
};

/** Human-readable intent label (used in metadata / copy). */
export const INTENT_LABEL: Record<Intent, string> = {
  buy: "Buy a home",
  refi: "Refinance",
  cash: "Get cash from my home",
};
