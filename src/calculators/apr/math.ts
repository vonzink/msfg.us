/**
 * Model for the APR calculator. Pure functions, no DOM.
 * Ported from msfg-calc `public/js/calculators/apr.js`: autoCalcPrepaidInterest(),
 * monthsToLtvThreshold(), buildPaymentStream(), pvStream(), solveApr() and the sums in
 * classifyFees() and calculate(), for a conventional loan. `golden.json` holds cases recorded from
 * that page's own code by `scripts/calculators/golden-apr.mjs` and `math.test.ts` requires this
 * file to reproduce them to the cent and to three decimals of a percent. Keep the two in step and
 * say so when one changes.
 *
 * What is worked out, in the dashboard's order
 *   - Prepaid interest: the amount entered, or when none is entered 15 days of interest,
 *     `loanAmount x rate x 15 / 365`, to the cent.
 *   - Points in dollars: `loanAmount x points`, to the cent.
 *   - Fees counted: `points in dollars + max(0, lenderFees + prepaidInterest - lenderCredit)`,
 *     each of them in whole cents.
 *   - Amount financed: `loanAmount - fees counted`.
 *   - Monthly principal and interest on the loan amount at the interest rate.
 *   - Payments that carry mortgage insurance: the number of payments until the scheduled balance
 *     first reaches 78% of the home value; none when the loan starts at or under it.
 *   - The payments: principal and interest every month, plus the mortgage insurance for those
 *     months. Their sum is the total of payments.
 *   - Finance charge: `total of payments - amount financed`.
 *   - APR: the yearly rate, compounded monthly, at which those payments are worth the amount
 *     financed today. Found by halving a range that ends at 100% a hundred times, as the
 *     dashboard does.
 *
 * Conventions
 *   - Rates are decimals (0.07 = 7%), points too (0.01 = one point). The term is months.
 *   - Each fee line is rounded to cents first and the total is the sum of the rounded lines, so
 *     the lines a visitor sees add up to the total, and the amount financed is the loan amount
 *     less that total. The APR and the spread are not rounded; the page shows three decimals.
 *   - What NaN stands for is decided at the field boundary (`toInput` in fields.ts). Here NaN in
 *     prepaid interest means "use the automatic 15 days". NaN anywhere else gives no result, so a
 *     figure is never shown with a cost silently left out.
 *
 * Decisions that differ from, or narrow, the dashboard (numbered as in the plan)
 *   1. Lender fees are one total and all of it is counted in the APR. The dashboard decides fee
 *      by fee through a catalog; the golden cases type the total into its origination fee, which
 *      the catalog counts. Third-party costs that are not finance charges (appraisal, title,
 *      recording) are not to be entered.
 *   2. A lender credit comes off the lender fees and prepaid interest, never below zero, and does
 *      not come off points. This is the dashboard's rule.
 *   3. Mortgage insurance needs a home value. With no property value the dashboard charges the
 *      insurance for the whole term; here there is no result until the home value is entered.
 *   4. No finance charge beyond the interest means an APR equal to the interest rate. When the
 *      fees counted are zero and no payment carries mortgage insurance, the APR returned is the
 *      rate itself and the solver is not run. The dashboard runs it, stops a hair under the rate
 *      and shows a spread of "-0.000%". For the same reason a solved APR is never returned below
 *      the rate.
 *   6. Left out: seller credits and seller-paid fees, FHA and VA loans (up-front and annual
 *      premiums, the funding fee), the fee catalog with its per-fee switches, and the credit-score
 *      matrix the dashboard fills mortgage insurance from. Mortgage insurance is the monthly
 *      amount entered. The loan is a conventional fixed-rate loan with level payments.
 *
 * Also not modelled, as on the dashboard
 *   - Odd first periods and the Regulation Z tolerances. This is an estimate; the official APR is
 *     the one on the Loan Estimate.
 *
 * More differences from the dashboard
 *   - The solver's range ends at 100%, so on the dashboard an APR above that comes back as 100%.
 *     Here a solved APR at that ceiling gives no result: the fees are too large for the loan
 *     amount, and 100% would be a made-up figure.
 *   - The solver's range starts at 0. The dashboard's starts at 0.01%, so a 0% loan with small
 *     fees never reads below 0.010% there. Here 50,000 at 0% with 50 of fees is 0.007%.
 *   - The dashboard keeps the points and the sums unrounded and rounds each displayed amount on
 *     its own, so its lines can miss its total by a cent. Here the lines are rounded first (see
 *     Conventions). The amount financed can differ from the dashboard's by under a cent.
 *   - A loan amount under 1,000 gives no result.
 */
import { monthlyPayment, roundCents } from "@/lib/finance";

export const PREPAID_INTEREST_DAYS = 15;
/** Mortgage insurance ends when the scheduled balance reaches this share of the home value. */
export const MI_END_LTV = 0.78;
/** The rate must be from 0 to under 30%. */
export const RATE_LIMIT = { low: 0, high: 0.3 } as const;
/** Points from 0 to 10% of the loan. */
export const POINTS_LIMIT = { low: 0, high: 0.1 } as const;
/** The smallest loan amount taken. */
export const MIN_LOAN_AMOUNT = 1000;
/** The longest term taken, 40 years. */
export const MAX_TERM_MONTHS = 480;
/** The solver's range ends at 100%. An APR solved at or above this is the range, not an answer. */
const SOLVER_CEILING = 0.9999;

export type AprInput = {
  loanAmount: number;
  /** Decimal. */
  rate: number;
  termMonths: number;
  lenderFees: number;
  /** Decimal share of the loan amount. */
  points: number;
  lenderCredit: number;
  monthlyMi: number;
  homeValue: number;
  /** NaN means "use the automatic 15 days". */
  prepaidInterest: number;
};

export type AprResult = {
  apr: number;
  /** apr minus rate. */
  spread: number;
  principalAndInterest: number;
  fees: {
    lenderFees: number;
    pointsAmount: number;
    prepaidInterest: number;
    prepaidInterestIsAutomatic: boolean;
    /** The part of the credit that was used, as a positive number. */
    lenderCreditApplied: number;
    /** pointsAmount + lenderFees + prepaidInterest - lenderCreditApplied, each in whole cents. */
    total: number;
  };
  amountFinanced: number;
  financeCharge: number;
  totalOfPayments: number;
  /** Payments that carry mortgage insurance; 0 when none. */
  miMonths: number;
};

/** Whole cents, and never a negative zero. */
const cents = (n: number): number => roundCents(n) + 0;
/** A number that is zero or more. */
const entered = (amount: number): boolean => Number.isFinite(amount) && amount >= 0;

/**
 * The number of scheduled payments until the balance first reaches `MI_END_LTV` of the home value.
 * 0 when the loan starts at or under it; the whole term when it is never reached before the end.
 */
function monthsToMiEnd(principal: number, rate: number, termMonths: number, payment: number, homeValue: number): number {
  const target = MI_END_LTV * homeValue;
  if (principal <= target) return 0;
  const r = rate / 12;
  let balance = principal;
  for (let month = 1; month <= termMonths; month++) {
    balance -= payment - balance * r;
    if (balance <= target) return month;
  }
  return termMonths;
}

/** What a list of monthly payments is worth today at a yearly rate compounded monthly. */
function presentValue(payments: number[], annualRate: number): number {
  const r = annualRate / 12;
  let value = 0;
  for (let i = 0; i < payments.length; i++) value += payments[i] / Math.pow(1 + r, i + 1);
  return value;
}

/** The yearly rate at which the payments are worth the amount financed: bisection, as on the dashboard. */
function solveApr(payments: number[], amountFinanced: number): number {
  let low = 0;
  let high = 1;
  let mid = 0;
  for (let round = 0; round < 100; round++) {
    mid = (low + high) / 2;
    const value = presentValue(payments, mid);
    if (Math.abs(value - amountFinanced) < 1e-7) break;
    if (value > amountFinanced) low = mid;
    else high = mid;
  }
  return mid;
}

/**
 * null when the loan amount is under `MIN_LOAN_AMOUNT`, the rate or term is unusable, a figure is negative
 * or NaN where a number is required, mortgage insurance is entered without a home value, the fees
 * leave nothing financed, or they leave so little that the APR is at the solver's 100% ceiling.
 */
export function calculateApr(input: AprInput): AprResult | null {
  const { loanAmount, rate, termMonths, lenderFees, points, lenderCredit, monthlyMi, homeValue } = input;
  const prepaidInterestIsAutomatic = Number.isNaN(input.prepaidInterest);
  if (
    !Number.isFinite(loanAmount) || loanAmount < MIN_LOAN_AMOUNT ||
    !Number.isFinite(rate) || rate < RATE_LIMIT.low || rate >= RATE_LIMIT.high ||
    !Number.isInteger(termMonths) || termMonths < 1 || termMonths > MAX_TERM_MONTHS ||
    !entered(lenderFees) || !entered(lenderCredit) || !entered(monthlyMi) || !entered(homeValue) ||
    !entered(points) || points > POINTS_LIMIT.high ||
    !(prepaidInterestIsAutomatic || entered(input.prepaidInterest)) ||
    (monthlyMi > 0 && homeValue <= 0)
  ) return null;

  // Every line in whole cents, so the lines add up to the total as a visitor sees them.
  const fees = cents(lenderFees);
  const prepaidInterest = cents(prepaidInterestIsAutomatic ? (loanAmount * rate * PREPAID_INTEREST_DAYS) / 365 : input.prepaidInterest);
  const pointsAmount = cents(loanAmount * points);
  // The credit comes off the lender fees and prepaid interest only, and takes them to zero at most.
  const beforeCredit = cents(fees + prepaidInterest);
  const lenderCreditApplied = Math.min(cents(lenderCredit), beforeCredit);
  const feesTotal = cents(pointsAmount + beforeCredit - lenderCreditApplied);
  const amountFinanced = loanAmount - feesTotal;
  if (!(amountFinanced > 0)) return null;

  const payment = monthlyPayment(loanAmount, rate * 100, termMonths);
  const miMonths = monthlyMi > 0 ? monthsToMiEnd(loanAmount, rate, termMonths, payment, homeValue) : 0;
  const payments = Array.from({ length: termMonths }, (_, i) => (i < miMonths ? payment + monthlyMi : payment));
  const totalOfPayments = payments.reduce((sum, p) => sum + p, 0);

  // Decision 4: with nothing counted the APR is the rate itself; otherwise it is never below it.
  const nothingCounted = feesTotal === 0 && miMonths === 0;
  const apr = nothingCounted ? rate : Math.max(rate, solveApr(payments, amountFinanced));
  if (apr >= SOLVER_CEILING) return null;

  return {
    apr,
    spread: apr - rate,
    principalAndInterest: cents(payment),
    fees: {
      lenderFees: fees,
      pointsAmount,
      prepaidInterest,
      prepaidInterestIsAutomatic,
      lenderCreditApplied,
      total: feesTotal,
    },
    amountFinanced: cents(amountFinanced),
    financeCharge: cents(totalOfPayments - amountFinanced),
    totalOfPayments: cents(totalOfPayments),
    miMonths,
  };
}
