import { downPaymentField, parseNumber, parseRate, type FieldDef, type Values } from "../shared/fields";
import type { RentVsBuyInput } from "./math";

/**
 * Inputs of the Rent vs buy calculator. Five are always visible (the down payment has a unit
 * switch beside it); eight sit behind "Add detail" and are the assumptions behind the estimate.
 * Rent is monthly dollars; property tax, insurance and maintenance are yearly dollars.
 */
export const FRONT_FIELDS: FieldDef[] = [
  { id: "monthlyRent", label: "Monthly rent", type: "money", example: "2,400", hint: "Per month." },
  { id: "homePrice", label: "Home price", type: "money", example: "400,000" },
  downPaymentField("pct"),
  {
    id: "downUnit", label: "Down payment as", type: "choice", example: "pct",
    options: [{ value: "pct", label: "Percent of price" }, { value: "usd", label: "Dollars" }],
  },
  // The example value and the note under this field come from tenant config (see exampleValues).
  { id: "rate", label: "Interest rate", type: "pct", example: "" },
  { id: "stayYears", label: "Years you plan to stay", type: "num", example: "7", suffix: "yr" },
];

export const DETAIL_FIELDS: FieldDef[] = [
  {
    id: "termYears", label: "Loan term", type: "choice", example: "30",
    options: [10, 15, 20, 25, 30].map((y) => ({ value: String(y), label: `${y} yr` })),
  },
  { id: "yearlyTax", label: "Property tax", type: "money", example: "4,800", hint: "Per year." },
  { id: "yearlyInsurance", label: "Homeowners insurance", type: "money", example: "1,800", hint: "Per year." },
  { id: "yearlyMaintenance", label: "Maintenance", type: "money", example: "4,000", hint: "Per year. About 1% of the home price is a common rule of thumb." },
  { id: "appreciation", label: "Home value rises", type: "pct", example: "3", hint: "Per year." },
  { id: "rentIncrease", label: "Rent rises", type: "pct", example: "3", hint: "Per year." },
  { id: "sellingCosts", label: "Selling costs", type: "pct", example: "6", hint: "Of the sale price." },
  { id: "investmentReturn", label: "Return if the down payment were invested", type: "pct", example: "5", hint: "Per year." },
];

const ALL = [...FRONT_FIELDS, ...DETAIL_FIELDS];
/** The four rates the comparison cannot run without. Clear puts them back to where they started. */
const ASSUMPTION_RATES = ["appreciation", "rentIncrease", "sellingCosts", "investmentReturn"];

/** The worked example the page opens with, at the tenant's example interest rate (a percent). */
export function exampleValues(exampleRatePct: number): Values {
  return { ...Object.fromEntries(ALL.map((f) => [f.id, f.example])), rate: String(exampleRatePct) };
}

/**
 * Cleared form. Typed amounts are empty and choices go back to their default. The four assumption
 * rates go back to their starting values instead of emptying: a comparison at 0% across the board
 * is nobody's intent. Property tax, insurance and maintenance clear to empty and count as $0.
 */
export const BLANK: Values = Object.fromEntries(
  ALL.map((f) => [f.id, f.type === "choice" || ASSUMPTION_RATES.includes(f.id) ? f.example : ""]),
);

/** Years typed as text, rounded to a whole year. Empty or junk is NaN, meaning "not entered". */
const wholeYears = (text: string | undefined): number => (/\d/.test(text ?? "") ? Math.round(parseNumber(text)) : Number.NaN);

/** Turns what was typed into the model's input. */
export function toInput(values: Values): RentVsBuyInput {
  const n = (id: string) => parseNumber(values[id]);
  const homePrice = n("homePrice");
  return {
    monthlyRent: n("monthlyRent"),
    homePrice,
    downPayment: values.downUnit === "usd" ? n("downPayment") : (homePrice * n("downPayment")) / 100,
    // A rate that is not one number (empty, "." mid-typing, letters) is "not entered yet", which
    // the model rejects. A typed 0 is a real 0%. The same goes for the four assumption rates.
    rate: parseRate(values.rate),
    stayYears: wholeYears(values.stayYears),
    termMonths: n("termYears") * 12,
    yearlyTax: n("yearlyTax"),
    yearlyInsurance: n("yearlyInsurance"),
    yearlyMaintenance: n("yearlyMaintenance"),
    appreciation: parseRate(values.appreciation),
    rentIncrease: parseRate(values.rentIncrease),
    sellingCosts: parseRate(values.sellingCosts),
    investmentReturn: parseRate(values.investmentReturn),
  };
}
