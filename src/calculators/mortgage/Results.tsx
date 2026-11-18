import { formatUSD } from "@/lib/finance";
import { SeriesChart } from "../shared/Charts";
import { Donut } from "../shared/Donut";
import { Stat } from "../shared/Stat";
import type { MortgageResult } from "./math";

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "30 years", "20 years 5 months", "7 months". */
export function duration(months: number): string {
  const y = Math.floor(months / 12);
  const m = months % 12;
  const years = y ? `${y} year${y === 1 ? "" : "s"}` : "";
  const rest = m ? `${m} month${m === 1 ? "" : "s"}` : "";
  return [years, rest].filter(Boolean).join(" ") || "0 months";
}

/**
 * The results column of the Mortgage calculator. `result` is null when the inputs do not make a
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

      <Donut
        title="Where the payment goes"
        total={formatUSD(first.total)}
        slices={[
          { label: "Principal and interest", value: first.principalAndInterest, stroke: "stroke-chart-1", swatch: "bg-chart-1" },
          { label: "Property tax", value: first.tax, stroke: "stroke-chart-2", swatch: "bg-chart-2" },
          { label: "Homeowners insurance", value: first.insurance, stroke: "stroke-chart-3", swatch: "bg-chart-3" },
          { label: "HOA dues", value: first.hoa, stroke: "stroke-chart-4", swatch: "bg-chart-4" },
          { label: "Mortgage insurance", value: first.pmi, stroke: "stroke-green-700", swatch: "bg-green-700" },
        ]}
      />

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

      <details data-calc-panel className="group rounded-xl border border-line bg-white shadow-card print:shadow-none">
        <summary className="flex cursor-pointer list-none items-center gap-3 rounded-xl px-5 py-4 max-[600px]:px-4 [&::-webkit-details-marker]:hidden">
          <span className="text-[17px] font-bold">Year-by-year schedule</span>
          <span
            aria-hidden="true"
            className="ml-auto size-2.5 flex-none -translate-y-0.5 rotate-45 border-b-2 border-r-2 border-muted transition-transform group-open:translate-y-0.5 group-open:-rotate-135 print:hidden"
          />
        </summary>
        <div className="overflow-x-auto px-5 pb-5 max-[600px]:px-4">
          <table className="w-full border-collapse text-right text-[14px] tabular-nums">
            <caption className="sr-only">Amortization schedule by year</caption>
            <thead>
              <tr className="border-b border-line text-[12px] text-muted">
                <th scope="col" className="py-2 text-left font-semibold">Year</th>
                <th scope="col" className="py-2 font-semibold">Principal</th>
                <th scope="col" className="py-2 font-semibold">Interest</th>
                {hasExtra && <th scope="col" className="py-2 font-semibold">Extra</th>}
                <th scope="col" className="py-2 font-semibold">Balance</th>
              </tr>
            </thead>
            <tbody>
              {r.years.map((y) => (
                <tr key={y.year} className="border-b border-line last:border-0">
                  <th scope="row" className="py-1.5 text-left font-semibold">Year {y.year}</th>
                  <td className="py-1.5">{formatUSD(y.principal)}</td>
                  <td className="py-1.5">{formatUSD(y.interest)}</td>
                  {hasExtra && <td className="py-1.5">{formatUSD(y.extra)}</td>}
                  <td className="py-1.5">{formatUSD(y.endBalance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <p className="mx-1 text-[13px] text-muted">{disclaimer}</p>
    </>
  );
}
