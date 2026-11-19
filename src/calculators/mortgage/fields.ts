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
 *   - Payment: a whole monthly payment in place of both. Property tax, homeowners insurance, HOA
 *     dues and mortgage insurance sit behind "Add detail" and come off it first, each rounded to
 *     cents as the model rounds it; what is left is the principal and interest, and the loan is
 *     the amount that pays off (`loanAmountForPayment`). So every cost added lowers the loan, and
 *     the first payment of the schedule is the payment typed. A down payment percent of
 *     its own (`paymentDown`, not the purchase boxes, so switching never rewrites a purchase)
 *     gives the home price: the loan divided by one minus the down payment. An empty box is
 *     nothing down. Mortgage insurance then follows the purchase rule on that price: counted only
 *     under 20% down, until 78% of the price or the loan's midpoint. There is no home value in
 *     this mode; one typed in Refinance stays in the form's values and is not read here.
 *
 * Property tax and insurance are yearly dollars; HOA dues and mortgage insurance are monthly.
 * Every public calculator uses those same units. The loan term is a typed whole number of years,
 * 1 to 30, in every mode. The model takes up to 40; the field stops at 30. Clear leaves it at 30.
 *
 * The form's values hold every mode's boxes at once, plus `mode`, so a number typed in one mode is
 * still there on the way back. `toInput` reads only the boxes of the current mode.
 */

export type Mode = "purchase" | "refinance" | "payment";

const isEmpty = (text: string | undefined): boolean => String(text ?? "").trim() === "";

const MODES: Mode[] = ["purchase", "refinance", "payment"];
const modeOf = (values: Values): Mode => (MODES.includes(values.mode as Mode) ? (values.mode as Mode) : "purchase");

/** The switch above the form. Its value lives in the form's values as `mode`. */
export const MODE_FIELD: FieldDef = {
  id: "mode", label: "Calculation type", hideLabel: true, type: "choice", example: "purchase",
  options: [{ value: "purchase", label: "Purchase" }, { value: "refinance", label: "Refinance" }, { value: "payment", label: "Payment" }],
};

/** The loan term the field takes, in whole years. */
export const TERM_YEARS = { min: 1, max: 30 } as const;

/** The payment box takes less than this a month. */
export const PAYMENT_LIMIT = 1_000_000;
/** A payment that pays off less than this is too small to give a result. */
export const MIN_PAYMENT_LOAN = 1000;

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
const PAYMENT: FieldDef = { id: "payment", label: "Monthly payment", type: "money", example: "2,128.97", hint: "The whole monthly payment. Costs under Add detail come off it." };

const HOA: FieldDef = { id: "monthlyHoa", label: "HOA dues", type: "money", example: "", hint: "Per month." };
const PMI: FieldDef = { id: "monthlyPmi", label: "Mortgage insurance", type: "money", example: "", hint: "Per month. Common with less than 20% down." };
const PMI_WITH_VALUE = "Per month. Counted only when the loan is above 80% of the home value.";
const REFINANCE_PMI: FieldDef = {
  id: "monthlyPmi", label: "Mortgage insurance", type: "money", example: "",
  hintFn: (n) => (n.homeValue > 0 ? PMI_WITH_VALUE : n.monthlyPmi > 0 ? "Per month. Not counted without a home value." : "Per month."),
};
/** Payment mode's own down payment: a percent of the home price the page works out. */
const PAYMENT_DOWN: FieldDef = { id: "paymentDown", label: "Down payment", type: "pct", example: "20", hint: "Of the home price." };
/** Under this percent down, mortgage insurance is counted. */
const PMI_BELOW_DOWN = 20;
// With the default 20% down a typed amount is not counted, so the box says so.
const PAYMENT_PMI: FieldDef = {
  id: "monthlyPmi", label: "Mortgage insurance", type: "money", example: "", hint: "Per month.",
  warnFn: (n) => (n.monthlyPmi > 0 && n.paymentDown >= PMI_BELOW_DOWN ? "Not counted with 20% or more down." : null),
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
  payment: [PAYMENT, PAYMENT_DOWN, RATE, TERM],
};
const DETAIL: Record<Mode, FieldDef[]> = {
  purchase: [HOA, PMI, ...EXTRA],
  refinance: [HOA, REFINANCE_PMI, ...EXTRA],
  payment: [TAX, INSURANCE, HOA, PAYMENT_PMI, ...EXTRA],
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

/**
 * Cleared form in a mode. The mode and the other choices keep their setting, and the term stays at
 * its 30 years: it is a typed box, but an empty term is never what a visitor means.
 */
export function blank(mode: Mode): Values {
  return { ...Object.fromEntries(EVERY.map((f) => [f.id, f.type === "choice" || f.id === TERM.id ? f.example : ""])), mode };
}

/** Cleared form in purchase mode. */
export const BLANK: Values = blank("purchase");

/**
 * The worked example a mode opens with, at the tenant's example interest rate (a percent). Every
 * mode's example is the same $320,000 loan: the payment example is that loan's principal and
 * interest at the rate given. Boxes of the other modes are empty, and so is everything behind
 * "Add detail" in payment mode.
 */
export function exampleValues(exampleRatePct: number, mode: Mode = "purchase"): Values {
  return {
    ...blank(mode),
    ...Object.fromEntries((mode === "payment" ? FRONT.payment : fieldsOf(mode)).map((f) => [f.id, f.example])),
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
 * The optional home value box of a refinance. Empty is "none", which is fine.
 * Anything typed has to be an amount above zero: junk and 0 or less are faults, never "none".
 */
function homeValueOf(values: Values): { value: number; problem: "unreadable" | "not-positive" | null } {
  const text = values.homeValue;
  if (isEmpty(text)) return { value: 0, problem: null };
  const value = parseNumber(text);
  if (value > 0) return { value, problem: null };
  return { value: Number.NaN, problem: Number.isNaN(typedAmount(text)) ? "unreadable" : "not-positive" };
}

/** A cost as the model counts it: junk or a negative is nothing, the rest is rounded to cents. */
const cost = (x: number): number => (Number.isFinite(x) && x > 0 ? roundCents(x) : 0);

/**
 * Payment mode's whole payment taken apart: the monthly costs that come off it, rounded exactly as
 * the model rounds them, and the principal and interest left. What is left is cut to the cent
 * below, never rounded up, so the first payment of the schedule cannot exceed the payment typed.
 * Mortgage insurance is a cost only when it counts, which is under 20% down.
 */
function paymentParts(values: Values): { payment: number; costs: number; principalAndInterest: number; monthlyPmi: number } {
  const n = (id: string) => parseNumber(values[id]);
  const payment = n("payment");
  const monthlyPmi = paymentDownOf(values) < PMI_BELOW_DOWN ? cost(n("monthlyPmi")) : 0;
  const costs = roundCents(cost(n("yearlyTax") / 12) + cost(n("yearlyInsurance") / 12) + cost(n("monthlyHoa")) + monthlyPmi);
  return { payment, costs, monthlyPmi, principalAndInterest: Math.floor((payment - costs) * 100 + 1e-6) / 100 };
}

/** The loan a payment-mode payment pays off once its costs are off, or NaN when it is outside what the page takes. */
function paymentLoan(values: Values, annualRate: number, termYears: number): number {
  const { payment, principalAndInterest } = paymentParts(values);
  if (!(payment < PAYMENT_LIMIT)) return Number.NaN;
  const loan = loanAmountForPayment(principalAndInterest, annualRate, termYears);
  return loan !== null && loan >= MIN_PAYMENT_LOAN ? loan : Number.NaN;
}

/** Payment mode's down payment as a percent: 0 when the box is empty, NaN when it is junk or outside 0 to under 100. */
function paymentDownOf(values: Values): number {
  if (isEmpty(values.paymentDown)) return 0;
  const percent = typedAmount(values.paymentDown);
  return percent >= 0 && percent < 100 ? percent : Number.NaN;
}

/** The home price a loan and a down payment percent go with, to the cent at or above, so the loan is never more than its share. */
const priceFor = (loan: number, downPct: number): number => Math.ceil((loan / (1 - downPct / 100)) * 100 - 1e-6) / 100;

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
    const { value } = homeValueOf(values);
    if (value > 0) {
      // The dashboard's refinance: the value is the property value, the rest of it is equity.
      // A value below the loan gives a negative down payment, which the model turns down.
      homePrice = value;
      downPayment = roundCents(value - loan);
    } else {
      // No home value: there is nothing to measure mortgage insurance against, so none is counted.
      // A home value that cannot be read gives no result at all.
      homePrice = Number.isNaN(value) ? value : loan;
      downPayment = 0;
      monthlyPmi = 0;
    }
  } else if (mode === "payment") {
    // The price is worked out from the loan and the down payment percent; with nothing down it is
    // the loan itself. A home value left in the form by Refinance is not read.
    const loan = paymentLoan(values, annualRate, termYears);
    homePrice = priceFor(loan, paymentDownOf(values));
    downPayment = roundCents(homePrice - loan);
    // The purchase rule, decided on the percent typed and not on the cents of the worked-out price.
    monthlyPmi = paymentParts(values).monthlyPmi;
  } else {
    homePrice = n("homePrice");
    downPayment = values.downUnit === "usd" ? n("downPayment") : (homePrice * n("downPayment")) / 100;
  }

  return {
    homePrice,
    downPayment,
    annualRate,
    termYears,
    yearlyTax: n("yearlyTax"),
    yearlyInsurance: n("yearlyInsurance"),
    monthlyHoa: n("monthlyHoa"),
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
 *   - "too-small": a payment that pays off less than `MIN_PAYMENT_LOAN`.
 *   - "costs-too-large": the same, because the costs behind "Add detail" leave too little of it.
 * The home value is optional, so its "unreadable" and "not-positive" may also be cured by emptying it.
 * The payment's "range" is `PAYMENT_LIMIT`, which it has to stay under. Payment mode's down payment
 * is "range" for junk as well: 0 to under 100, and an empty box is 0.
 */
export type InputFault =
  | { field: FieldDef; problem: "empty" | "unreadable" | "not-positive" | "not-below-price" | "below-loan" | "too-small" | "costs-too-large" }
  | { field: FieldDef; problem: "range"; min: number; max: number };

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

/** What is wrong with the optional home value: junk, nothing or less, or a value below the loan. */
function homeValueFault(field: FieldDef, values: Values, input: MortgageInput): InputFault | null {
  const { problem } = homeValueOf(values);
  if (problem) return { field, problem };
  return input.downPayment < 0 ? { field, problem: "below-loan" } : null;
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
    first = amountFault(LOAN_AMOUNT, values) ?? homeValueFault(HOME_VALUE, values, input);
  } else if (mode === "payment") {
    const { payment: typed, costs, principalAndInterest } = paymentParts(values);
    const tooSmall = (): InputFault | null => {
      const loan = principalAndInterest > 0 ? loanAmountForPayment(principalAndInterest, input.annualRate, input.termYears) : 0;
      if (loan === null || loan >= MIN_PAYMENT_LOAN) return null;
      return { field: PAYMENT, problem: costs > 0 ? "costs-too-large" : "too-small" };
    };
    // The loan the payment pays off needs the rate and the term, so its size comes after them.
    return (
      amountFault(PAYMENT, values) ??
      (typed >= PAYMENT_LIMIT ? { field: PAYMENT, problem: "range", min: 0, max: PAYMENT_LIMIT } : null) ??
      (Number.isNaN(paymentDownOf(values)) ? { field: PAYMENT_DOWN, problem: "range", min: 0, max: 100 } : null) ??
      rateFault(values) ?? termFault(values) ?? tooSmall()
    );
  } else {
    first =
      amountFault(HOME_PRICE, values) ??
      (input.downPayment < 0 || input.downPayment >= input.homePrice ? { field: downPaymentField(values.downUnit), problem: "not-below-price" } : null);
  }
  return first ?? rateFault(values) ?? termFault(values);
}

/**
 * What the results and the printout need to know about the mode, beyond the model's own figures.
 *   - A refinance without a home value hands the model a price equal to the loan, so its
 *     loan-to-value reads 100. `homeValueKnown` says whether that figure means anything.
 *   - Payment mode's headline quotes the payment as typed, the principal and interest left once
 *     the costs are off it, the rate, the term, the down payment and the worked-out price.
 */
export type Scenario =
  | { mode: "purchase" }
  | { mode: "refinance"; homeValueKnown: boolean }
  | { mode: "payment"; payment: number; principalAndInterest: number; annualRate: number; termYears: number; downPct: number; homePrice: number };

export function scenarioOf(values: Values): Scenario {
  const mode = modeOf(values);
  if (mode === "refinance") return { mode, homeValueKnown: parseNumber(values.homeValue) > 0 };
  if (mode === "payment") {
    return {
      mode, payment: parseNumber(values.payment), principalAndInterest: paymentParts(values).principalAndInterest, annualRate: parseRate(values.rate), termYears: termOf(values),
      downPct: paymentDownOf(values), homePrice: toInput(values, { month: 0, year: 0 }).homePrice,
    };
  }
  return { mode };
}

/** The purchase boxes as a loan, when they make one. */
function purchaseLoan(values: Values): { price: number; loan: number } | null {
  const { homePrice, downPayment } = toInput({ ...values, mode: "purchase" }, { month: 0, year: 0 });
  return homePrice > 0 && downPayment >= 0 && downPayment < homePrice ? { price: homePrice, loan: roundCents(homePrice - downPayment) } : null;
}

/** The share of the price or home value that is not borrowed in the mode being left, 0 to under 1, or null when there is none to give. */
function downShare(values: Values, from: Mode): number | null {
  if (from === "purchase") {
    const purchase = purchaseLoan(values);
    return purchase ? (purchase.price - purchase.loan) / purchase.price : null;
  }
  const loan = parseNumber(values.loanAmount);
  const value = parseNumber(values.homeValue);
  return from === "refinance" && loan > 0 && value >= loan ? (value - loan) / value : null;
}

/**
 * Changes the mode and keeps what carries over: the rate, the term, tax, insurance and the detail
 * fields stay as typed, and so do the boxes of the mode being left, for the way back.
 *
 *   - Into Refinance from Purchase: while the loan amount and home value are both empty, the loan
 *     amount is filled with price minus down payment and the home value with the price, as the
 *     dashboard does on the first switch. Numbers already there are kept.
 *   - Into Refinance from Payment: an empty loan amount is filled with the loan the payment pays
 *     off, and with it an empty home value with the purchase price, when the purchase boxes hold
 *     one that covers that loan, otherwise with the price payment mode worked out from a down payment.
 *   - Into Payment: an empty payment box is filled with the current loan's whole first payment:
 *     principal and interest plus the tax, insurance, HOA dues and mortgage insurance that carry over.
 *     A payment already there is kept, like the other modes' boxes; without a loan the box stays empty.
 *     Its down payment box, while empty or on its default 20, takes the purchase's down payment as
 *     a percent to two decimals (from Refinance, the equity in the home value, when there is one).
 *   - Into Purchase from Payment: while the price and down payment are both empty, the price is
 *     filled with the worked-out price and the down payment with the percent.
 *   - Into Purchase from Refinance: while the price and down payment are both empty and there is a
 *     home value, the price is filled with it and the down payment with the equity, in the unit
 *     the visitor had: as a percent when a percent to two decimals says exactly that amount,
 *     otherwise in dollars.
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
    // The down payment comes along as a percent while the box is empty or still on its default.
    if (isEmpty(values.paymentDown) || values.paymentDown === PAYMENT_DOWN.example) {
      const share = downShare(values, from);
      if (share !== null) next.paymentDown = String(Math.round(share * 10000) / 100);
    }
    // The whole payment: the loan's principal and interest plus the costs as payment mode will
    // take them off again, so the loan it shows is the loan just on screen.
    if (result && isEmpty(values.payment)) next.payment = money(roundCents(result.monthlyPI + paymentParts(next).costs));
  } else if (mode === "refinance") {
    if (from === "purchase" && isEmpty(values.loanAmount) && isEmpty(values.homeValue)) {
      const purchase = purchaseLoan(values);
      if (purchase) {
        next.loanAmount = money(purchase.loan);
        next.homeValue = money(purchase.price);
      }
    } else if (from === "payment" && isEmpty(values.loanAmount) && result) {
      next.loanAmount = money(result.loanAmount);
      const purchase = purchaseLoan(values);
      const { homePrice } = toInput(values, { month: 0, year: 0 });
      if (isEmpty(values.homeValue)) {
        if (purchase && purchase.price >= result.loanAmount) next.homeValue = money(purchase.price);
        else if (homePrice > result.loanAmount) next.homeValue = money(homePrice);
      }
    }
  } else if (from === "payment" && isEmpty(values.homePrice) && isEmpty(values.downPayment)) {
    if (result) {
      const downPct = paymentDownOf(values);
      next.homePrice = money(toInput(values, { month: 0, year: 0 }).homePrice);
      next.downUnit = "pct";
      next.downPayment = downPct > 0 ? String(downPct) : "";
    }
  } else if (from === "refinance" && isEmpty(values.homePrice) && isEmpty(values.downPayment)) {
    const loan = parseNumber(values.loanAmount);
    const value = parseNumber(values.homeValue);
    if (value > 0 && loan > 0 && loan <= value) {
      const equity = roundCents(value - loan);
      const percent = Math.round((equity / value) * 10000) / 100;
      const asPercent = values.downUnit !== "usd" && roundCents((value * percent) / 100) === equity;
      next.homePrice = money(value);
      next.downUnit = asPercent ? "pct" : "usd";
      next.downPayment = equity > 0 ? (asPercent ? String(percent) : money(equity)) : "";
    }
  }
  return next;
}
