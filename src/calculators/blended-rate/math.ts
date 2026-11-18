/**
 * Model for the Blended rate calculator. Pure functions, no DOM.
 * Ported from msfg-calc `legacy/gen-calc/blended-rate.js` (calcDebt). `golden.json` holds cases
 * recorded from that code by `scripts/calculators/golden-blended-rate.mjs` and `math.test.ts`
 * requires this file to reproduce the figures the dashboard displays.
 *
 * Conventions
 *   - Rates are decimals (0.07 = 7%).
 *   - The blended rate is each debt's rate weighted by its balance: a large balance at a low rate
 *     pulls the figure down more than a small balance at a high rate pulls it up.
 *   - It is a snapshot of today's balances. It says nothing about how long each debt has left, so
 *     it does not show which arrangement costs less over time.
 *   - A debt with a balance and no rate counts at 0%, as on the dashboard, and is flagged so the
 *     page can say so.
 *   - Difference from the dashboard: a row whose balance is not above zero is left out entirely,
 *     its payment included. The dashboard adds a negative balance into its totals, and adds the
 *     payment of a row that has no balance. Golden cases use neither.
 */
export type Debt = { name: string; balance: number; rate: number; payment: number };

export type DebtShare = Debt & {
  /** Share of the total balance, 0 to 1. */
  share: number;
  /** True when no usable rate was given and the debt was counted at 0%. */
  missingRate: boolean;
};

export type BlendedResult = {
  /** Weighted by balance, as a decimal. */
  blendedRate: number;
  totalBalance: number;
  /** Sum of the payments entered. Zero when none were. */
  totalPayment: number;
  /** Only debts with a balance above zero, in the order given. */
  debts: DebtShare[];
  /** Set when a comparison rate was given: that rate minus the blended rate. */
  comparison: { rate: number; difference: number } | null;
};

const usable = (x: number): boolean => Number.isFinite(x) && x >= 0;

/** null when no debt has a balance above zero. `compareRate` is a decimal, or NaN for none. */
export function calculateBlended(debts: Debt[], compareRate: number): BlendedResult | null {
  const counted = debts.filter((d) => Number.isFinite(d.balance) && d.balance > 0);
  const totalBalance = counted.reduce((t, d) => t + d.balance, 0);
  if (counted.length === 0 || !(totalBalance > 0)) return null;

  const withRates = counted.map((d) => ({
    ...d,
    rate: usable(d.rate) ? d.rate : 0,
    payment: usable(d.payment) ? d.payment : 0,
    missingRate: !usable(d.rate),
    share: d.balance / totalBalance,
  }));
  const blendedRate = withRates.reduce((t, d) => t + d.balance * d.rate, 0) / totalBalance;

  return {
    blendedRate,
    totalBalance,
    totalPayment: withRates.reduce((t, d) => t + d.payment, 0),
    debts: withRates,
    comparison: usable(compareRate) ? { rate: compareRate, difference: compareRate - blendedRate } : null,
  };
}
