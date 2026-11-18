import { formatUSD } from "@/lib/finance";
import { BreakevenChart } from "./BreakevenChart";
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
  if (Math.round(k.additionalEquity) === 0) return "You would owe about the same on either loan.";
  return `You would owe ${formatUSD(Math.abs(k.additionalEquity))} ${k.additionalEquity > 0 ? "less" : "more"} with the new loan.`;
}

/** "$70,294 ahead" or "$974 behind". */
export const netText = (k: KeepPeriod) => `${formatUSD(Math.abs(k.net))} ${k.net >= 0 ? "ahead" : "behind"}`;

const figure = "m-0 text-[22px] font-extrabold tabular-nums";
const row = "flex items-baseline justify-between gap-4 border-b border-line py-1.5";

/**
 * Where the visitor stands after the years they plan to keep the loan. The sum is laid out line by
 * line so nothing is folded in out of sight: monthly savings, minus closing costs, plus additional
 * equity. Borrowed money is reported under the sum and never added to it.
 */
function KeepBlock({ keep: k }: { keep: KeepPeriod }) {
  const period = yearsText(k.months);
  return (
    <div className="rounded-xl border border-line bg-white p-5 shadow-card max-[600px]:p-4">
      <h2 className="text-[17px] font-bold">After {period}</h2>
      <dl className="m-0 mt-3 grid grid-cols-2 gap-3 max-[600px]:grid-cols-1">
        <div>
          <dt className="text-[13px] font-semibold text-muted">Still owed on the loan now</dt>
          <dd className={figure}>{formatUSD(k.balanceNowLoan)}</dd>
        </div>
        <div>
          <dt className="text-[13px] font-semibold text-muted">Still owed on the new loan</dt>
          <dd className={figure}>{formatUSD(k.balanceNewLoan)}</dd>
        </div>
      </dl>
      <p className="mt-2 text-[15px]">{balanceSentence(k)}</p>

      <dl className="m-0 mt-4 text-[15px]">
        <div className={row}>
          <dt>Monthly savings over {period}</dt>
          <dd className={cn("m-0 font-semibold tabular-nums", k.paymentSavings < 0 && "text-loss")}>{formatUSD(k.paymentSavings)}</dd>
        </div>
        <div className={row}>
          <dt>Closing costs</dt>
          <dd className="m-0 font-semibold tabular-nums">{formatUSD(-k.closingCostsPaid)}</dd>
        </div>
        <div className={row}>
          <dt>Additional equity</dt>
          <dd className={cn("m-0 font-semibold tabular-nums", k.additionalEquity < 0 && "text-loss")}>{formatUSD(k.additionalEquity)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 pt-2 text-[17px] font-extrabold">
          <dt>Net after {period}</dt>
          <dd className={cn("m-0 tabular-nums", k.net < 0 && "text-loss")}>{netText(k)}</dd>
        </div>
      </dl>

      {k.closingCostsFinanced > 0 && (
        <p className="mt-3 text-[13px] text-muted">
          {formatUSD(k.closingCostsFinanced)} of closing costs are added to the loan, so they are counted in the equity, not here.
        </p>
      )}
      {k.cashBorrowed > 0 && (
        <p className="mt-3 text-[13px] text-muted">
          The new loan includes {formatUSD(k.cashBorrowed)} borrowed on top of the balance. That money is not counted as savings; it is part of why more is owed.
        </p>
      )}
    </div>
  );
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

      {r.keep && <KeepBlock keep={r.keep} />}

      {months !== null && months > 0 && (
        <BreakevenChart monthlySavings={r.monthlySavings} closingCosts={r.closingCosts} breakevenMonths={months} />
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
