"use client";

import { useId } from "react";
import { cn } from "@/lib/cn";
import { formatCurrency, parseCurrency, parsePercent } from "@/lib/applyFields";

/** Numeric input. `unit` "$" (default) → leading $, thousands-formatted; "%" →
 *  trailing %, 0–100. Stores number | null. `optional` shows a Skip link. */
export function CurrencyStep({
  field,
  placeholder,
  optional,
  unit = "$",
  value,
  onChange,
  onNext,
  onSkip,
}: {
  field: string;
  placeholder?: string;
  optional?: boolean;
  unit?: "$" | "%";
  value: number | null;
  onChange: (n: number | null) => void;
  onNext: () => void;
  onSkip: () => void;
}) {
  const id = useId();
  const isPct = unit === "%";
  const display = isPct ? (value == null ? "" : String(value)) : formatCurrency(value);
  const parse = isPct ? parsePercent : parseCurrency;

  return (
    <>
      <div className="relative mb-3.5 text-left">
        <label htmlFor={id} className="sr-only">{field}</label>
        {!isPct && (
          <span className="pointer-events-none absolute left-[18px] top-1/2 -translate-y-1/2 text-[18px] font-semibold text-muted">$</span>
        )}
        {isPct && (
          <span className="pointer-events-none absolute right-[18px] top-1/2 -translate-y-1/2 text-[18px] font-semibold text-muted">%</span>
        )}
        <input
          id={id}
          autoFocus
          inputMode="numeric"
          value={display}
          placeholder={placeholder}
          onChange={(e) => onChange(parse(e.target.value))}
          onKeyDown={(e) => { if (e.key === "Enter") onNext(); }}
          className={cn(
            "h-[68px] w-full rounded-lg border-[1.5px] border-line bg-white text-[18px] font-semibold text-ink shadow-3d outline-none transition-colors duration-150 placeholder:font-medium placeholder:text-[#9aa39c] focus:border-2 focus:border-green-600",
            isPct ? "pl-[18px] pr-[34px]" : "pl-[34px] pr-[18px]",
          )}
        />
      </div>

      <button
        type="button"
        onClick={onNext}
        disabled={value == null}
        aria-disabled={value == null}
        className={cn(
          "mt-2 h-[66px] w-full rounded-lg text-[18px] font-bold text-white transition-[transform,background,box-shadow] duration-150",
          value != null
            ? "bg-green-600 [box-shadow:0_3px_0_#0a3a2a,var(--shadow-3d)] hover:-translate-y-0.5 hover:bg-green-700 hover:[box-shadow:0_5px_0_#0a3a2a,var(--shadow-pop)] active:translate-y-px"
            : "cursor-default bg-[#cfd6cd]",
        )}
      >
        Next
      </button>

      {optional && (
        <button
          type="button"
          onClick={onSkip}
          className="mt-3.5 inline-block text-[15px] font-bold text-green-600 hover:underline"
        >
          Skip this for now
        </button>
      )}
    </>
  );
}
