import { parseNumber, parseRate, type FieldDef, type Values } from "../shared/fields";
import type { BreakevenInput } from "./math";

/**
 * Inputs of the Refinance breakeven calculator. Six are always visible; six sit behind
 * "Add detail". The dashboard's version has 51: its itemized fees, cost-of-waiting scenario and
 * loan-type rules are left out here on purpose.
 */
export const FRONT_FIELDS: FieldDef[] = [
  { id: "currentBalance", label: "Loan balance", type: "money", example: "300,000", hint: "What you still owe." },
  // Example value is set from tenant config in exampleValues: one point above the example new rate.
  { id: "currentRate", label: "Current interest rate", type: "pct", example: "" },
  { id: "yearsLeft", label: "Years left", type: "num", example: "27", suffix: "yr", hint: "On the loan you have now." },
  // The example value and the note under this field come from tenant config (see exampleValues).
  { id: "newRate", label: "New interest rate", type: "pct", example: "" },
  {
    id: "newTermYears", label: "New loan term", type: "choice", example: "30",
    options: [10, 15, 20, 25, 30].map((y) => ({ value: String(y), label: `${y} yr` })),
  },
  { id: "closingCosts", label: "Closing costs", type: "money", example: "6,000", hint: "The total on the quote for the new loan." },
];

export const DETAIL_FIELDS: FieldDef[] = [
  { id: "newLoanAmount", label: "New loan amount", type: "money", example: "", hint: "Leave empty to use the balance plus any cash out. Enter the full amount if closing costs are added to the loan." },
  { id: "cashOut", label: "Cash out", type: "money", example: "", hint: "Extra money borrowed on top of the balance." },
  { id: "debtPaymentsPaidOff", label: "Debt payments paid off", type: "money", example: "", hint: "Per month, on other debts the cash out pays off. Counted only when the new loan is larger than the balance." },
  { id: "currentMi", label: "Mortgage insurance now", type: "money", example: "", hint: "Per month." },
  { id: "newMi", label: "Mortgage insurance on the new loan", type: "money", example: "", hint: "Per month." },
  { id: "keepYears", label: "Years you plan to keep the loan", type: "num", example: "", suffix: "yr", hint: "Shows the net savings and what you would still owe on each loan by then." },
];

const ALL = [...FRONT_FIELDS, ...DETAIL_FIELDS];

/**
 * The worked example the page opens with. The new rate is the tenant's example interest rate (a
 * percent) and the current rate is one point above it, so the example always shows a rate drop.
 */
export function exampleValues(exampleRatePct: number): Values {
  return {
    ...Object.fromEntries(ALL.map((f) => [f.id, f.example])),
    newRate: String(exampleRatePct),
    currentRate: String(Number((exampleRatePct + 1).toFixed(3))),
  };
}

/** Cleared form. The term choice goes back to its default. */
export const BLANK: Values = Object.fromEntries(ALL.map((f) => [f.id, f.type === "choice" ? f.example : ""]));

/** Years typed as text, as whole months. Empty or junk is NaN, meaning "not given". */
const months = (text: string | undefined): number => {
  const years = parseNumber(text);
  return /\d/.test(text ?? "") && years > 0 ? Math.round(years * 12) : Number.NaN;
};

/** Turns what was typed into the model's input. */
export function toInput(values: Values): BreakevenInput {
  const n = (id: string) => parseNumber(values[id]);
  return {
    currentBalance: n("currentBalance"),
    currentRate: parseRate(values.currentRate),
    monthsLeft: months(values.yearsLeft),
    newRate: parseRate(values.newRate),
    newTermMonths: months(values.newTermYears),
    closingCosts: n("closingCosts"),
    newLoanAmount: n("newLoanAmount") > 0 ? n("newLoanAmount") : Number.NaN,
    cashOut: n("cashOut"),
    debtPaymentsPaidOff: n("debtPaymentsPaidOff"),
    currentMi: n("currentMi"),
    newMi: n("newMi"),
    keepMonths: months(values.keepYears),
  };
}
