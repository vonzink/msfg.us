import type { ReactNode } from "react";
import { formatUSD } from "@/lib/finance";
import type { MortgageInput, MortgageResult } from "./math";
import { duration, MONTHS } from "./dates";

const trim = (x: number, places: number) => String(Number(x.toFixed(places)));
const EXTRA = { monthly: "every month", annually: "once a year", "one-time": "with the first payment" } as const;

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-1">
      <dt className="text-muted">{label}</dt>
      <dd className="m-0 font-semibold tabular-nums">{children}</dd>
    </div>
  );
}

/**
 * The top of the printed page: what was entered and what it comes to, side by side. Hidden on
 * screen. The amortization schedule prints underneath it.
 */
export function PrintSummary({ input, result: r, start }: {
  input: MortgageInput;
  result: MortgageResult;
  start: { month: number; year: number } | null;
}) {
  const downPct = (input.downPayment / input.homePrice) * 100;
  return (
    <section aria-label="Estimate summary" className="hidden text-[12px] print:block">
      <h2 className="text-[18px] font-extrabold tracking-[-0.01em]">Mortgage payment estimate</h2>
      <div className="mt-3 grid grid-cols-2 gap-x-10">
        <div>
          <h3 className="mb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">The loan</h3>
          <dl className="m-0">
            <Row label="Home price">{formatUSD(input.homePrice)}</Row>
            <Row label="Down payment">{formatUSD(input.downPayment)} ({trim(downPct, 2)}%)</Row>
            <Row label="Loan amount">{formatUSD(r.loanAmount)}</Row>
            <Row label="Interest rate">{trim(input.annualRate * 100, 3)}%</Row>
            <Row label="Loan term">{duration(input.termYears * 12)}</Row>
            {start && <Row label="First payment">{MONTHS[start.month]} {start.year}</Row>}
            <Row label="Property tax">{formatUSD(r.first.tax * 12)} a year</Row>
            <Row label="Homeowners insurance">{formatUSD(r.first.insurance * 12)} a year</Row>
            {r.first.hoa > 0 && <Row label="HOA dues">{formatUSD(r.first.hoa)} a month</Row>}
            {r.first.pmi > 0 && <Row label="Mortgage insurance">{formatUSD(r.first.pmi)} a month, until payment {r.pmiEndPayment}</Row>}
            {r.extra.amount > 0 && <Row label="Extra principal">{formatUSD(r.extra.amount)} {EXTRA[r.extra.frequency]}</Row>}
          </dl>
        </div>
        <div>
          <h3 className="mb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">The estimate</h3>
          <dl className="m-0">
            <Row label="Monthly payment">{formatUSD(r.first.total)}</Row>
            <Row label="Principal and interest">{formatUSD(r.first.principalAndInterest)}</Row>
            <Row label="Property tax">{formatUSD(r.first.tax)}</Row>
            <Row label="Homeowners insurance">{formatUSD(r.first.insurance)}</Row>
            {r.first.hoa > 0 && <Row label="HOA dues">{formatUSD(r.first.hoa)}</Row>}
            {r.first.pmi > 0 && <Row label="Mortgage insurance">{formatUSD(r.first.pmi)}</Row>}
            <Row label="Total interest">{formatUSD(r.totalInterest)}</Row>
            <Row label="Total of all payments">{formatUSD(r.totalCost)}</Row>
            <Row label="Paid off">{start ? `${MONTHS[r.payoff.month]} ${r.payoff.year}` : `after ${duration(r.schedule.length)}`}</Row>
            {r.extra.amount > 0 && <Row label="Saved by the extra principal">{formatUSD(r.interestSaved)} and {duration(r.monthsSaved)}</Row>}
          </dl>
        </div>
      </div>
    </section>
  );
}
