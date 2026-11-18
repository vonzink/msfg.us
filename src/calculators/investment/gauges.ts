import type { Scale } from "../shared/gaugeScale";

/** Speedometer scales for the four headline numbers on the investment calculator. */

/** Investor rules of thumb. Percentages are decimals (0.08 = 8%). */
export const SCALES = {
  /** Year-1 monthly cash flow as a share of the monthly rent: losing money, thin, healthy. */
  cashFlowShare: { min: -0.2, fair: 0, good: 0.1, max: 0.4 },
  /** Below 4% earns less than a savings account might. */
  cashOnCash: { min: -0.04, fair: 0.04, good: 0.08, max: 0.16 },
  /** Varies by market; these suit most single-family rentals. */
  capRate: { min: 0, fair: 0.05, good: 0.07, max: 0.12 },
  /** Below 1.00 the rent does not cover the loan; most lenders want 1.25. */
  dcr: { min: 0.5, fair: 1, good: 1.25, max: 2 },
} satisfies Record<string, Scale>;
