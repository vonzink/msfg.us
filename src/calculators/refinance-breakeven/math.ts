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
 *   - There is no breakeven when the savings are not above zero, or when it would take longer
 *     than the new loan lasts.
 *   - Differences from the dashboard, each to keep a public figure from overstating the savings:
 *       · Debt payments paid off count only when the new loan is larger than the balance, since
 *         the extra borrowing is what pays them off.
 *       · A typed loan amount smaller than the balance plus the cash out is reported as a
 *         shortfall, and the page then shows no figures.
 *       · Net savings stop counting the old payment after the old loan would have been paid off,
 *         and stop counting the new payment after the new loan ends. The dashboard multiplies the
 *         monthly savings by the whole period. The two agree while both loans are running.
 *   - Not on the dashboard, so hand-checked in the tests: interest over the life of each loan,
 *     which is the payments still to be made minus the amount owed, on principal and interest
 *     only. It assumes each loan is kept to its last payment.
 *   - With a keep period, the model gives what is still owed on each loan at its end, from the
 *     dashboard's remaining-balance formula, and a net figure: monthly savings over the period,
 *     minus closing costs paid, plus additional equity. A shorter loan at a lower rate can cost
 *     more each month and still come out ahead, because far less is owed at the end. Borrowed
 *     money is never counted as a gain (see KeepPeriod).
 *   - Left out on purpose: the dashboard's itemized fees, cost-of-waiting scenario, "refinance
 *     twice" analysis, loan-type insurance rules and manual payment overrides.
 */
import { monthlyPayment, remainingBalance, roundCents } from "@/lib/finance";

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

/**
 * Where the visitor stands after the time they plan to keep the loan:
 *
 *   net = monthly savings over the period − closing costs paid at closing + additional equity
 *
 * Borrowed money is never a gain. Cash taken out is reported in `cashBorrowed` and shows up only
 * as more owed. Closing costs added to the loan are already in the higher balance, so they reach
 * the result through the equity and are not subtracted a second time.
 */
export type KeepPeriod = {
  months: number;
  /** The dashboard's figure: monthly savings over the period minus all closing costs. Kept for parity tests; the page shows `net`. */
  netSavings: number;
  /** Still owed on the current loan at the end of the period. Zero if it would be paid off. */
  balanceNowLoan: number;
  /** Still owed on the new loan at the end of the period. */
  balanceNewLoan: number;
  /** Payments avoided on the old loan minus payments made on the new one, plus debt payments paid off. Negative when the new payment is higher. */
  paymentSavings: number;
  /** Closing costs paid at closing, out of pocket. */
  closingCostsPaid: number;
  /** Closing costs added to the new loan instead: borrowing above the balance and the cash out, up to the closing costs. */
  closingCostsFinanced: number;
  /** Money borrowed on top of the balance that is not financed closing costs: the cash out. */
  cashBorrowed: number;
  /** Current loan's balance minus the new loan's. Positive means more equity with the new loan. */
  additionalEquity: number;
  /** paymentSavings − closingCostsPaid + additionalEquity. Positive means ahead. */
  net: number;
};

export type BreakevenResult = {
  newLoanAmount: number;
  current: { principalAndInterest: number; mi: number; payment: number; interestRemaining: number };
  next: { principalAndInterest: number; mi: number; payment: number; interestTotal: number };
  /** Current payment minus new payment, plus debt payments paid off. Can be zero or negative. */
  monthlySavings: number;
  /** Whole months until the savings cover the closing costs. null when there is no breakeven. */
  breakevenMonths: number | null;
  /** True when there are savings but they would not cover the closing costs before the new loan ends. */
  breakevenBeyondTerm: boolean;
  /** New loan amount minus the current balance. Positive when more is borrowed, negative when money is paid in. */
  loanDifference: number;
  /** How far a typed loan amount falls short of the balance plus the cash out. Zero when it covers both. */
  loanShortfall: number;
  /** Debt payments typed in but not counted, because the new loan is not larger than the balance. */
  debtPaymentsIgnored: number;
  closingCosts: number;
  /** New loan's total interest minus the current loan's remaining interest. Positive means the refinance costs more interest. */
  interestDifference: number;
  keep: KeepPeriod | null;
  /** Cash out and the debt payments it pays off, as counted. Zero when none. */
  cashOut: number;
  debtPaymentsPaidOff: number;
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
  const typedLoan = amount(input.newLoanAmount);
  const newLoanAmount = typedLoan || currentBalance + cashOut;
  const loanShortfall = typedLoan && cashOut > 0 ? Math.max(0, roundCents(currentBalance + cashOut - typedLoan)) : 0;
  const closingCosts = amount(input.closingCosts);
  const currentMi = amount(input.currentMi);
  const newMi = amount(input.newMi);

  const currentPI = roundCents(monthlyPayment(currentBalance, percent(currentRate), monthsLeft));
  const newPI = roundCents(monthlyPayment(newLoanAmount, percent(newRate), newTermMonths));
  const currentPayment = roundCents(currentPI + currentMi);
  const newPayment = roundCents(newPI + newMi);
  const debtTyped = amount(input.debtPaymentsPaidOff);
  const debtPaymentsPaidOff = newLoanAmount > currentBalance ? debtTyped : 0;
  const monthlySavings = roundCents(roundCents(currentPayment - newPayment) + debtPaymentsPaidOff);

  const interestRemaining = roundCents(currentPI * monthsLeft - currentBalance);
  const interestTotal = roundCents(newPI * newTermMonths - newLoanAmount);
  const keepMonths = Number.isFinite(input.keepMonths) && input.keepMonths > 0 ? Math.round(input.keepMonths) : 0;

  const rawBreakeven = monthlySavings > 0 ? Math.ceil(closingCosts / monthlySavings) : null;
  const breakevenBeyondTerm = rawBreakeven !== null && rawBreakeven > newTermMonths;
  const netSavings = roundCents(
    roundCents(currentPayment * Math.min(keepMonths, monthsLeft) - newPayment * Math.min(keepMonths, newTermMonths) + debtPaymentsPaidOff * keepMonths) - closingCosts,
  );

  const keepPeriod = (): KeepPeriod => {
    const balanceNowLoan = roundCents(remainingBalance(currentBalance, percent(currentRate), monthsLeft, Math.min(keepMonths, monthsLeft)));
    const balanceNewLoan = roundCents(remainingBalance(newLoanAmount, percent(newRate), newTermMonths, Math.min(keepMonths, newTermMonths)));
    const additionalEquity = roundCents(balanceNowLoan - balanceNewLoan);
    const paymentSavings = roundCents(netSavings + closingCosts);
    // Borrowing above the balance and the cash out is closing costs added to the loan, up to their total.
    const closingCostsFinanced = Math.min(closingCosts, Math.max(0, roundCents(newLoanAmount - currentBalance - cashOut)));
    const closingCostsPaid = roundCents(closingCosts - closingCostsFinanced);
    return {
      months: keepMonths,
      netSavings,
      balanceNowLoan,
      balanceNewLoan,
      paymentSavings,
      closingCostsPaid,
      closingCostsFinanced,
      cashBorrowed: Math.max(0, roundCents(newLoanAmount - currentBalance - closingCostsFinanced)),
      additionalEquity,
      net: roundCents(paymentSavings - closingCostsPaid + additionalEquity),
    };
  };

  return {
    newLoanAmount,
    current: { principalAndInterest: currentPI, mi: currentMi, payment: currentPayment, interestRemaining },
    next: { principalAndInterest: newPI, mi: newMi, payment: newPayment, interestTotal },
    monthlySavings,
    breakevenMonths: breakevenBeyondTerm ? null : rawBreakeven,
    breakevenBeyondTerm,
    loanDifference: roundCents(newLoanAmount - currentBalance),
    loanShortfall,
    debtPaymentsIgnored: debtTyped - debtPaymentsPaidOff,
    closingCosts,
    interestDifference: roundCents(interestTotal - interestRemaining),
    cashOut,
    debtPaymentsPaidOff,
    keep: keepMonths ? keepPeriod() : null,
  };
}
