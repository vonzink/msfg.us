import { monthlyPayment, roundCents } from "@/lib/finance";
import { downPaymentField, parseNumber, parseRate, typedAmount, type FieldDef, type Values } from "../shared/fields";
import { calculateMortgage, loanAmountForPayment, RATE_LIMIT, type ExtraFrequency, type MortgageInput } from "./math";

/**
 * Inputs of the Mortgage calculator, in three modes that fill in the same model.
 *
 *   - Purchase: home price and down payment. Six inputs are always visible; four sit behind
 *     "Add detail". The down payment box and its unit switch come from the shared kit.
 *   - Refinance: loan amount and home value in place of price and down payment. The home value is
 *     only used for mortgage insurance and may be left empty; mortgage insurance typed without one
 *     is not counted, and its hint says so. A home value below the loan gives no result.
 *   - Payment: a monthly principal and interest payment in place of both. The loan is the amount
 *     that payment pays off (`loanAmountForPayment`). Property tax, homeowners insurance, HOA dues
 *     and mortgage insurance are not shown and not counted, whatever another mode left in them.
 *
 * Property tax and insurance are yearly dollars; HOA dues and mortgage insurance are monthly.
 * Every public calculator uses those same units. The loan term is a typed whole number of years,
 * 1 to 30, in every mode. The model takes up to 40; the field stops at 30.
 *
 * The form's values hold every mode's boxes at once, plus `mode`, so a number typed in one mode is
 * still there on the way back. `toInput` reads only the boxes of the current mode.
 */

export type Mode = "purchase" | "refinance" | "payment";

const MODES: Mode[] = ["purchase", "refinance", "payment"];
const modeOf = (values: Values): Mode => (MODES.includes(values.mode as Mode) ? (values.mode as Mode) : "purchase");

/** The switch above the form. Its value lives in the form's values as `mode`. */
export const MODE_FIELD: FieldDef = {
  id: "mode", label: "I want to work out", type: "choice", example: "purchase",
  options: [{ value: "purchase", label: "Purchase" }, { value: "refinance", label: "Refinance" }, { value: "payment", label: "Payment" }],
};

/** The loan term the field takes, in whole years. */
export const TERM_YEARS = { min: 1, max: 30 } as const;

/** The loan every mode's example works out to. */
const EXAMPLE_LOAN = 320000;

// The example value and the note under this field come from tenant config (see exampleValues).
const RATE: FieldDef = { id: "rate", label: "Interest rate", type: "pct", example: "" };
const TERM: FieldDef = {
  id: "termYears", label: "Loan term", type: "num", suffix: "yr", example: "30",
  slider: { min: TERM_YEARS.min, max: TERM_YEARS.max, step: 1 },
};
const TAX: FieldDef = { id: "yearlyTax", label: "Property tax", type: "money", example: "4,800", hint: "Per year." };
const INSURANCE: FieldDef = { id: "yearlyInsurance", label: "Homeowners insurance", type: "money", example: "1,800", hint: "Per year." };
const DOWN_UNIT: FieldDef = {
  id: "downUnit", label: "Down payment as", type: "choice", example: "pct",
  options: [{ value: "pct", label: "Percent of price" }, { value: "usd", label: "Dollars" }],
};
const HOME_PRICE: FieldDef = { id: "homePrice", label: "Home price", type: "money", example: "400,000" };
const LOAN_AMOUNT: FieldDef = { id: "loanAmount", label: "Loan amount", type: "money", example: "320,000" };
const HOME_VALUE: FieldDef = { id: "homeValue", label: "Home value", type: "money", example: "400,000" };
// The example shown here is for a 7% rate; exampleValues works it out at the tenant's rate.
const PAYMENT: FieldDef = { id: "payment", label: "Monthly payment", type: "money", example: "2,128.97", hint: "Principal and interest only." };

const HOA: FieldDef = { id: "monthlyHoa", label: "HOA dues", type: "money", example: "", hint: "Per month." };
const PMI: FieldDef = { id: "monthlyPmi", label: "Mortgage insurance", type: "money", example: "", hint: "Per month. Common with less than 20% down." };
const REFINANCE_PMI: FieldDef = {
  id: "monthlyPmi", label: "Mortgage insurance", type: "money", example: "",
  hintFn: (n) => (n.monthlyPmi > 0 && !(n.homeValue > 0) ? "Per month. Not counted without a home value." : "Per month."),
};
const EXTRA: FieldDef[] = [
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

const FRONT: Record<Mode, FieldDef[]> = {
  purchase: [HOME_PRICE, downPaymentField("pct"), DOWN_UNIT, RATE, TERM, TAX, INSURANCE],
  refinance: [LOAN_AMOUNT, HOME_VALUE, RATE, TERM, TAX, INSURANCE],
  payment: [PAYMENT, RATE, TERM],
};
const DETAIL: Record<Mode, FieldDef[]> = {
  purchase: [HOA, PMI, ...EXTRA],
  refinance: [HOA, REFINANCE_PMI, ...EXTRA],
  payment: EXTRA,
};

/** The inputs always visible in a mode, in page order. */
export const frontFields = (mode: Mode): FieldDef[] => FRONT[mode];
/** The inputs behind "Add detail" in a mode. */
export const detailFields = (mode: Mode): FieldDef[] => DETAIL[mode];

/** Purchase mode's fields, under the names every calculator's folder uses. */
export const FRONT_FIELDS: FieldDef[] = FRONT.purchase;
export const DETAIL_FIELDS: FieldDef[] = DETAIL.purchase;

const fieldsOf = (mode: Mode): FieldDef[] => [...FRONT[mode], ...DETAIL[mode]];
/** Every box of every mode, once. */
const EVERY: FieldDef[] = [...new Map(MODES.flatMap(fieldsOf).map((f) => [f.id, f])).values()];

/** What a money box shows for an amount, as it would after focus leaves it. */
const money = (x: number): string => x.toLocaleString("en-US", { maximumFractionDigits: 2 });

/** Cleared form in a mode. The mode and the other choices keep their setting. */
export function blank(mode: Mode): Values {
  return { ...Object.fromEntries(EVERY.map((f) => [f.id, f.type === "choice" ? f.example : ""])), mode };
}

/** Cleared form in purchase mode. */
export const BLANK: Values = blank("purchase");

/**
 * The worked example a mode opens with, at the tenant's example interest rate (a percent). Every
 * mode's example is the same $320,000 loan: the payment example is that loan's principal and
 * interest at the rate given. Boxes of the other modes are empty.
 */
export function exampleValues(exampleRatePct: number, mode: Mode = "purchase"): Values {
  return {
    ...blank(mode),
    ...Object.fromEntries(fieldsOf(mode).map((f) => [f.id, f.example])),
    ...(mode === "payment" ? { payment: money(roundCents(monthlyPayment(EXAMPLE_LOAN, exampleRatePct, 360))) } : {}),
    rate: String(exampleRatePct),
  };
}

const FREQUENCIES: ExtraFrequency[] = ["monthly", "annually", "one-time"];

/** The typed term when it is a whole number of years the field takes, otherwise NaN. */
function termOf(values: Values): number {
  const years = typedAmount(values.termYears);
  return Number.isInteger(years) && years >= TERM_YEARS.min && years <= TERM_YEARS.max ? years : Number.NaN;
}

/**
 * Turns what was typed into the model's input. `start` is the month of the first payment.
 * When something needed is missing or out of range the input is one the model turns down;
 * `inputFault` says which box to name.
 */
export function toInput(values: Values, start: { month: number; year: number }): MortgageInput {
  const n = (id: string) => parseNumber(values[id]);
  const mode = modeOf(values);
  const frequency = values.extraFrequency as ExtraFrequency;
  // A rate that is not one number (empty, "." mid-typing, letters) is "not entered yet", which
  // the model rejects. A typed 0 is a real 0% loan.
  const annualRate = parseRate(values.rate);
  const termYears = termOf(values);

  let homePrice: number;
  let downPayment: number;
  let monthlyPmi = n("monthlyPmi");
  if (mode === "refinance") {
    const loan = n("loanAmount");
    const value = n("homeValue");
    if (value > 0) {
      // The dashboard's refinance: the value is the property value, the rest of it is equity.
      // A value below the loan gives a negative down payment, which the model turns down.
      homePrice = value;
      downPayment = roundCents(value - loan);
    } else {
      // No home value: there is nothing to measure mortgage insurance against, so none is counted.
      homePrice = loan;
      downPayment = 0;
      monthlyPmi = 0;
    }
  } else if (mode === "payment") {
    homePrice = loanAmountForPayment(n("payment"), annualRate, termYears) ?? Number.NaN;
    downPayment = 0;
    monthlyPmi = 0;
  } else {
    homePrice = n("homePrice");
    downPayment = values.downUnit === "usd" ? n("downPayment") : (homePrice * n("downPayment")) / 100;
  }

  const payment = mode === "payment";
  return {
    homePrice,
    downPayment,
    annualRate,
    termYears,
    yearlyTax: payment ? 0 : n("yearlyTax"),
    yearlyInsurance: payment ? 0 : n("yearlyInsurance"),
    monthlyHoa: payment ? 0 : n("monthlyHoa"),
    monthlyPmi,
    extraAmount: n("extraAmount"),
    extraFrequency: FREQUENCIES.includes(frequency) ? frequency : "monthly",
    startMonth: start.month,
    startYear: start.year,
  };
}

/**
 * What stops the current mode from giving a result, for the page's prompt to name: the box and
 * what is wrong with it.
 *   - "empty": nothing typed in a box that is needed.
 *   - "unreadable": something typed that is not a number.
 *   - "not-positive": an amount that has to be above zero.
 *   - "range": outside `min` to `max`, in the box's own unit (the rate in percent, the term in
 *     whole years; a term that is not a whole number is out of range too).
 *   - "not-below-price": a down payment that is negative, or not smaller than the home price.
 *   - "below-loan": a home value smaller than the loan amount.
 */
export type InputFault =
  | { field: FieldDef; problem: "empty" | "unreadable" | "not-positive" | "not-below-price" | "below-loan" }
  | { field: FieldDef; problem: "range"; min: number; max: number };

const isEmpty = (text: string | undefined): boolean => String(text ?? "").trim() === "";

/** A money box that has to hold an amount above zero, read the way `toInput` reads it. */
function amountFault(field: FieldDef, values: Values): InputFault | null {
  const text = values[field.id];
  if (isEmpty(text)) return { field, problem: "empty" };
  if (parseNumber(text) > 0) return null;
  return { field, problem: Number.isNaN(typedAmount(text)) ? "unreadable" : "not-positive" };
}

function rateFault(values: Values): InputFault | null {
  if (isEmpty(values.rate)) return { field: RATE, problem: "empty" };
  const rate = parseRate(values.rate);
  if (Number.isNaN(rate)) return { field: RATE, problem: "unreadable" };
  if (rate < RATE_LIMIT.low || rate > RATE_LIMIT.high) return { field: RATE, problem: "range", min: RATE_LIMIT.low * 100, max: RATE_LIMIT.high * 100 };
  return null;
}

function termFault(values: Values): InputFault | null {
  if (isEmpty(values.termYears)) return { field: TERM, problem: "empty" };
  if (Number.isNaN(typedAmount(values.termYears))) return { field: TERM, problem: "unreadable" };
  if (Number.isNaN(termOf(values))) return { field: TERM, problem: "range", min: TERM_YEARS.min, max: TERM_YEARS.max };
  return null;
}

/**
 * The first box, in page order, that keeps the current mode from giving a result, or null. It
 * reads the boxes exactly as `toInput` does. null is not a promise of a result: an input the
 * model turns down for a reason not listed in `InputFault` still gives none.
 */
export function inputFault(values: Values): InputFault | null {
  const mode = modeOf(values);
  const input = toInput(values, { month: 0, year: 0 });
  let first: InputFault | null;
  if (mode === "refinance") {
    first = amountFault(LOAN_AMOUNT, values) ?? (input.downPayment < 0 ? { field: HOME_VALUE, problem: "below-loan" } : null);
  } else if (mode === "payment") {
    first = amountFault(PAYMENT, values);
  } else {
    first =
      amountFault(HOME_PRICE, values) ??
      (input.downPayment < 0 || input.downPayment >= input.homePrice ? { field: downPaymentField(values.downUnit), problem: "not-below-price" } : null);
  }
  return first ?? rateFault(values) ?? termFault(values);
}

/** The purchase boxes as a loan, when they make one. */
function purchaseLoan(values: Values): { price: number; loan: number } | null {
  const { homePrice, downPayment } = toInput({ ...values, mode: "purchase" }, { month: 0, year: 0 });
  return homePrice > 0 && downPayment >= 0 && downPayment < homePrice ? { price: homePrice, loan: roundCents(homePrice - downPayment) } : null;
}

/**
 * Changes the mode and keeps what carries over: the rate, the term, tax, insurance and the detail
 * fields stay as typed, and so do the boxes of the mode being left, for the way back.
 *
 *   - Into Refinance from Purchase: while the loan amount and home value are both empty, the loan
 *     amount is filled with price minus down payment and the home value with the price, as the
 *     dashboard does on the first switch. Numbers already there are kept.
 *   - Into Refinance from Payment: an empty loan amount is filled with the loan the payment pays off.
 *   - Into Payment: the payment is filled with the current loan's principal and interest. Without
 *     a loan the box keeps what it held.
 *   - Into Purchase from Refinance: while the price and down payment are both empty and there is a
 *     home value, the price is filled with it and the down payment, in dollars, with the equity.
 *   - A form still holding its mode's untouched example becomes the new mode's example.
 */
export function switchMode(values: Values, mode: Mode, exampleRatePct: number): Values {
  const from = modeOf(values);
  if (mode === from) return values;

  const example = exampleValues(exampleRatePct, from);
  if (Object.keys(example).every((id) => (values[id] ?? "") === example[id])) return exampleValues(exampleRatePct, mode);

  const next: Values = { ...values, mode };
  const result = calculateMortgage(toInput(values, { month: 0, year: 0 }));

  if (mode === "payment") {
    if (result) next.payment = money(result.monthlyPI);
  } else if (mode === "refinance") {
    if (from === "purchase" && isEmpty(values.loanAmount) && isEmpty(values.homeValue)) {
      const purchase = purchaseLoan(values);
      if (purchase) {
        next.loanAmount = money(purchase.loan);
        next.homeValue = money(purchase.price);
      }
    } else if (from === "payment" && isEmpty(values.loanAmount) && result) {
      next.loanAmount = money(result.loanAmount);
    }
  } else if (from === "refinance" && isEmpty(values.homePrice) && isEmpty(values.downPayment)) {
    const loan = parseNumber(values.loanAmount);
    const value = parseNumber(values.homeValue);
    if (value > 0 && loan > 0 && loan <= value) {
      next.homePrice = money(value);
      next.downUnit = "usd";
      next.downPayment = value > loan ? money(roundCents(value - loan)) : "";
    }
  }
  return next;
}
