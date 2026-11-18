"use client";

import { Fragment, useState } from "react";
import { formatUSD, formatUSDCents } from "@/lib/finance";
import { cn } from "@/lib/cn";
import type { MortgageResult, ScheduleRow } from "./math";
import { MONTHS } from "./dates";

type Start = { month: number; year: number } | null;

const num = "px-2.5 py-1.5 text-right tabular-nums";

/** The payments of one loan year, to the cent. Rendered under that year's row when it is open. */
export function PaymentRows({ rows, start, showExtra, showPmi }: {
  rows: ScheduleRow[];
  start: Start;
  showExtra: boolean;
  showPmi: boolean;
}) {
  return (
    <>
      {rows.map((row) => (
        <tr key={row.paymentNum} className="border-b border-line/60 text-[13px] text-muted print:break-inside-avoid">
          <th scope="row" className="py-1.5 pl-9 pr-2.5 text-left font-normal tabular-nums">Payment {row.paymentNum}</th>
          <td className="px-2.5 py-1.5 text-left">{start ? `${MONTHS[row.month]} ${row.year}` : ""}</td>
          <td className={num}>{formatUSDCents(row.principal)}</td>
          <td className={num}>{formatUSDCents(row.interest)}</td>
          {showExtra && <td className={num}>{formatUSDCents(row.extra)}</td>}
          {showPmi && <td className={num}>{formatUSDCents(row.pmi)}</td>}
          <td className={num}>{formatUSDCents(row.totalMonthly)}</td>
          <td className={num}>{formatUSDCents(row.balance)}</td>
        </tr>
      ))}
    </>
  );
}

/**
 * The full amortization schedule, at page width: one row per loan year, each opening to its
 * payments. Printing shows the schedule as it is on screen, so "Show every payment" before
 * printing gives the complete payment-by-payment schedule.
 */
export function Schedule({ result: r, start }: { result: MortgageResult; start: Start }) {
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set());
  const showExtra = r.extra.amount > 0;
  const showPmi = r.years.some((y) => y.pmi > 0);
  const allOpen = open.size === r.years.length;
  const toggle = (year: number) =>
    setOpen((was) => {
      const next = new Set(was);
      if (!next.delete(year)) next.add(year);
      return next;
    });

  return (
    <section aria-label="Amortization schedule" className="mt-7 rounded-xl border border-line bg-white shadow-card print:mt-5 print:border-0 print:shadow-none">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 max-[600px]:px-4 print:px-0 print:py-2">
        <h2 className="text-[20px] font-extrabold tracking-[-0.01em] print:text-[15px]">Amortization schedule</h2>
        <button
          type="button"
          className="rounded-md border border-line bg-white px-3.5 py-2 text-[14px] font-bold text-ink hover:bg-paper-2 print:hidden"
          onClick={() => setOpen(allOpen ? new Set() : new Set(r.years.map((y) => y.year)))}
        >
          {allOpen ? "Hide the payments" : "Show every payment"}
        </button>
      </div>
      <div className="overflow-x-auto px-5 pb-5 max-[600px]:px-4 print:overflow-visible print:px-0 print:pb-0">
        <table className="w-full min-w-[640px] border-collapse text-[14px] print:min-w-0 print:text-[11px]">
          <caption className="sr-only">Amortization schedule</caption>
          <thead>
            <tr className="border-b-2 border-line text-[12px] text-muted print:text-[10px]">
              <th scope="col" className="py-2 pr-2.5 text-left font-semibold">Year</th>
              <th scope="col" className="px-2.5 py-2 text-left font-semibold">{start ? "Dates" : "Payments"}</th>
              <th scope="col" className="px-2.5 py-2 text-right font-semibold">Principal</th>
              <th scope="col" className="px-2.5 py-2 text-right font-semibold">Interest</th>
              {showExtra && <th scope="col" className="px-2.5 py-2 text-right font-semibold">Extra</th>}
              {showPmi && <th scope="col" className="px-2.5 py-2 text-right font-semibold">Mortgage ins.</th>}
              <th scope="col" className="px-2.5 py-2 text-right font-semibold">Total paid</th>
              <th scope="col" className="px-2.5 py-2 text-right font-semibold">Balance</th>
            </tr>
          </thead>
          <tbody>
            {r.years.map((y) => {
              const rows = r.schedule.slice((y.year - 1) * 12, y.year * 12);
              const first = rows[0];
              const last = rows[rows.length - 1];
              const isOpen = open.has(y.year);
              return (
                <Fragment key={y.year}>
                  <tr className={cn("border-b border-line font-semibold print:break-inside-avoid", isOpen && "bg-paper-2")}>
                    <th scope="row" className="py-1.5 pr-2.5 text-left">
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        aria-label={`Year ${y.year}: ${isOpen ? "hide" : "show"} its payments`}
                        onClick={() => toggle(y.year)}
                        className="flex items-center gap-2.5 rounded-sm py-0.5 font-bold text-ink hover:text-green-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-spring-2"
                      >
                        <span
                          aria-hidden="true"
                          className={cn("size-2 flex-none border-b-2 border-r-2 border-muted transition-transform print:hidden", isOpen ? "rotate-45" : "-rotate-45")}
                        />
                        Year {y.year}
                      </button>
                    </th>
                    <td className="px-2.5 py-1.5 text-left font-normal text-muted">
                      {start
                        ? `${MONTHS[first.month]} ${first.year} to ${MONTHS[last.month]} ${last.year}`
                        : `Payments ${first.paymentNum} to ${last.paymentNum}`}
                    </td>
                    <td className={num}>{formatUSD(y.principal)}</td>
                    <td className={num}>{formatUSD(y.interest)}</td>
                    {showExtra && <td className={num}>{formatUSD(y.extra)}</td>}
                    {showPmi && <td className={num}>{formatUSD(y.pmi)}</td>}
                    <td className={num}>{formatUSD(y.paid)}</td>
                    <td className={num}>{formatUSD(y.endBalance)}</td>
                  </tr>
                  {isOpen && <PaymentRows rows={rows} start={start} showExtra={showExtra} showPmi={showPmi} />}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
