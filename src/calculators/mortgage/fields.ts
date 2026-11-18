import { parseNumber, parseRate, type FieldDef, type Values } from "../shared/fields";
import type { ExtraFrequency, MortgageInput } from "./math";

/**
 * Inputs of the Mortgage calculator. Six are always visible; four sit behind "Add detail".
 * Property tax and insurance are yearly dollars; HOA dues and mortgage insurance are monthly.
 * Every public calculator uses those same units.
 */

/** The down payment box changes between dollars and percent with the unit switch beside it. */
export function downPaymentField(unit: string): FieldDef {
  return unit === "usd"
    ? { id: "downPayment", label: "Down payment", type: "money", example: "80,000" }
    : { id: "downPayment", label: "Down payment", type: "pct", example: "20" };
}

export const FRONT_FIELDS: FieldDef[] = [
  { id: "homePrice", label: "Home price", type: "money", example: "400,000" },
  downPaymentField("pct"),
  {
    id: "downUnit", label: "Down payment as", type: "choice", example: "pct",
    options: [{ value: "pct", label: "Percent of price" }, { value: "usd", label: "Dollars" }],
  },
  // The example value and the note under this field come from tenant config (see exampleValues).
  { id: "rate", label: "Interest rate", type: "pct", example: "" },
  {
    id: "termYears", label: "Loan term", type: "choice", example: "30",
    options: [10, 15, 20, 25, 30].map((y) => ({ value: String(y), label: `${y} yr` })),
  },
  { id: "yearlyTax", label: "Property tax", type: "money", example: "4,800", hint: "Per year." },
  { id: "yearlyInsurance", label: "Homeowners insurance", type: "money", example: "1,800", hint: "Per year." },
];

export const DETAIL_FIELDS: FieldDef[] = [
  { id: "monthlyHoa", label: "HOA dues", type: "money", example: "", hint: "Per month." },
  { id: "monthlyPmi", label: "Mortgage insurance", type: "money", example: "", hint: "Per month. Common with less than 20% down." },
  { id: "extraAmount", label: "Extra principal", type: "money", example: "", hint: "Paid on top of the regular payment." },
  {
    id: "extraFrequency", label: "Pay the extra", type: "choice", example: "monthly",
    options: [
      { value: "monthly", label: "Every month" },
      { value: "annually", label: "Once a year" },
      { value: "one-time", label: "One time" },
    ],
  },
];

const ALL = [...FRONT_FIELDS, ...DETAIL_FIELDS];

/** The worked example the page opens with, at the tenant's example interest rate (a percent). */
export function exampleValues(exampleRatePct: number): Values {
  return { ...Object.fromEntries(ALL.map((f) => [f.id, f.example])), rate: String(exampleRatePct) };
}

/** Cleared form. Choices keep their setting. */
export const BLANK: Values = Object.fromEntries(ALL.map((f) => [f.id, f.type === "choice" ? f.example : ""]));

/**
 * Changes the down payment unit and converts what is in the box, so 20% of a $400,000 home
 * becomes $80,000 and back. Without a price there is nothing to convert against, so the box clears.
 */
export function switchDownUnit(values: Values, unit: string): Values {
  if (unit === values.downUnit) return values;
  const price = parseNumber(values.homePrice);
  const typed = parseNumber(values.downPayment);
  let downPayment = "";
  if (price > 0 && typed > 0) {
    downPayment =
      unit === "usd"
        ? Math.round((price * typed) / 100).toLocaleString("en-US")
        : String(Math.round((typed / price) * 10000) / 100);
  }
  return { ...values, downUnit: unit, downPayment };
}

const FREQUENCIES: ExtraFrequency[] = ["monthly", "annually", "one-time"];

/** Turns what was typed into the model's input. `start` is the month of the first payment. */
export function toInput(values: Values, start: { month: number; year: number }): MortgageInput {
  const n = (id: string) => parseNumber(values[id]);
  const homePrice = n("homePrice");
  const frequency = values.extraFrequency as ExtraFrequency;
  return {
    homePrice,
    downPayment: values.downUnit === "usd" ? n("downPayment") : (homePrice * n("downPayment")) / 100,
    // A rate that is not one number (empty, "." mid-typing, letters) is "not entered yet", which
    // the model rejects. A typed 0 is a real 0% loan.
    annualRate: parseRate(values.rate),
    termYears: n("termYears"),
    yearlyTax: n("yearlyTax"),
    yearlyInsurance: n("yearlyInsurance"),
    monthlyHoa: n("monthlyHoa"),
    monthlyPmi: n("monthlyPmi"),
    extraAmount: n("extraAmount"),
    extraFrequency: FREQUENCIES.includes(frequency) ? frequency : "monthly",
    startMonth: start.month,
    startYear: start.year,
  };
}
