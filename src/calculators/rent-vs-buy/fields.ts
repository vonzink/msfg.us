import { downPaymentField, parseNumber, parseRate, typedAmount, type FieldDef, type Values } from "../shared/fields";
import type { RentVsBuyInput } from "./math";

/**
 * Inputs of the Rent vs buy calculator. Five are always visible (the down payment has a unit
 * switch beside it); twelve sit behind "Add detail" and are the assumptions behind the estimate.
 * Rent is monthly dollars; closing costs are one total; property tax, insurance and maintenance
 * are yearly dollars; mortgage insurance and HOA dues are monthly dollars. Mortgage insurance, HOA
 * dues and the income tax rate are optional and start empty: empty means none.
 *
 * In the down payment, the closing costs and the three yearly costs a typed 0 is an answer (zero
 * down, no property tax), so those boxes are marked `keepZero` and the shared money box leaves a
 * typed 0 in place.
 */

/** The down payment box in the given unit ("pct" or "usd"). Zero down is an answer. */
export const downPaymentBox = (unit: string): FieldDef => ({ ...downPaymentField(unit), keepZero: true });

export const FRONT_FIELDS: FieldDef[] = [
  { id: "monthlyRent", label: "Monthly rent", type: "money", example: "2,400", hint: "Per month." },
  { id: "homePrice", label: "Home price", type: "money", example: "400,000" },
  downPaymentBox("pct"),
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
  { id: "closingCosts", label: "Closing costs", type: "money", example: "8,000", keepZero: true, hint: "The buyer's costs on the purchase, as one total." },
  { id: "yearlyTax", label: "Property tax", type: "money", example: "4,800", keepZero: true, hint: "Per year." },
  { id: "yearlyInsurance", label: "Homeowners insurance", type: "money", example: "1,800", keepZero: true, hint: "Per year." },
  { id: "monthlyMi", label: "Mortgage insurance", type: "money", example: "", hint: "Per month. Common with less than 20% down." },
  { id: "monthlyHoa", label: "HOA dues", type: "money", example: "", hint: "Per month." },
  { id: "yearlyMaintenance", label: "Maintenance", type: "money", example: "4,000", keepZero: true, hint: "Per year. About 1% of the home price is a common rule of thumb." },
  { id: "appreciation", label: "Home value rises", type: "pct", example: "3", hint: "Per year." },
  { id: "rentIncrease", label: "Rent rises", type: "pct", example: "3", hint: "Per year." },
  { id: "sellingCosts", label: "Selling costs", type: "pct", example: "6", hint: "Of the sale price." },
  { id: "investmentReturn", label: "Return if the down payment were invested", type: "pct", example: "5", hint: "Per year." },
  {
    id: "incomeTaxRate", label: "Income tax rate, to count the interest deduction", type: "pct", example: "",
    hint: "Optional. Leave empty to leave it out. It only applies if you itemize deductions.",
  },
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
 * is nobody's intent. Closing costs, property tax, insurance and maintenance clear to empty, which
 * is "not entered": there is no comparison until all four are typed again, and 0 is an answer.
 */
export const BLANK: Values = Object.fromEntries(
  ALL.map((f) => [f.id, f.type === "choice" || ASSUMPTION_RATES.includes(f.id) ? f.example : ""]),
);

/** Years typed as text, rounded to a whole year. Empty or junk is NaN, meaning "not entered". */
const wholeYears = (text: string | undefined): number => (/\d/.test(text ?? "") ? Math.round(parseNumber(text)) : Number.NaN);

/** An optional box: empty is 0 ("none"). Anything typed must be one number, or it is NaN. */
const isEmpty = (text: string | undefined): boolean => String(text ?? "").trim() === "";
const optionalAmount = (text: string | undefined): number => (isEmpty(text) ? 0 : typedAmount(text));
const optionalRate = (text: string | undefined): number => (isEmpty(text) ? 0 : parseRate(text));

/** Turns what was typed into the model's input. */
export function toInput(values: Values): RentVsBuyInput {
  const n = (id: string) => parseNumber(values[id]);
  const homePrice = n("homePrice");
  const down = typedAmount(values.downPayment);
  return {
    monthlyRent: n("monthlyRent"),
    homePrice,
    // An empty or unreadable down payment is "not entered" (NaN). A typed 0 is zero down.
    downPayment: values.downUnit === "usd" ? down : (homePrice * down) / 100,
    // A rate that is not one number (empty, "." mid-typing, letters) is "not entered yet", which
    // the model rejects. A typed 0 is a real 0%. The same goes for the four assumption rates.
    rate: parseRate(values.rate),
    stayYears: wholeYears(values.stayYears),
    termMonths: n("termYears") * 12,
    // Not entered (NaN) until typed: the model gives no result without all four. 0 is an answer.
    closingCosts: typedAmount(values.closingCosts),
    yearlyTax: typedAmount(values.yearlyTax),
    yearlyInsurance: typedAmount(values.yearlyInsurance),
    yearlyMaintenance: typedAmount(values.yearlyMaintenance),
    // Optional: empty is none. Something unreadable is NaN, which the model turns down.
    monthlyMi: optionalAmount(values.monthlyMi),
    monthlyHoa: optionalAmount(values.monthlyHoa),
    incomeTaxRate: optionalRate(values.incomeTaxRate),
    appreciation: parseRate(values.appreciation),
    rentIncrease: parseRate(values.rentIncrease),
    sellingCosts: parseRate(values.sellingCosts),
    investmentReturn: parseRate(values.investmentReturn),
  };
}
