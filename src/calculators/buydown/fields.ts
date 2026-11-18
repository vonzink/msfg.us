import { parseNumber, type FieldDef, type Values } from "../shared/fields";
import { REDUCTIONS, type BuydownInput, type BuydownType } from "./math";

/**
 * Inputs of the Rate buydown calculator. Four are always visible; three sit behind "Add detail".
 * The three do not change what a buydown costs: they only turn each payment into a full housing
 * payment. Units match every public calculator: tax and insurance per year, HOA per month.
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
    id: "buydownType", label: "Buydown type", type: "choice", example: "2-1",
    options: (Object.keys(REDUCTIONS) as BuydownType[]).map((t) => ({ value: t, label: t })),
    hint: "The numbers are how many percentage points the rate drops in each of the first years.",
  },
];

export const DETAIL_FIELDS: FieldDef[] = [
  { id: "yearlyTax", label: "Property tax", type: "money", example: "", hint: "Per year." },
  { id: "yearlyInsurance", label: "Homeowners insurance", type: "money", example: "", hint: "Per year." },
  { id: "monthlyHoa", label: "HOA dues", type: "money", example: "", hint: "Per month." },
];

const ALL = [...FRONT_FIELDS, ...DETAIL_FIELDS];

/** The worked example the page opens with, at the tenant's example interest rate (a percent). */
export function exampleValues(exampleRatePct: number): Values {
  return { ...Object.fromEntries(ALL.map((f) => [f.id, f.example])), rate: String(exampleRatePct) };
}

/** Cleared form. Choices go back to their defaults. */
export const BLANK: Values = Object.fromEntries(ALL.map((f) => [f.id, f.type === "choice" ? f.example : ""]));

/** Turns what was typed into the model's input. */
export function toInput(values: Values): BuydownInput {
  const n = (id: string) => parseNumber(values[id]);
  return {
    loanAmount: n("loanAmount"),
    // A rate with no digit in it is "not entered yet", which the model rejects.
    annualRate: /\d/.test(values.rate ?? "") ? n("rate") / 100 : Number.NaN,
    termYears: n("termYears"),
    type: values.buydownType in REDUCTIONS ? (values.buydownType as BuydownType) : "2-1",
    yearlyTax: n("yearlyTax"),
    yearlyInsurance: n("yearlyInsurance"),
    monthlyHoa: n("monthlyHoa"),
  };
}
