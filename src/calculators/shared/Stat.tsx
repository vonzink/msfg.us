import { cn } from "@/lib/cn";
import { GaugeDial, GaugeRating } from "./Gauge";
import type { Scale } from "./gaugeScale";

/** A headline number in a card, with a help tip and an optional speedometer. */
export function Stat({ label, value, sub, tip, loss, gauge }: {
  label: string;
  value: string;
  sub: string;
  tip: string;
  loss?: boolean;
  /** Position on the speedometer, in the scale's units. NaN draws an empty dial. Omit for a plain card. */
  gauge?: { value: number; scale: Scale };
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-lg border border-line bg-white p-3.5 print:break-inside-avoid">
      <span className="flex items-center gap-1.5 text-[12px] font-semibold text-muted">
        {label}
        <button
          type="button"
          aria-label={`${label}: ${tip}`}
          className="group/tip relative size-4 flex-none cursor-help rounded-full border border-line bg-white text-[10px] font-bold leading-none text-muted print:hidden"
        >
          ?
          <span
            role="tooltip"
            className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-[5] hidden w-[220px] -translate-x-1/2 rounded-md bg-green-900 px-3 py-2.5 text-left text-[13px] font-normal leading-snug text-white shadow-3d group-hover/tip:block group-focus/tip:block"
          >
            {tip}
          </span>
        </button>
      </span>
      <div className="mt-2 flex flex-col items-center gap-0.5 text-center">
        {gauge && <GaugeDial value={gauge.value} scale={gauge.scale} />}
        <span
          className={cn(
            "mt-1 text-[22px] font-extrabold tabular-nums tracking-[-0.01em]",
            loss && "text-loss",
            gauge && !Number.isFinite(gauge.value) && "text-[18px] text-muted",
          )}
        >
          {value}
        </span>
        {gauge && <GaugeRating value={gauge.value} scale={gauge.scale} />}
        <span className="text-[12px] text-muted">{sub}</span>
      </div>
    </div>
  );
}
