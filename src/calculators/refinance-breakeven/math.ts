/**
 * Model for the Refinance breakeven calculator. Pure functions, no DOM.
 * Ported from msfg-calc `legacy/refi-calc/js/refi-engine.js`: calcMonthlyPayment, calcBreakevenNow
 * and the "refinance now" half of calcCostOfWaiting, as RefiEngine.runAnalysis combines them.
 * `golden.json` holds cases recorded from that engine by
 * `scripts/calculators/golden-refinance-breakeven.mjs` and `math.test.ts` requires this file to
 * reproduce them to the cent.
 *
 * Conventions
 *   - Rates are decimals (0.07 = 7%). Terms are whole months.
 *   - Rounding follows the dashboard: each payment is rounded to cents first, the savings are the
 *     difference of the rounded payments, the breakeven is rounded up to a whole month, and net
 *     savings are the savings over the period, rounded, minus the closing costs.
 *   - Payments are principal and interest plus any mortgage insurance typed in. Property tax and
 *     homeowners insurance are left out: a refinance does not change them.
 *   - Closing costs are the one total typed in. They are compared with the savings, not added to
 *     the new loan, unless the visitor raises the new loan amount themselves.
 *   - Cash out, as on the dashboard, changes only the default size of the new loan. Monthly
 *     payments on other debts that the cash pays off are added to the savings.
 *   - There is no breakeven when the savings are not above zero.
 *   - Not on the dashboard, so hand-checked in the tests: interest over the life of each loan,
 *     which is the payments still to be made minus the amount owed, on principal and interest
 *     only. It assumes each loan is kept to its last payment.
 *   - Left out on purpose: the dashboard's itemized fees, cost-of-waiting scenario, "refinance
 *     twice" analysis, loan-type insurance rules and manual payment overrides.
 */
import { monthlyPayment, roundCents } from "@/lib/finance";

export type BreakevenInput = {
  currentBalance: number;
  currentRate: number;
  monthsLeft: number;
  newRate: number;
  newTermMonths: number;
  closingCosts: number;
  /** NaN or not above zero means "current balance plus cash out". */
  newLoanAmount: number;
  cashOut: number;
  /** Monthly payments on other debts that the cash out pays off. Added to the savings. */
  debtPaymentsPaidOff: number;
  currentMi: number;
  newMi: number;
  /** How long the visitor plans to keep the loan. NaN or not above zero means "not given". */
  keepMonths: number;
};

export type BreakevenResult = {
  newLoanAmount: number;
  current: { principalAndInterest: number; mi: number; payment: number; interestRemaining: number };
  next: { principalAndInterest: number; mi: number; payment: number; interestTotal: number };
  /** Current payment minus new payment, plus debt payments paid off. Can be zero or negative. */
  monthlySavings: number;
  /** Whole months until the savings cover the closing costs. null when the savings are not above zero. */
  breakevenMonths: number | null;
  closingCosts: number;
  /** New loan's total interest minus the current loan's remaining interest. Positive means the refinance costs more interest. */
  interestDifference: number;
  keep: { months: number; netSavings: number } | null;
};

/** Junk or negative optional amounts count as zero. */
const amount = (x: number): number => (Number.isFinite(x) && x > 0 ? x : 0);
/** The dashboard takes rates above 0% and below 30%. */
const rateOk = (x: number): boolean => Number.isFinite(x) && x > 0 && x < 0.3;
const monthsOk = (x: number): boolean => Number.isInteger(x) && x >= 1 && x <= 480;
/** The dashboard works in percent; drop the float noise of 0.07 * 100. */
const percent = (rate: number): number => Number((rate * 100).toFixed(6));

/** null for a balance, rate, term or loan amount the dashboard rejects. */
export function calculateBreakeven(input: BreakevenInput): BreakevenResult | null {
  const { currentBalance, currentRate, monthsLeft, newRate, newTermMonths } = input;
  if (
    !Number.isFinite(currentBalance) || currentBalance <= 0 ||
    !rateOk(currentRate) || !rateOk(newRate) || !monthsOk(monthsLeft) || !monthsOk(newTermMonths)
  ) return null;

  const cashOut = amount(input.cashOut);
  const newLoanAmount = amount(input.newLoanAmount) || currentBalance + cashOut;
  const closingCosts = amount(input.closingCosts);
  const currentMi = amount(input.currentMi);
  const newMi = amount(input.newMi);

  const currentPI = roundCents(monthlyPayment(currentBalance, percent(currentRate), monthsLeft));
  const newPI = roundCents(monthlyPayment(newLoanAmount, percent(newRate), newTermMonths));
  const currentPayment = roundCents(currentPI + currentMi);
  const newPayment = roundCents(newPI + newMi);
  const monthlySavings = roundCents(roundCents(currentPayment - newPayment) + amount(input.debtPaymentsPaidOff));

  const interestRemaining = roundCents(currentPI * monthsLeft - currentBalance);
  const interestTotal = roundCents(newPI * newTermMonths - newLoanAmount);
  const keepMonths = Number.isFinite(input.keepMonths) && input.keepMonths > 0 ? Math.round(input.keepMonths) : 0;

  return {
    newLoanAmount,
    current: { principalAndInterest: currentPI, mi: currentMi, payment: currentPayment, interestRemaining },
    next: { principalAndInterest: newPI, mi: newMi, payment: newPayment, interestTotal },
    monthlySavings,
    breakevenMonths: monthlySavings > 0 ? Math.ceil(closingCosts / monthlySavings) : null,
    closingCosts,
    interestDifference: roundCents(interestTotal - interestRemaining),
    keep: keepMonths ? { months: keepMonths, netSavings: roundCents(roundCents(monthlySavings * keepMonths) - closingCosts) } : null,
  };
}
