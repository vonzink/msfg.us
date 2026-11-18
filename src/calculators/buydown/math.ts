/**
 * Model for the Rate buydown calculator. Pure functions, no DOM.
 * Ported from msfg-calc `legacy/buydown-calc/buydown.js` (getBuydownRates, calculateBuydownResults).
 * `golden.json` holds cases recorded from that code by `scripts/calculators/golden-buydown.mjs`
 * and `math.test.ts` requires this file to reproduce them to the cent.
 *
 * Conventions
 *   - Rates are decimals (0.07 = 7%). Money is in dollars and is not rounded here; round where it
 *     is shown or compared, as the dashboard does.
 *   - Temporary buydowns only. The name gives the points taken off the rate in each early year:
 *     3-2-1 is 3, 2 and 1 points off for three years; 2-1 is 2 then 1; 1-1 is 1 for two years;
 *     1-0 is 1 for one year. Buying the rate down for the life of the loan with points is not modelled.
 *   - The loan is written at the full rate. In a reduced year the borrower pays the payment a loan
 *     at the reduced rate would have, and the buydown fund pays the rest.
 *   - The cost is the plain sum of those monthly differences. No interest is assumed on the fund.
 *   - A reduced rate cannot go below 0%.
 *   - Tax, insurance and HOA are added to every payment unchanged. They do not affect the cost.
 */
import { monthlyPayment } from "@/lib/finance";

export type BuydownType = "3-2-1" | "2-1" | "1-1" | "1-0";

/** Points off the full rate in each reduced year. */
export const REDUCTIONS: Record<BuydownType, number[]> = {
  "3-2-1": [3, 2, 1],
  "2-1": [2, 1],
  "1-1": [1, 1],
  "1-0": [1],
};

export type BuydownInput = {
  loanAmount: number;
  annualRate: number;
  /** Whole years, 1 to 40. */
  termYears: number;
  type: BuydownType;
  yearlyTax: number;
  yearlyInsurance: number;
  monthlyHoa: number;
};

export type BuydownPeriod = {
  /** 1, 2 or 3 for a reduced year; the first full-rate year for the last period. */
  year: number;
  reduced: boolean;
  rate: number;
  principalAndInterest: number;
  /** Principal and interest plus tax, insurance and HOA. */
  total: number;
  monthlySavings: number;
  yearlySavings: number;
};

export type BuydownResult = {
  /** The reduced years in order, then one full-rate period. */
  periods: BuydownPeriod[];
  /** The last period: the payment for the rest of the loan. */
  full: BuydownPeriod;
  /** Money needed up front to fund the buydown: the sum of the reduced years' savings. */
  totalCost: number;
  /** True when a reduced rate was stopped at 0%. */
  flooredAtZero: boolean;
};

/** Junk or negative optional amounts count as zero. */
const amount = (x: number): number => (Number.isFinite(x) && x > 0 ? x : 0);

/** null for a loan amount or rate of zero or less, a rate above 25%, or a term outside 1 to 40 whole years. */
export function calculateBuydown(input: BuydownInput): BuydownResult | null {
  const { loanAmount, annualRate, termYears } = input;
  const reductions = REDUCTIONS[input.type];
  if (
    !reductions || !Number.isFinite(loanAmount) || loanAmount <= 0 ||
    !Number.isFinite(annualRate) || annualRate <= 0 || annualRate > 0.25 ||
    !Number.isInteger(termYears) || termYears < 1 || termYears > 40
  ) return null;

  const months = termYears * 12;
  // Work in percent, as the dashboard does, and drop the float noise of 0.07 * 100.
  const fullPct = Number((annualRate * 100).toFixed(6));
  const extras = amount(input.yearlyTax) / 12 + amount(input.yearlyInsurance) / 12 + amount(input.monthlyHoa);
  const fullPayment = monthlyPayment(loanAmount, fullPct, months);

  const period = (year: number, pct: number): BuydownPeriod => {
    const principalAndInterest = monthlyPayment(loanAmount, pct, months);
    const monthlySavings = fullPayment - principalAndInterest;
    return {
      year,
      reduced: pct < fullPct,
      rate: pct / 100,
      principalAndInterest,
      total: principalAndInterest + extras,
      monthlySavings,
      yearlySavings: monthlySavings * 12,
    };
  };

  const reduced = reductions.map((points, i) => period(i + 1, Math.max(0, fullPct - points)));
  const full = period(reductions.length + 1, fullPct);
  return {
    periods: [...reduced, full],
    full,
    totalCost: reduced.reduce((total, p) => total + p.yearlySavings, 0),
    flooredAtZero: reductions.some((points) => fullPct - points < 0),
  };
}
