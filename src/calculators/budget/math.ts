/**
 * Model for the Home budget calculator. Pure functions, no DOM.
 * Ported from msfg-calc `public/js/calculators/budget.js`, function calculate() and the band tests
 * in setStatus(). `golden.json` holds cases recorded from that page's own code by
 * `scripts/calculators/golden-budget.mjs` and `math.test.ts` requires this file to reproduce them
 * to the cent and to two decimals of a percent. Keep the two in step and say so when one changes.
 *
 * What is worked out, all per month
 *   - Housing as a share of income: `housing / grossIncome` (the dashboard's front ratio).
 *   - Housing and debts as a share of income: `(housing + debts) / grossIncome` (its back ratio).
 *   - Left after housing and debts: `grossIncome - housing - debts` (its residual after both). This is
 *     before tax and before living costs.
 *   - Left after all expenses: `grossIncome - housing - debts - living` (the dashboard's second
 *     residual, shown under the first). It is before tax and savings.
 *   - Tax and savings are each a share of gross income: `grossIncome x taxRate` and
 *     `grossIncome x savingsRate`. Spendable income is gross income minus both.
 *   - Total expenses are `housing + debts + living`.
 *   - Cash flow is spendable income minus total expenses (netCashFlow). It can be negative.
 *   - Months of housing the balances cover: `floor(balances / housing)` (reserveMonths).
 *
 * Conventions
 *   - Rates and ratios are decimals (0.22 = 22%). The dashboard works in percents.
 *   - Income has to be above zero. The tax rate, housing, debts and living costs must each be a
 *     number: NaN gives no result, so a figure is never shown with a cost silently left out. A
 *     negative amount gives no result. What NaN stands for is decided at the field boundary
 *     (`toInput`): an empty income or housing box, and anything typed that cannot be read. An
 *     empty tax rate, debts or living costs box arrives here as 0, the same as a typed 0.
 *   - The savings rate is optional: NaN means not entered and counts as 0.
 *   - Each rate must be within RATE_RANGE, 0 to 100%. The two together may pass 100%; spendable
 *     income is then negative.
 *   - Bands: a ratio at or under `comfortable` is "comfortable", at or under `stretching` is
 *     "stretching", above it "high". A ratio exactly on an edge is in the band below it, as in the
 *     dashboard's own `<=` tests. They are a way to read a share of income, nothing more.
 *   - A band is read from the ratio rounded to four decimal places (`roundShare`), a hundredth of
 *     a percent, which is also how the page shows it. So the band and the figure shown always
 *     agree: 47.00% is the lower band and 47.01% the upper, whatever cents are behind it.
 *   - Sums are kept unrounded, as on the dashboard, and each reported amount is rounded to cents
 *     on its own. The ratios in the result are not rounded; the page rounds them with `roundShare`.
 *
 * The deliberate differences from the dashboard
 *   - One income figure. The dashboard splits the income of its employment rows, which
 *     the two ratios and the residual use, from total household income (employment plus
 *     additional), which tax, savings and cash flow use. Here there is one gross monthly household
 *     income, used everywhere. The two agree when there is no additional income, which is how
 *     every golden case is recorded.
 *   - A share within a hundredth of a percent of an edge reads as the lower band; the dashboard's
 *     float arithmetic can tip it over. There 5,500 / 10,000 x 100 comes to a hair above 55, so a
 *     back ratio of exactly 55% reads as the upper band; here it is "stretching". After rounding,
 *     the edges hold for amounts with cents too. The golden cases (32% and 47% exactly) agree.
 *   - With a ratio of exactly 0 the dashboard asks for data instead of naming a band. Here 0 is
 *     "comfortable".
 *   - Months of reserves is null, not 0, when there are no balances or no housing: there is
 *     nothing to show.
 *
 * Left out of the dashboard's worksheet
 *   - The borrower and loan block, the MISMO import, and the principal and interest worked out
 *     from a loan amount, rate and term. Housing is the amount typed.
 *   - Liability balances, months left, and the omit and payoff flags (and so the payoff total).
 *     A debt is a monthly payment.
 *   - Flood insurance and "other housing expense".
 *   - The payoff flag, and so the "payoff cash needed" row of the dashboard's cash flow card.
 */
import { roundCents } from "@/lib/finance";

/** Housing as a share of gross income: at or under each edge. */
export const FRONT_BANDS = { comfortable: 0.32, stretching: 0.47 } as const;
/** Housing and debts as a share of gross income: at or under each edge. */
export const BACK_BANDS = { comfortable: 0.47, stretching: 0.55 } as const;
/** The tax rate and the savings rate must each be within this, as decimals. */
export const RATE_RANGE = { low: 0, high: 1 } as const;

export type Band = "comfortable" | "stretching" | "high";

/** Monthly dollars. */
export type BudgetInput = {
  grossIncome: number;
  /** Decimals. NaN means not entered. */
  taxRate: number;
  savingsRate: number;
  housing: number;
  debts: number;
  living: number;
  /** Total of account balances. NaN or 0 means none entered. */
  balances: number;
};

export type BudgetResult = {
  frontRatio: number;
  frontBand: Band;
  backRatio: number;
  backBand: Band;
  /** Gross income minus housing minus debts. */
  residual: number;
  /** Gross income minus housing, debts and living costs: before tax and savings. */
  residualAfterLiving: number;
  taxAmount: number;
  savingsAmount: number;
  /** Income after tax and savings. */
  spendable: number;
  totalExpenses: number;
  /** spendable minus totalExpenses. */
  cashFlow: number;
  /** Whole months of housing the balances cover; null when no balances or no housing. */
  reserveMonths: number | null;
};

/** Hundredths of a percent, as a whole number: 0.4703 is 4703. */
const hundredths = (ratio: number): number => Math.round(ratio * 10000);

/** A ratio rounded to four decimal places, a hundredth of a percent: the figure a band is read from and the page shows. */
export function roundShare(ratio: number): number {
  return hundredths(ratio) / 10000 + 0;
}

/** The band of a ratio, read from the ratio rounded to a hundredth of a percent. */
export function bandFor(ratio: number, bands: { comfortable: number; stretching: number }): Band {
  const shown = hundredths(ratio);
  if (shown <= hundredths(bands.comfortable)) return "comfortable";
  return shown <= hundredths(bands.stretching) ? "stretching" : "high";
}

/** Whole cents, and never a negative zero. */
const cents = (n: number): number => roundCents(n) + 0;
const entered = (amount: number): boolean => Number.isFinite(amount) && amount >= 0;
const inRange = (rate: number): boolean => rate >= RATE_RANGE.low && rate <= RATE_RANGE.high;

/**
 * null when income is not above zero, or tax rate, housing, debts or living is NaN or negative, or
 * a rate is outside 0 to 100%. A NaN savings rate is 0. The page passes 0, not NaN, for a tax
 * rate, debts or living costs box left empty; NaN there means something unreadable was typed.
 */
export function calculateBudget(input: BudgetInput): BudgetResult | null {
  const { grossIncome, taxRate, housing, debts, living, balances } = input;
  const savingsRate = Number.isNaN(input.savingsRate) ? 0 : input.savingsRate;
  if (
    !Number.isFinite(grossIncome) || grossIncome <= 0 ||
    !inRange(taxRate) || !inRange(savingsRate) ||
    !entered(housing) || !entered(debts) || !entered(living)
  ) return null;

  const taxAmount = grossIncome * taxRate;
  const savingsAmount = grossIncome * savingsRate;
  const spendable = grossIncome - taxAmount - savingsAmount;
  const totalExpenses = housing + debts + living;
  const frontRatio = housing / grossIncome;
  const backRatio = (housing + debts) / grossIncome;

  return {
    frontRatio,
    frontBand: bandFor(frontRatio, FRONT_BANDS),
    backRatio,
    backBand: bandFor(backRatio, BACK_BANDS),
    residual: cents(grossIncome - housing - debts),
    residualAfterLiving: cents(grossIncome - totalExpenses),
    taxAmount: cents(taxAmount),
    savingsAmount: cents(savingsAmount),
    spendable: cents(spendable),
    totalExpenses: cents(totalExpenses),
    cashFlow: cents(spendable - totalExpenses),
    reserveMonths: balances > 0 && housing > 0 && Number.isFinite(balances) ? Math.floor(balances / housing) : null,
  };
}
