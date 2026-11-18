import { formatUSD } from "@/lib/finance";
import { SeriesChart } from "../shared/Charts";
import { Stat } from "../shared/Stat";
import type { BuydownPeriod, BuydownResult } from "./math";

const percent = (rate: number) => `${Number((rate * 100).toFixed(3))}%`;
const periodLabel = (p: BuydownPeriod) => (p.reduced ? `Year ${p.year}` : `Year ${p.year} onward`);
const num = "px-2.5 py-2 text-right tabular-nums";

/** Says plainly whether the payments shown are the whole housing payment or only part of it. */
export function whatIsIncluded(r: BuydownResult): string {
  return r.monthlyExtras > 0
    ? "These payments include the property tax, insurance and HOA dues you entered."
    : "These payments are principal and interest only. Property tax, insurance and HOA dues are not included.";
}

/** Each reduced year and then the full rate. Shown in the results, and again on the printed page. */
export function PaymentTable({ result: r }: { result: BuydownResult }) {
  const { full } = r;
  return (
    <div className="rounded-xl border border-line bg-white p-5 shadow-card max-[600px]:p-4 print:border-0 print:p-0 print:shadow-none">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[14px]">
          <caption className="mb-2 text-left text-[17px] font-bold">Payment by year</caption>
          <thead>
            <tr className="border-b-2 border-line text-[12px] text-muted">
              <th scope="col" className="py-2 pr-2.5 text-left font-semibold">Period</th>
              <th scope="col" className="px-2.5 py-2 text-right font-semibold">Rate</th>
              <th scope="col" className="px-2.5 py-2 text-right font-semibold">Monthly payment</th>
              <th scope="col" className="px-2.5 py-2 text-right font-semibold">Full payment</th>
              <th scope="col" className="px-2.5 py-2 text-right font-semibold">Monthly savings</th>
            </tr>
          </thead>
          <tbody>
            {r.periods.map((p) => (
              <tr key={p.year} className="border-b border-line last:border-0">
                <th scope="row" className="py-2 pr-2.5 text-left font-semibold">{periodLabel(p)}</th>
                <td className={num}>{percent(p.rate)}</td>
                <td className={`${num} font-semibold`}>{formatUSD(p.total)}</td>
                <td className={`${num} font-semibold`}>{formatUSD(full.total)}</td>
                <td className={num}>{p.reduced ? formatUSD(p.monthlySavings) : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {r.flooredAtZero && (
        <p className="mt-3 text-[13px] text-muted">A rate cannot go below 0%, so any year that would is shown at 0%.</p>
      )}
    </div>
  );
}

/**
 * The results column of the Rate buydown calculator. `result` is null when there is no loan amount
 * or rate yet. Wherever a reduced payment is shown, the full payment is shown as prominently: a
 * page that led with only the low first-year payment would mislead.
 */
export function BuydownResults({ result: r, disclaimer }: { result: BuydownResult | null; disclaimer: string }) {
  if (!r) {
    return (
      <div role="status" className="rounded-xl border border-line bg-white p-6 text-[16px] text-muted shadow-card">
        Enter a loan amount and an interest rate to see what a buydown costs.
      </div>
    );
  }

  const first = r.periods[0];
  const { full } = r;

  return (
    <>
      <div className="rounded-xl bg-green-800 p-6 text-on-dark shadow-card print:border print:border-ink print:bg-transparent print:text-ink print:shadow-none">
        <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-mint print:text-muted">
          Estimated buydown cost
        </p>
        <p aria-live="polite" className="mt-1 text-[clamp(40px,5vw,58px)] font-extrabold leading-[1.05] tracking-[-0.02em] tabular-nums text-white print:text-ink">
          {formatUSD(r.totalCost)}
        </p>
        <p className="mt-1.5 text-[16px] text-on-dark-2 print:text-ink">
          Paid up front to fund the lower payments. A seller, builder or lender credit often covers it.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 max-[600px]:grid-cols-1">
        <Stat
          label="Year 1 payment"
          value={formatUSD(first.total)}
          sub={`at ${percent(first.rate)}, saving ${formatUSD(first.monthlySavings)} a month`}
          tip="The monthly payment in the first year, while the buydown is paying part of it."
        />
        <Stat
          label={`Payment from year ${full.year}`}
          value={formatUSD(full.total)}
          sub="the full payment, for the rest of the loan"
          tip="The monthly payment at the loan's full rate, once the reduced period has ended."
        />
      </div>

      <PaymentTable result={r} />

      <SeriesChart
        kind="bars"
        title="Monthly payment by year"
        series={[
          { label: "With buydown", data: r.periods.map((p) => p.total) },
          { label: "Full payment", data: r.periods.map(() => full.total) },
        ]}
      />

      <p className="mx-1 text-[15px] font-semibold text-ink">
        When the reduced period ends, the payment returns to {formatUSD(full.total)} a month.
      </p>
      <p className="mx-1 text-[14px] text-ink">{whatIsIncluded(r)}</p>
      <p className="mx-1 text-[13px] text-muted">{disclaimer}</p>
    </>
  );
}
