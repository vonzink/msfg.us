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
  | "manuf"
  | "doc"
  | "offer"
  | "dooropen"
  | "search"
  | "units";

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
  /** Named lead-field key (e.g. "propertyUse"); omit for non-captured choices. */
  field?: string;
  opts: ChoiceOption[];
  /** Optional muted sub-line under the options. */
  sub?: string;
  /** When true, show the 5★ customer testimonial under the options. */
  review?: boolean;
};

type BinaryStep = {
  type: "binary";
  q: string;
  field?: string;
  /** Optional underlined helper link text (non-navigating placeholder). */
  help?: string;
  /** When true, show the USA TODAY trust badge below the Yes/No buttons. */
  usatoday?: boolean;
};

type PlaceStep = {
  type: "place";
  q: string;
  /** Named lead-field key. */
  field?: string;
  /** Floating-label text for the input. */
  fieldLabel: string;
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

/** Multi-select (checkboxes). Stores string[]. */
type MultiStep = {
  type: "multi";
  q: string;
  field: string;
  opts: ChoiceOption[];
  sub?: string;
};

/** Currency input. Stores number | null. `optional` adds a Skip control.
 *  `unit` selects the affix + parser: "$" (default, thousands-formatted) or
 *  "%" (0–100, trailing % suffix). */
type CurrencyStep = {
  type: "currency";
  q: string;
  field: string;
  placeholder?: string;
  optional?: boolean;
  help?: string;
  unit?: "$" | "%";
};

/** Street-address autocomplete (+ Apt/Unit + ZIP). Stores StructuredAddress. */
type AddressStep = {
  type: "address";
  q: string;
  field: string;
  help?: string;
};

/** Two-door finish (Continue in the app / Talk to a loan officer). */
type FinishStep = { type: "finish"; q: string };

/** Loan-officer picker shown right before the finish step. Stores the chosen
 *  officer's `slug` (or the sentinel "no-preference"). Rendered by OfficerStep
 *  with the per-tenant roster, defaulting to officers licensed in the property
 *  state (from the address step) with a "show all" fallback. */
type OfficerStep = {
  type: "officer";
  q: string;
  field: string;
  sub?: string;
};

export type Step =
  | ChoiceStep
  | BinaryStep
  | PlaceStep
  | FormStep
  | AccountStep
  | MultiStep
  | CurrencyStep
  | AddressStep
  | OfficerStep
  | FinishStep;

/**
 * Per-intent step sequences. Ported exactly from apply.jsx `FLOW`:
 * - buy: 11 steps, refi: 10 steps, cash: 4 steps.
 */
export const FLOW: Record<Intent, Step[]> = {
  buy: [
    {
      type: "choice",
      q: "Where are you in the home buying process?",
      field: "buyStage",
      opts: [
        { label: "Signed a purchase agreement", icon: "doc" },
        { label: "Making offers", icon: "offer" },
        { label: "Going to open houses", icon: "dooropen" },
        { label: "Just researching", icon: "search" },
      ],
    },
    {
      type: "address",
      q: "What's the address of the new property?",
      field: "address",
      help: "Why do we need this?",
    },
    {
      type: "choice",
      q: "How will you use this home?",
      field: "propertyUse",
      opts: [
        { label: "Primary residence", icon: "mailbox" },
        { label: "Second home", icon: "palm" },
        { label: "Investment property", icon: "invest" },
      ],
      sub: "Our fast, digital process has helped thousands of buyers save time and money. You're next!",
    },
    {
      type: "choice",
      q: "What type of home?",
      field: "propertyType",
      opts: [
        { label: "Single Family", icon: "house" },
        { label: "Condo", icon: "condo" },
        { label: "Co-op", icon: "coop" },
        { label: "2 to 4 units", icon: "units" },
        { label: "Manufactured home", icon: "manuf" },
      ],
      review: true,
    },
    {
      type: "binary",
      q: "Have you owned any property in the last three years?",
      field: "ownedLast3yr",
      help: "What is a first-time home buyer?",
    },
    {
      type: "currency",
      q: "What's the purchase price?",
      field: "purchasePrice",
      placeholder: "e.g. 425,000",
    },
    {
      type: "currency",
      q: "How much are you putting down?",
      field: "downPaymentPct",
      unit: "%",
      placeholder: "e.g. 20",
    },
    {
      type: "choice",
      q: "What's your estimated credit score?",
      field: "creditBand",
      sub: "A self-estimate is fine — this won't affect your credit.",
      opts: [
        { label: "Excellent (740+)", icon: "invest" },
        { label: "Good (680–739)", icon: "house" },
        { label: "Fair (620–679)", icon: "cal", badge: "F" },
        { label: "Below 620", icon: "help" },
        { label: "Not sure", icon: "help" },
      ],
    },
    {
      type: "currency",
      q: "What's your household income?",
      field: "income",
      placeholder: "e.g. 120,000",
      optional: true,
    },
    { type: "form", q: "Let's start personalizing your offer!" },
    { type: "finish", q: "You're all set — what's next?" },
  ],
  refi: [
    {
      type: "multi",
      q: "What are your refinance goals?",
      field: "goals",
      sub: "Select all that apply.",
      opts: [
        { label: "Lower my monthly payment", icon: "invest" },
        { label: "Take cash out", icon: "house" },
        { label: "Just checking rates", icon: "help" },
      ],
    },
    {
      type: "address",
      q: "What home are you refinancing?",
      field: "address",
      help: "Why do we need this?",
    },
    {
      type: "choice",
      q: "How do you use this property?",
      field: "propertyUse",
      opts: [
        { label: "Primary residence", icon: "mailbox" },
        { label: "Second home", icon: "palm" },
        { label: "Investment property", icon: "invest" },
      ],
    },
    {
      type: "choice",
      q: "What type of property is it?",
      field: "propertyType",
      opts: [
        { label: "Single Family", icon: "house" },
        { label: "Condo", icon: "condo" },
        { label: "Townhouse", icon: "coop" },
        { label: "Manufactured home", icon: "manuf" },
        { label: "Other", icon: "help" },
      ],
      review: true,
    },
    {
      type: "currency",
      q: "What's your estimated home value?",
      field: "homeValue",
      placeholder: "e.g. 485,000",
    },
    {
      type: "currency",
      q: "What's your current mortgage balance?",
      field: "mortgageBalance",
      placeholder: "e.g. 312,000",
    },
    {
      type: "choice",
      q: "What's your estimated credit score?",
      field: "creditBand",
      sub: "A self-estimate is fine — this won't affect your credit.",
      opts: [
        { label: "Excellent (740+)", icon: "invest" },
        { label: "Good (680–739)", icon: "house" },
        { label: "Fair (620–679)", icon: "cal", badge: "F" },
        { label: "Below 620", icon: "help" },
        { label: "Not sure", icon: "help" },
      ],
    },
    {
      type: "currency",
      q: "What's your household income?",
      field: "income",
      placeholder: "e.g. 120,000",
      optional: true,
    },
    {
      type: "officer",
      q: "Who would you like to work with?",
      field: "loanOfficer",
      sub: "Pick a loan officer, or let us match you with the right fit.",
    },
    { type: "form", q: "Let's start personalizing your offer!" },
    { type: "finish", q: "You're all set — what's next?" },
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
      fieldLabel: "City, State, or ZIP code",
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
