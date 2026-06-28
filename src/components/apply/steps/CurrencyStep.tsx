"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { formatCurrency, parseCurrency, parsePercent, reformatAmount } from "@/lib/applyFields";

/** Numeric input. `unit` "$" (default) → leading $, thousands-formatted; "%" →
 *  trailing %, 0–100. Stores number | null. `optional` shows a Skip link. */
export function CurrencyStep({
  field,
  placeholder,
  optional,
  unit = "$",
  toggle,
  onUnitChange,
  value,
  onChange,
  onNext,
  onSkip,
}: {
  field: string;
  placeholder?: string;
  optional?: boolean;
  unit?: "$" | "%";
  toggle?: boolean;
  onUnitChange?: (u: "$" | "%") => void;
  value: number | null;
  onChange: (n: number | null) => void;
  onNext: () => void;
  onSkip: () => void;
}) {
  const id = useId();
  const isPct = unit === "%";

  // Local display buffer. The input is driven by this string, NOT by the parent
  // value re-formatted on every render — that round-trip (keystroke → parent
  // setState → re-render → re-format) is what dropped fast keystrokes (QA #2).
  const inputRef = useRef<HTMLInputElement>(null);
  const caretRef = useRef<number | null>(null);
  const [text, setText] = useState(() =>
    value == null ? "" : isPct ? String(value) : formatCurrency(value),
  );

  // Re-sync the buffer when the value/unit change from *outside* this input
  // (unit toggle, Skip/reset, restored answer) — never while the user is typing
  // (parse(text) === value means we are already in sync, so leave it alone).
  // Adjusting state during render (React's recommended pattern) rather than in an
  // effect, so the reconciled value paints in one pass without a cascading render.
  const [synced, setSynced] = useState<{ value: number | null; isPct: boolean }>({ value, isPct });
  if (synced.value !== value || synced.isPct !== isPct) {
    setSynced({ value, isPct });
    const current = isPct ? parsePercent(text) : parseCurrency(text);
    if (current !== value) {
      setText(value == null ? "" : isPct ? String(value) : formatCurrency(value));
    }
  }

  // Restore the caret after a reformat re-render so grouping commas never jump it.
  useLayoutEffect(() => {
    if (caretRef.current != null && inputRef.current) {
      inputRef.current.setSelectionRange(caretRef.current, caretRef.current);
      caretRef.current = null;
    }
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const r = reformatAmount(e.target.value, e.target.selectionStart ?? e.target.value.length, unit);
    caretRef.current = r.caret;
    setText(r.text);
    onChange(r.value);
  };

  return (
    <>
      {toggle && (
        <div className="mb-3.5 flex gap-2" role="group" aria-label="Down payment unit">
          {(["%", "$"] as const).map((u) => (
            <button
              key={u}
              type="button"
              aria-pressed={unit === u}
              onClick={() => onUnitChange?.(u)}
              className={cn(
                "h-11 flex-1 rounded-lg border-[1.5px] text-[15px] font-bold transition-colors duration-150",
                unit === u
                  ? "border-green-600 bg-green-600 text-white"
                  : "border-line bg-white text-ink hover:border-green-600",
              )}
            >
              {u === "%" ? "Percent" : "Amount"}
            </button>
          ))}
        </div>
      )}
      <div className="relative mb-3.5 text-left">
        <label htmlFor={id} className="sr-only">{field}</label>
        {!isPct && (
          <span aria-hidden className="pointer-events-none absolute left-[18px] top-1/2 -translate-y-1/2 text-[18px] font-semibold text-muted">$</span>
        )}
        {isPct && (
          <span aria-hidden className="pointer-events-none absolute right-[18px] top-1/2 -translate-y-1/2 text-[18px] font-semibold text-muted">%</span>
        )}
        <input
          id={id}
          ref={inputRef}
          autoFocus
          inputMode="numeric"
          value={text}
          placeholder={placeholder}
          onChange={handleChange}
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
