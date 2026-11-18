import { formatUSD } from "@/lib/finance";
import { SeriesChart } from "../shared/Charts";
import { Stat } from "../shared/Stat";
import type { BreakevenResult } from "./math";

export const CAUTION =
  "A lower payment is not the whole decision. A new loan restarts the clock, so check the interest over the life of each loan as well as the breakeven.";

/** "23 months", "1 month". */
export const monthsText = (n: number) => `${n} month${n === 1 ? "" : "s"}`;
/** "5 years", "7.5 years", "1 year". */
export const yearsText = (months: number) => {
  const years = Number((months / 12).toFixed(1));
  return `${years} year${years === 1 ? "" : "s"}`;
};

/** The breakeven in a few words, for the headline and the printed summary. */
export function breakevenText(r: BreakevenResult): string {
  if (r.breakevenMonths === null) return "No breakeven";
  return r.breakevenMonths === 0 ? "Right away" : monthsText(r.breakevenMonths);
}

/** One sentence comparing the interest on the two loans. */
export function interestSentence(r: BreakevenResult): string {
  const gap = formatUSD(Math.abs(r.interestDifference));
  if (Math.round(r.interestDifference) === 0) return "The two loans cost about the same in interest.";
  if (r.interestDifference < 0) return `The new loan costs ${gap} less in interest.`;
  return r.monthlySavings > 0
    ? `The new loan costs ${gap} more in interest, even with the lower payment.`
    : `The new loan costs ${gap} more in interest.`;
}

const included = (mi: number) => (mi > 0 ? `principal, interest and ${formatUSD(mi)} mortgage insurance` : "principal and interest");

/**
 * The results column of the Refinance breakeven calculator. `result` is null until there is a
 * balance, both rates and both terms. The interest comparison is always shown: a breakeven on its
 * own would hide a refinance that lowers the payment and raises the total cost.
 */
export function BreakevenResults({ result: r, disclaimer }: { result: BreakevenResult | null; disclaimer: string }) {
  if (!r) {
    return (
      <div role="status" className="rounded-xl border border-line bg-white p-6 text-[16px] text-muted shadow-card">
        Enter your loan balance, both rates, the years left and the new term to see the breakeven.
      </div>
    );
  }

  const months = r.breakevenMonths;
  const chartYears = months && months > 0 ? Math.min(10, Math.max(5, Math.ceil(months / 12) + 2)) : 0;

  return (
    <>
      <div className="rounded-xl bg-green-800 p-6 text-on-dark shadow-card">
        <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-mint">Estimated breakeven</p>
        <p aria-live="polite" className="mt-1 text-[clamp(40px,5vw,58px)] font-extrabold leading-[1.05] tracking-[-0.02em] tabular-nums text-white">{breakevenText(r)}</p>
        <p className="mt-1.5 text-[16px] text-on-dark-2">
          {months === null
            ? "The new payment is not lower, so the closing costs are not recovered through the payment."
            : months === 0
              ? "there are no closing costs to recover"
              : `to recover ${formatUSD(r.closingCosts)} of closing costs at ${formatUSD(r.monthlySavings)} a month`}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 max-[600px]:grid-cols-1">
        <Stat
          label="Payment now"
          value={formatUSD(r.current.payment)}
          sub={included(r.current.mi)}
          tip="The monthly payment on the loan you have now. Property tax and homeowners insurance are left out because a refinance does not change them."
        />
        <Stat
          label="New payment"
          value={formatUSD(r.next.payment)}
          sub={included(r.next.mi)}
          tip={`The monthly payment on a new loan of ${formatUSD(r.newLoanAmount)}.`}
        />
        <Stat
          label="Monthly savings"
          value={formatUSD(r.monthlySavings)}
          loss={r.monthlySavings < 0}
          sub={r.debtPaymentsPaidOff > 0 ? `includes ${formatUSD(r.debtPaymentsPaidOff)} of debt payments paid off` : "payment now minus new payment"}
          tip="What you would pay less each month. A negative figure means the new payment is higher."
        />
      </div>

      <div className="rounded-xl border border-line bg-white p-5 shadow-card max-[600px]:p-4">
        <h2 className="text-[17px] font-bold">Interest over the life of each loan</h2>
        <dl className="m-0 mt-3 grid grid-cols-2 gap-3 max-[600px]:grid-cols-1">
          <div>
            <dt className="text-[13px] font-semibold text-muted">Left on the loan now</dt>
            <dd className="m-0 text-[22px] font-extrabold tabular-nums">{formatUSD(r.current.interestRemaining)}</dd>
          </div>
          <div>
            <dt className="text-[13px] font-semibold text-muted">On the new loan</dt>
            <dd className="m-0 text-[22px] font-extrabold tabular-nums">{formatUSD(r.next.interestTotal)}</dd>
          </div>
        </dl>
        <p className="mt-3 text-[15px] font-semibold">{interestSentence(r)}</p>
        <p className="mt-1 text-[13px] text-muted">If each loan is kept to its last payment.</p>
      </div>

      {r.keep && (
        <Stat
          label={`Net savings over ${yearsText(r.keep.months)}`}
          value={formatUSD(r.keep.netSavings)}
          loss={r.keep.netSavings < 0}
          sub="monthly savings over that time, minus closing costs"
          tip="What the refinance leaves you ahead, or behind, if you keep the loan for the time you entered."
        />
      )}

      {chartYears > 0 && (
        <SeriesChart
          kind="lines"
          title="Savings against closing costs"
          series={[
            { label: "Savings so far", data: Array.from({ length: chartYears }, (_, y) => r.monthlySavings * 12 * (y + 1)) },
            { label: "Closing costs", data: Array.from({ length: chartYears }, () => r.closingCosts) },
          ]}
        />
      )}

      {r.cashOut > 0 && (
        <p className="mx-1 text-[14px] text-ink">Includes {formatUSD(r.cashOut)} of cash out, which is added to the new loan.</p>
      )}
      <p className="mx-1 text-[14px] text-ink">{CAUTION}</p>
      <p className="mx-1 text-[13px] text-muted">{disclaimer}</p>
    </>
  );
}
