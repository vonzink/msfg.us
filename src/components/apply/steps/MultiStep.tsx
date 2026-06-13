"use client";

import { cn } from "@/lib/cn";
import type { ChoiceOption } from "@/content/flows";
import { StepIcon } from "./icons";

/** Multi-select step: toggle options, explicit Continue. Stores string[]. */
export function MultiStep({
  options,
  sub,
  selected,
  onChange,
  onNext,
}: {
  options: ChoiceOption[];
  sub?: string;
  selected: string[];
  onChange: (next: string[]) => void;
  onNext: () => void;
}) {
  const toggle = (label: string) =>
    onChange(selected.includes(label) ? selected.filter((l) => l !== label) : [...selected, label]);

  return (
    <>
      <div className="flex flex-col gap-3.5">
        {options.map((o) => {
          const on = selected.includes(o.label);
          return (
            <button
              key={o.label}
              type="button"
              role="checkbox"
              aria-checked={on}
              onClick={() => toggle(o.label)}
              className={cn(
                "flex min-h-[70px] items-center gap-4 rounded-lg border-[1.5px] px-[22px] text-left text-[18px] font-bold transition-[transform,border-color,background,box-shadow,color] duration-150",
                on
                  ? "border-green-600 bg-green-600 text-white [box-shadow:0_4px_0_#0a3a2a,var(--shadow-pop)]"
                  : "border-line bg-white text-ink shadow-3d hover:-translate-y-0.5 hover:border-green-600 hover:shadow-pop",
              )}
            >
              <span
                className={cn(
                  "flex size-11 shrink-0 items-center justify-center rounded-[10px] transition-colors duration-150",
                  on ? "bg-white/[0.18] text-white" : "bg-spring-soft text-green-600",
                )}
              >
                <StepIcon icon={o.icon} badge={o.badge} />
              </span>
              {o.label}
              <span
                className={cn(
                  "ml-auto flex size-6 shrink-0 items-center justify-center rounded-md border-[1.5px]",
                  on ? "border-white bg-white/20" : "border-line",
                )}
                aria-hidden
              >
                {on && "✓"}
              </span>
            </button>
          );
        })}
      </div>

      {sub && <div className="mt-7 text-[16px] text-muted">{sub}</div>}

      <button
        type="button"
        onClick={onNext}
        disabled={selected.length === 0}
        aria-disabled={selected.length === 0}
        className={cn(
          "mt-7 h-[66px] w-full rounded-lg text-[18px] font-bold text-white transition-[transform,background,box-shadow] duration-150",
          selected.length > 0
            ? "bg-green-600 [box-shadow:0_3px_0_#0a3a2a,var(--shadow-3d)] hover:-translate-y-0.5 hover:bg-green-700 hover:[box-shadow:0_5px_0_#0a3a2a,var(--shadow-pop)] active:translate-y-px"
            : "cursor-default bg-[#cfd6cd]",
        )}
      >
        Continue
      </button>
    </>
  );
}
