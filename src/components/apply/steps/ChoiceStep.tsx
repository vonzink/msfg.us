"use client";

import { cn } from "@/lib/cn";
import type { ChoiceOption } from "@/content/flows";
import { StepIcon } from "./icons";

/** 5★ customer testimonial shown under the "What type of home?" options. */
function Review() {
  return (
    <div className="mt-9 flex items-center gap-3 text-left">
      <div className="size-11 shrink-0 rounded-full border border-line bg-paper-2" />
      <div>
        <div
          className="text-sm tracking-[2px] text-[#F4B740]"
          aria-label="5 out of 5 stars"
        >
          ★★★★★
        </div>
        <div className="text-[13px] font-semibold text-muted">
          Drew &amp; Anya, MSFG customers
        </div>
      </div>
    </div>
  );
}

export function ChoiceStep({
  options,
  sub,
  review,
  selected,
  onPick,
}: {
  options: ChoiceOption[];
  sub?: string;
  review?: boolean;
  /** Currently selected option label for this step, if any. */
  selected?: string;
  /** Called on click; parent stores the value and auto-advances. */
  onPick: (value: string) => void;
}) {
  return (
    <>
      <div className="flex flex-col gap-3.5">
        {options.map((o) => {
          const on = selected === o.label;
          return (
            <button
              key={o.label}
              type="button"
              aria-pressed={on}
              onClick={() => onPick(o.label)}
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
                  on
                    ? "bg-white/[0.18] text-white"
                    : "bg-spring-soft text-green-600",
                )}
              >
                <StepIcon icon={o.icon} badge={o.badge} />
              </span>
              {o.label}
            </button>
          );
        })}
      </div>

      {sub && <div className="mt-7 text-[16px] text-muted">{sub}</div>}
      {review && <Review />}
    </>
  );
}
