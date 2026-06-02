"use client";

import { cn } from "@/lib/cn";

/**
 * Accessible toggle (role="switch"). Matches the prototype's AI-mode switch:
 * green track + knob-left when on, grey track + knob-right when off.
 */
export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-[26px] w-[46px] shrink-0 cursor-pointer rounded-full border-0 p-0 transition-colors duration-200",
        checked ? "bg-spring" : "bg-[#c8cfc6]",
      )}
    >
      <span
        className={cn(
          "absolute left-[3px] top-[3px] size-5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.3)] transition-transform duration-200",
          checked ? "translate-x-0" : "translate-x-5",
        )}
      />
    </button>
  );
}
