"use client";

import { useId } from "react";

export function PlaceStep({
  fieldLabel,
  placeholder,
  value,
  onChange,
  onNext,
}: {
  /** Floating-label text (e.g. "City, State, or ZIP code"). */
  fieldLabel: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  /** Advance to the next step (Next button or Enter key). */
  onNext: () => void;
}) {
  const id = useId();

  return (
    <>
      <div className="relative mb-3.5 text-left">
        <label
          htmlFor={id}
          className="pointer-events-none absolute left-[18px] top-3 text-[12.5px] font-semibold text-muted"
        >
          {fieldLabel}
        </label>
        <input
          id={id}
          autoFocus
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onNext();
          }}
          className="h-[68px] w-full rounded-lg border-[1.5px] border-line bg-white px-[18px] pb-2 pt-[22px] text-[18px] font-semibold text-ink shadow-3d outline-none transition-colors duration-150 placeholder:font-medium placeholder:text-[#9aa39c] focus:border-2 focus:border-green-600"
        />
      </div>
      <button
        type="button"
        onClick={onNext}
        className="mt-2 h-[66px] w-full rounded-lg bg-green-600 text-[18px] font-bold text-white transition-[transform,background,box-shadow] duration-150 [box-shadow:0_3px_0_#0a3a2a,var(--shadow-3d)] hover:-translate-y-0.5 hover:bg-green-700 hover:[box-shadow:0_5px_0_#0a3a2a,var(--shadow-pop)] active:translate-y-px"
      >
        Next
      </button>
    </>
  );
}
