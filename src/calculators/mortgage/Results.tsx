import { formatUSD } from "@/lib/finance";
import { SeriesChart } from "../shared/Charts";
import { Stat } from "../shared/Stat";
import type { MortgageResult } from "./math";
import { duration, MONTHS } from "./dates";
import { PaymentBreakdown } from "./PaymentBreakdown";

/**
 * The results column of the Mortgage calculator. The schedule sits below it at page width. `result` is null when the inputs do not make a
 * loan yet. `start` is null until the browser has supplied today's date, and until then the payoff
 * is given as a length of time instead of a calendar month.
 */
export function MortgageResults({ result: r, start, disclaimer }: {
  result: MortgageResult | null;
  start: { month: number; year: number } | null;
  disclaimer: string;
}) {
  if (!r) {
    return (
      <div role="status" className="rounded-xl border border-line bg-white p-6 text-[16px] text-muted shadow-card">
        Enter a home price, a down payment smaller than the price, a rate and a term to see your payment.
      </div>
    );
  }

  const { first } = r;
  const hasExtra = r.extra.amount > 0;
  const hasPmi = first.pmi > 0;
  const needsPmiPrompt = r.ltv > 80 && !hasPmi;
  const payoff = start ? `${MONTHS[r.payoff.month]} ${r.payoff.year}` : duration(r.schedule.length);

  return (
    <>
      <div className="rounded-xl bg-green-800 p-6 text-on-dark shadow-card print:border print:border-ink print:bg-transparent print:text-ink print:shadow-none">
        <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-mint print:text-muted">
          Estimated monthly payment
        </p>
        <p aria-live="polite" className="mt-1 text-[clamp(40px,5vw,58px)] font-extrabold leading-[1.05] tracking-[-0.02em] tabular-nums text-white print:text-ink">
          {formatUSD(first.total)}
        </p>
        <p className="mt-1.5 text-[16px] text-on-dark-2 print:text-ink">
          <strong className="text-white print:text-ink">{formatUSD(first.principalAndInterest)}</strong> principal and
          interest on a {formatUSD(r.loanAmount)} loan.
        </p>
        {r.extra.amount > 0 && (
          <p className="mt-1.5 text-[14px] text-on-dark-2 print:text-ink">
            Plus {formatUSD(r.extra.amount)} extra principal{" "}
            {r.extra.frequency === "monthly"
              ? `every month, ${formatUSD(first.total + r.extra.amount)} in all.`
              : r.extra.frequency === "annually"
                ? "once a year."
                : "with the first payment."}
          </p>
        )}
        {hasPmi && (
          <p className="mt-1.5 text-[14px] text-on-dark-2 print:text-ink">
            Includes mortgage insurance until payment {r.pmiEndPayment}.
          </p>
        )}
        {needsPmiPrompt && (
          <p className="mt-1.5 text-[14px] text-on-dark-2 print:text-ink">
            With less than 20% down, most conventional loans add mortgage insurance. Add it under Add detail.
          </p>
        )}
      </div>

      <PaymentBreakdown result={r} start={start} />

      <div className="grid grid-cols-2 gap-3 max-[600px]:grid-cols-1">
        <Stat
          label="Total interest"
          value={formatUSD(r.totalInterest)}
          sub={`over ${duration(r.schedule.length)}`}
          tip="All the interest paid from the first payment to the last, at the rate entered."
        />
        <Stat
          label="Paid off"
          value={payoff}
          sub={start ? `after ${duration(r.schedule.length)}` : "from the first payment"}
          tip="When the balance reaches zero if every payment is made as scheduled."
        />
        {hasExtra && (
          <>
            <Stat
              label="Interest saved"
              value={formatUSD(r.interestSaved)}
              sub="from the extra principal"
              tip="Interest you avoid by paying the extra principal, compared with the regular schedule."
            />
            <Stat
              label="Time saved"
              value={duration(r.monthsSaved)}
              sub="paid off sooner"
              tip="How much earlier the loan is paid off with the extra principal."
            />
          </>
        )}
      </div>

      <SeriesChart
        kind="lines"
        title="Loan balance at the end of each year"
        series={[{ label: "Balance", data: r.years.map((y) => y.endBalance) }]}
      />

      <p className="mx-1 text-[13px] text-muted">{disclaimer}</p>
    </>
  );
}
