"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { monthlyPayment, formatUSD } from "@/lib/finance";
import {
  RATE_DATA,
  RATES_PRINCIPAL,
  type RateRow,
  type RateTab,
} from "@/content/rates";

const TABS: { id: RateTab; label: string }[] = [
  { id: "purchase", label: "Purchase" },
  { id: "refinance", label: "Refinance" },
];

/** Shared grid template: Product / Rate / APR / Points / Est. monthly*.
 *  Collapses to a 2-col stack under 900px. */
const GRID =
  "grid grid-cols-[1.5fr_1fr_1fr_0.9fr_1.2fr] items-center gap-3 max-[900px]:grid-cols-2 max-[900px]:gap-x-3 max-[900px]:gap-y-2";

function RateRowCard({ row }: { row: RateRow }) {
  const est = monthlyPayment(RATES_PRINCIPAL, row.rate, row.termMonths);
  return (
    <div
      className={cn(
        GRID,
        "mb-3 rounded-lg border-[1.5px] border-line bg-white px-6 py-5 shadow-3d",
        "transition-[transform,box-shadow,border-color] duration-150 ease-out",
        "hover:-translate-y-0.5 hover:border-green-600 hover:shadow-pop motion-reduce:hover:translate-y-0",
      )}
    >
      {/* Product */}
      <div className="text-[17px] font-extrabold">
        {row.product}
        <small className="mt-0.5 block text-[12.5px] font-semibold text-muted">
          {row.subLabel}
        </small>
      </div>

      {/* Rate */}
      <div className="text-[26px] font-extrabold tracking-[-0.02em] max-[900px]:text-right">
        {row.rate.toFixed(3)}%
      </div>

      {/* APR */}
      <div className="text-[18px] font-bold text-ink">
        <span className="hidden text-[11px] font-bold uppercase tracking-[0.04em] text-muted max-[900px]:mr-2 max-[900px]:inline">
          APR
        </span>
        {row.apr.toFixed(3)}%
      </div>

      {/* Points */}
      <div className="text-[15px] font-semibold text-muted max-[900px]:text-right">
        {row.points}
      </div>

      {/* Est. monthly + apply link */}
      <div className="text-right max-[900px]:text-left">
        <div className="text-[18px] font-extrabold">{formatUSD(est)}/mo</div>
        <Link
          href={`/apply/${row.applyIntent}`}
          className="inline-flex items-center gap-1 text-[12.5px] font-bold text-green-600 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-spring-3"
        >
          Get my rate
          <ArrowRight size={13} aria-hidden />
          <span className="sr-only"> for {row.product} {row.subLabel}</span>
        </Link>
      </div>
    </div>
  );
}

export function RateTable() {
  const [tab, setTab] = useState<RateTab>("purchase");
  const baseId = useId();

  return (
    <div className="mx-auto max-w-[980px]">
      {/* Segmented Purchase / Refinance toggle (accessible tablist) */}
      <div
        role="tablist"
        aria-label="Rate type"
        className="mx-auto mb-9 flex w-fit gap-1 rounded-full border border-line bg-paper-2 p-1"
      >
        {TABS.map((t) => {
          const selected = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`${baseId}-tab-${t.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel`}
              onClick={() => setTab(t.id)}
              className={cn(
                "cursor-pointer rounded-full px-5 py-[9px] text-[14px] font-bold transition-colors duration-200",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-spring-3",
                selected
                  ? "bg-spring text-[#04130c]"
                  : "text-muted hover:text-ink",
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Header row (hidden under 900px) */}
      <div
        aria-hidden
        className={cn(
          GRID,
          "px-6 pb-3.5 text-[12px] font-bold uppercase tracking-[0.04em] text-muted max-[900px]:hidden",
        )}
      >
        <div>Product</div>
        <div>Rate</div>
        <div>APR</div>
        <div>Points</div>
        <div className="text-right">Est. monthly*</div>
      </div>

      {/* Rows */}
      <div
        role="tabpanel"
        id={`${baseId}-panel`}
        aria-labelledby={`${baseId}-tab-${tab}`}
      >
        {RATE_DATA[tab].map((row) => (
          <RateRowCard key={`${row.product}-${row.subLabel}`} row={row} />
        ))}
      </div>
    </div>
  );
}
