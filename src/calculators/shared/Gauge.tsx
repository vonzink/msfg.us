import { cn } from "@/lib/cn";
import { dialPosition, rate, RATING_LABEL, type Rating, type Scale } from "./gaugeScale";

/** A half-circle speedometer: poor / fair / good zones and a needle. Inline SVG, no library. */

const CX = 60;
const CY = 60;
const R = 48;
const STROKE = 11;
/** Space between zones, as a share of the dial. */
const GAP = 0.012;

const ZONES: { rating: Rating; from: number; to: number; stroke: string; dot: string }[] = [
  { rating: "poor", from: 0, to: 1 / 3, stroke: "stroke-loss", dot: "bg-loss" },
  { rating: "fair", from: 1 / 3, to: 2 / 3, stroke: "stroke-chart-4", dot: "bg-chart-4" },
  { rating: "good", from: 2 / 3, to: 1, stroke: "stroke-chart-3", dot: "bg-chart-3" },
];

/** Point on the dial at position t: 0 is the left end, 1 the right end. */
function pointAt(t: number): [number, number] {
  const a = Math.PI * (1 - t);
  return [CX + R * Math.cos(a), CY - R * Math.sin(a)];
}

function arcPath(from: number, to: number): string {
  const [x0, y0] = pointAt(from);
  const [x1, y1] = pointAt(to);
  return `M${x0.toFixed(2)},${y0.toFixed(2)}A${R},${R} 0 0 1 ${x1.toFixed(2)},${y1.toFixed(2)}`;
}

/**
 * The dial. Decorative for screen readers: the value and the rating word beside it carry the
 * meaning. A value that isn't a finite number (no loan, no rent) draws a grey dial with no needle.
 */
export function GaugeDial({ value, scale, mirror = false, edgeLabels }: {
  value: number;
  scale: Scale;
  /**
   * Draws the dial the other way round, for a figure that is better when lower: the good zone on
   * the left, the poor zone on the right, and the needle turned to match. The scale is unchanged,
   * so the caller passes the figure with its sign turned.
   */
  mirror?: boolean;
  /** Text written on the dial at its two cutoffs, left then right. */
  edgeLabels?: [string, string];
}) {
  const live = Number.isFinite(value);
  const current = live ? rate(value, scale) : null;
  const position = live ? dialPosition(value, scale) : 0;
  const angle = live ? -90 + 180 * (mirror ? 1 - position : position) : -90;
  const zones = mirror ? ZONES.map((z) => ({ ...z, from: 1 - z.to, to: 1 - z.from })).reverse() : ZONES;

  return (
    <svg viewBox="0 0 120 68" aria-hidden="true" className="block h-auto w-full max-w-[150px]">
      {zones.map((z) => (
        <path
          key={z.rating}
          d={arcPath(z.from + (z.from > 0 ? GAP / 2 : 0), z.to - (z.to < 1 ? GAP / 2 : 0))}
          fill="none"
          strokeWidth={STROKE}
          className={cn(live ? z.stroke : "stroke-line", live && current !== z.rating && "opacity-30")}
        />
      ))}
      {live && (
        <g
          className="transition-transform duration-500 ease-out motion-reduce:transition-none"
          style={{ transform: `rotate(${angle}deg)`, transformOrigin: `${CX}px ${CY}px`, transformBox: "view-box" }}
        >
          <line x1={CX} y1={CY} x2={CX} y2={CY - R + 10} strokeWidth={3} strokeLinecap="round" className="stroke-ink" />
        </g>
      )}
      <circle cx={CX} cy={CY} r={5} className={live ? "fill-ink" : "fill-line"} />
      {edgeLabels?.map((label, i) => {
        // Just outside the arc at the cutoff, growing away from the top of the dial.
        const a = Math.PI * (1 - (i + 1) / 3);
        const r = R + STROKE / 2 + 3;
        return (
          <text
            x={(CX + r * Math.cos(a)).toFixed(2)}
            y={(CY - r * Math.sin(a) + 1).toFixed(2)}
            textAnchor={i === 0 ? "end" : "start"}
            key={label + i}
            className="fill-muted text-[8px] font-semibold"
          >
            {label}
          </text>
        );
      })}
    </svg>
  );
}

/** The rating in words, with a matching dot, so the dial never relies on colour alone. */
export function GaugeRating({ value, scale }: { value: number; scale: Scale }) {
  if (!Number.isFinite(value)) return null;
  const r = rate(value, scale);
  const dot = ZONES.find((z) => z.rating === r)?.dot;
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] font-bold">
      <span className="sr-only">Rating:</span>
      <i aria-hidden="true" className={cn("inline-block size-2.5 rounded-full", dot)} />
      {RATING_LABEL[r]}
    </span>
  );
}
