/** Standard fixed-rate amortization: monthly principal & interest payment.
 *  P&I = (P·r) / (1 − (1+r)^−n), where r = annualRatePct/1200, n = termMonths. */
export function monthlyPayment(
  principal: number,
  annualRatePct: number,
  termMonths = 360,
): number {
  if (!Number.isFinite(principal) || principal <= 0) return 0;
  const r = annualRatePct / 1200;
  if (r === 0) return principal / termMonths;
  return (principal * r) / (1 - Math.pow(1 + r, -termMonths));
}

/** Format a number as whole-dollar USD (e.g. $1,842). */
export function formatUSD(n: number, opts?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
    ...opts,
  }).format(Number.isFinite(n) ? Math.round(n) : 0);
}
