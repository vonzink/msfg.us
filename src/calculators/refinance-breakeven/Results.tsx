import { formatUSD } from "@/lib/finance";
import { SeriesChart } from "../shared/Charts";
import { Stat } from "../shared/Stat";
import { cn } from "@/lib/cn";
import type { BreakevenResult, KeepPeriod } from "./math";

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
  return r.next.payment < r.current.payment
    ? `The new loan costs ${gap} more in interest, even with the lower payment.`
    : `The new loan costs ${gap} more in interest.`;
}

/** Which loan leaves less owed at the end of the keep period. */
export function balanceSentence(k: KeepPeriod): string {
  if (Math.round(k.balanceDifference) === 0) return "You would owe about the same on either loan.";
  return `You would owe ${formatUSD(Math.abs(k.balanceDifference))} ${k.balanceDifference > 0 ? "less" : "more"} with the new loan.`;
}

/** The overall result once payments, closing costs and the balance are all counted. */
export function positionSentence(k: KeepPeriod): string {
  const side = k.netPosition >= 0 ? "ahead" : "behind";
  return `Counting the payments, the closing costs and what would still be owed, the refinance leaves you ${formatUSD(Math.abs(k.netPosition))} ${side} after ${yearsText(k.months)}.`;
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

  if (r.loanShortfall > 0) {
    return (
      <div role="status" className="rounded-xl border border-line bg-white p-6 text-[16px] text-ink shadow-card">
        <strong>
          A new loan of {formatUSD(r.newLoanAmount)} is {formatUSD(r.loanShortfall)} less than the balance plus the cash out.
        </strong>{" "}
        Raise the new loan amount or lower the cash out to see the breakeven.
      </div>
    );
  }

  const months = r.breakevenMonths;
  const paymentRise = r.next.payment - r.current.payment;
  const savingsSub =
    paymentRise > 0 && r.monthlySavings > 0
      ? `the new payment is ${formatUSD(paymentRise)} higher; the savings come from debt payments paid off`
      : r.debtPaymentsPaidOff > 0
        ? `includes ${formatUSD(r.debtPaymentsPaidOff)} of debt payments paid off`
        : "payment now minus new payment";
  const chartYears = months && months > 0 ? Math.min(10, Math.max(5, Math.ceil(months / 12) + 2)) : 0;

  return (
    <>
      <div className="rounded-xl bg-green-800 p-6 text-on-dark shadow-card">
        <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-mint">Estimated breakeven</p>
        <p aria-live="polite" className="mt-1 text-[clamp(40px,5vw,58px)] font-extrabold leading-[1.05] tracking-[-0.02em] tabular-nums text-white">{breakevenText(r)}</p>
        <p className="mt-1.5 text-[16px] text-on-dark-2">
          {r.breakevenBeyondTerm
            ? "The savings would not cover the closing costs within the life of the new loan."
            : months === null
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
          sub={savingsSub}
          tip="The payment now minus the new payment, plus any debt payments the cash out pays off. A negative figure means you would pay more each month."
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
        {r.loanDifference > 0 && (
          <p className="mt-1 text-[14px]">The new loan is {formatUSD(r.loanDifference)} larger than the balance, which adds to its interest.</p>
        )}
        {r.loanDifference < 0 && (
          <p className="mt-1 text-[14px]">The new loan is {formatUSD(-r.loanDifference)} smaller than the balance; that amount is paid in at closing.</p>
        )}
        <p className="mt-1 text-[13px] text-muted">If each loan is kept to its last payment.</p>
      </div>

      {r.keep && (
        <div className="rounded-xl border border-line bg-white p-5 shadow-card max-[600px]:p-4">
          <h2 className="text-[17px] font-bold">After {yearsText(r.keep.months)}</h2>
          <dl className="m-0 mt-3 grid grid-cols-3 gap-3 max-[600px]:grid-cols-1">
            <div>
              <dt className="text-[13px] font-semibold text-muted">Net savings over {yearsText(r.keep.months)}</dt>
              <dd className={cn("m-0 text-[22px] font-extrabold tabular-nums", r.keep.netSavings < 0 && "text-loss")}>{formatUSD(r.keep.netSavings)}</dd>
              <dd className="m-0 text-[12px] text-muted">payments saved, minus closing costs</dd>
            </div>
            <div>
              <dt className="text-[13px] font-semibold text-muted">Still owed on the loan now</dt>
              <dd className="m-0 text-[22px] font-extrabold tabular-nums">{formatUSD(r.keep.balanceNowLoan)}</dd>
            </div>
            <div>
              <dt className="text-[13px] font-semibold text-muted">Still owed on the new loan</dt>
              <dd className="m-0 text-[22px] font-extrabold tabular-nums">{formatUSD(r.keep.balanceNewLoan)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-[15px]">{balanceSentence(r.keep)}</p>
          <p className="mt-1 text-[15px] font-semibold">{positionSentence(r.keep)}</p>
          {r.loanDifference > 0 && (
            <p className="mt-1 text-[13px] text-muted">
              This counts the {formatUSD(r.loanDifference)} borrowed on top of the balance as money received at the start.
            </p>
          )}
        </div>
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

      {r.debtPaymentsIgnored > 0 && (
        <p className="mx-1 text-[14px] font-semibold text-ink">
          {formatUSD(r.debtPaymentsIgnored)} of debt payments are not counted, because the new loan is not larger than the
          balance. Add cash out if the new loan will pay those debts off.
        </p>
      )}
      {r.cashOut > 0 && (
        <p className="mx-1 text-[14px] text-ink">Includes {formatUSD(r.cashOut)} of cash out, which is added to the new loan.</p>
      )}
      <p className="mx-1 text-[14px] text-ink">{CAUTION}</p>
      <p className="mx-1 text-[13px] text-muted">{disclaimer}</p>
    </>
  );
}
