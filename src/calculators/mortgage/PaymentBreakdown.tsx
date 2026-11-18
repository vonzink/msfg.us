"use client";

import { useState } from "react";
import { formatUSD } from "@/lib/finance";
import { Donut, type DonutSlice } from "../shared/Donut";
import { paymentBreakdown, type MortgageResult, type PaymentPart } from "./math";
import { MONTHS } from "./dates";

const COLOURS: Record<PaymentPart["key"], Pick<DonutSlice, "stroke" | "swatch">> = {
  principal: { stroke: "stroke-chart-1", swatch: "bg-chart-1" },
  interest: { stroke: "stroke-chart-2", swatch: "bg-chart-2" },
  tax: { stroke: "stroke-chart-3", swatch: "bg-chart-3" },
  insurance: { stroke: "stroke-chart-4", swatch: "bg-chart-4" },
  hoa: { stroke: "stroke-muted", swatch: "bg-muted" },
  pmi: { stroke: "stroke-ink", swatch: "bg-ink" },
  extra: { stroke: "stroke-green-700", swatch: "bg-green-700" },
};

const share = (x: number) => `${(x * 100).toFixed(1)}%`;

/**
 * One payment at a time: a slider walks from the first payment to the last, and the ring shows how
 * that payment splits. Early payments are mostly interest; the slider shows it shifting to principal.
 *
 * Kept on purpose. The first design removed this slider to simplify the page and the owner
 * reversed that after testing: see "The payment slider stays" in
 * docs/superpowers/specs/2026-11-18-public-calculators-design.md. Do not replace it with a static chart.
 */
export function PaymentBreakdown({ result, start }: {
  result: MortgageResult;
  /** null until the browser has supplied today's date; the payment is then named by loan year. */
  start: { month: number; year: number } | null;
}) {
  const [chosen, setChosen] = useState(1);
  const b = paymentBreakdown(result, chosen);
  if (!b) return null;

  const last = result.schedule.length;
  const when = start ? `${MONTHS[b.month]} ${b.year}` : `Year ${b.loanYear}`;
  const label = `Payment ${b.paymentNum} of ${last}`;

  return (
    <div className="grid gap-3 rounded-xl border border-line bg-white p-5 shadow-card max-[600px]:p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-[17px] font-bold">Where each payment goes</h2>
        <label htmlFor="mortgage-breakdown-month" className="text-[14px] font-semibold tabular-nums text-muted">
          {label} · {when}
        </label>
      </div>
      <input
        id="mortgage-breakdown-month"
        type="range"
        min={1}
        max={last}
        step={1}
        value={b.paymentNum}
        aria-valuetext={`${label}, ${when}, ${formatUSD(b.total)}`}
        onChange={(e) => setChosen(Number(e.target.value))}
        className="w-full accent-spring-2"
      />
      <p className="flex justify-between text-[12px] text-muted">
        <span>First payment</span>
        <span>Slide to see any payment</span>
        <span>Last payment</span>
      </p>

      <Donut
        title="This payment"
        total={formatUSD(b.total)}
        slices={b.parts.map((p) => ({ label: p.label, value: p.value, ...COLOURS[p.key] }))}
      />

      <dl className="m-0 grid gap-1.5 text-[14px]">
        <div className="flex items-baseline gap-2">
          <dt className="text-muted">Principal vs. interest</dt>
          <dd className="m-0 ml-auto font-semibold tabular-nums">
            {share(b.principalShare)} principal, {share(b.interestShare)} interest
          </dd>
        </div>
        <div aria-hidden="true" className="flex h-2 overflow-hidden rounded-full bg-chart-2">
          <span className="bg-chart-1" style={{ width: share(b.principalShare) }} />
        </div>
        <div className="flex items-baseline gap-2">
          <dt className="text-muted">Remaining balance</dt>
          <dd className="m-0 ml-auto font-semibold tabular-nums">{formatUSD(b.balance)}</dd>
        </div>
      </dl>
    </div>
  );
}
