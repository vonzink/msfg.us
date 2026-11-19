import { parseNumber, parseRate, typedAmount, type FieldDef, type Values } from "../shared/fields";
import type { AprInput } from "./math";

/**
 * Inputs of the APR calculator. Four are always visible; five sit behind "Add detail" and start
 * empty. Every amount is dollars; mortgage insurance is per month; the rate and the points are
 * typed as percents.
 *
 * Only the loan amount and the interest rate have to be entered. Empty lender fees, points,
 * lender credit, mortgage insurance and home value count as 0, the same as a typed 0: an empty box
 * shows a grey "0", and a visitor reads that as zero. Prepaid interest is the one box where empty
 * and 0 differ: empty means the automatic 15 days of interest, a typed 0 means none, so the box is
 * marked `keepZero` and keeps a typed 0 on leaving the field. Lender fees keep a typed 0 as well.
 *
 * Empty and unreadable are told apart here, at the field boundary. Something typed that is not one
 * number ("abc", "2..5") is never counted as 0 and never as "automatic": `toInput` hands the model
 * a value it turns down, and `entryFaults` names the box for the page.
 */
export const FRONT_FIELDS: FieldDef[] = [
  { id: "loanAmount", label: "Loan amount", type: "money", example: "320,000" },
  // The example value and the note under this field come from tenant config (see exampleValues).
  { id: "rate", label: "Interest rate", type: "pct", example: "" },
  {
    id: "termYears", label: "Loan term", type: "choice", example: "30",
    options: [10, 15, 20, 25, 30].map((y) => ({ value: String(y), label: `${y} yr` })),
  },
  {
    id: "lenderFees", label: "Lender fees", type: "money", example: "4,000", keepZero: true,
    hint: "Everything the lender or a mortgage broker charges for the loan, as one total: origination, underwriting, processing, administration, rate lock and similar fees. Leave out the appraisal, title and recording costs.",
  },
];

export const DETAIL_FIELDS: FieldDef[] = [
  { id: "points", label: "Discount points", type: "pct", example: "", hint: "As a percent of the loan amount." },
  { id: "lenderCredit", label: "Lender credit", type: "money", example: "" },
  { id: "monthlyMi", label: "Mortgage insurance", type: "money", example: "", hint: "Per month." },
  { id: "homeValue", label: "Home value", type: "money", example: "", hint: "Needed to work out when mortgage insurance ends." },
  { id: "prepaidInterest", label: "Prepaid interest", type: "money", example: "", keepZero: true, hint: "Leave empty to use 15 days of interest." },
];

const ALL = [...FRONT_FIELDS, ...DETAIL_FIELDS];

/** The worked example the page opens with, at the tenant's example interest rate (a percent). */
export function exampleValues(exampleRatePct: number): Values {
  return { ...Object.fromEntries(ALL.map((f) => [f.id, f.example])), rate: String(exampleRatePct) };
}

/** Cleared form: every typed box empty, the term back to 30 years. */
export const BLANK: Values = Object.fromEntries(ALL.map((f) => [f.id, f.type === "choice" ? f.example : ""]));

const isEmpty = (text: string | undefined): boolean => String(text ?? "").trim() === "";
/**
 * True while the lender fees box is empty. Empty counts as $0 in the math, the same as a typed 0,
 * so the page asks here when it wants to say that nothing was entered.
 */
export const lenderFeesEmpty = (values: Values): boolean => isEmpty(values.lenderFees);
/** A box that may be left out: empty is 0, a number is itself, anything else is NaN. */
const optionalAmount = (text: string | undefined): number => (isEmpty(text) ? 0 : typedAmount(text));
/** What a typed box holds as a number, whatever its unit. NaN when empty or unreadable. */
const typedValue = (field: FieldDef, text: string | undefined): number => (field.type === "pct" ? parseRate(text) : typedAmount(text));

/** What is wrong with what was typed, for the page to name. Each is the first such box in page order, or null. */
export type EntryFaults = {
  /** A box holding something that is not one number. An empty box is not a fault. */
  unreadable: FieldDef | null;
  /** A box holding a negative number. */
  negative: FieldDef | null;
};

/**
 * Finds junk and negative numbers among the eight typed boxes. The model gives no result for
 * either; this says which box to name. Figures outside a limit (a rate of 30% or more, points
 * above 10%) and mortgage insurance without a home value are not looked for here: the limits are
 * exported from `math.ts`.
 */
export function entryFaults(values: Values): EntryFaults {
  const typed = ALL.filter((f) => f.type !== "choice" && !isEmpty(values[f.id]));
  return {
    unreadable: typed.find((f) => Number.isNaN(typedValue(f, values[f.id]))) ?? null,
    negative: typed.find((f) => typedValue(f, values[f.id]) < 0) ?? null,
  };
}

/** Turns what was typed into the model's input. */
export function toInput(values: Values): AprInput {
  const prepaid = typedAmount(values.prepaidInterest);
  return {
    // Empty or unreadable is "not entered" (NaN), which the model turns down.
    loanAmount: typedAmount(values.loanAmount),
    // A rate that is not one number (empty, "." mid-typing, letters) is "not entered". A typed 0 is a real 0%.
    rate: parseRate(values.rate),
    termMonths: parseNumber(values.termYears) * 12,
    // Optional: empty is 0. Something unreadable is NaN, which the model turns down.
    lenderFees: optionalAmount(values.lenderFees),
    points: isEmpty(values.points) ? 0 : parseRate(values.points),
    lenderCredit: optionalAmount(values.lenderCredit),
    monthlyMi: optionalAmount(values.monthlyMi),
    homeValue: optionalAmount(values.homeValue),
    // Empty is NaN, which the model reads as "use the automatic 15 days". Something unreadable must
    // not pass as empty, so it goes in as Infinity, which the model turns down.
    prepaidInterest: isEmpty(values.prepaidInterest) ? Number.NaN : Number.isNaN(prepaid) ? Number.POSITIVE_INFINITY : prepaid,
  };
}
