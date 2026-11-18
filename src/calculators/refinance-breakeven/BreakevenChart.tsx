import { formatUSD } from "@/lib/finance";
import { compactUSD, Swatch } from "../shared/Charts";

/**
 * Savings against closing costs, month by month from the day the new loan starts. Savings begin
 * at zero and rise by the monthly savings; closing costs are a level line; where they meet is the
 * breakeven, marked at its exact month. Inline SVG, no chart library.
 *
 * The shared year-by-year chart is the wrong tool here: it starts a year in and steps by whole
 * years, so it put the crossing at the wrong place and showed none for a breakeven under a year.
 */
const W = 420;
const H = 260;
const PAD = { top: 26, right: 14, bottom: 30, left: 50 };

export function BreakevenChart({ monthlySavings, closingCosts, breakevenMonths }: {
  monthlySavings: number;
  closingCosts: number;
  /** Whole months, as shown in the headline. */
  breakevenMonths: number;
}) {
  // The exact crossing, before rounding up to a whole month.
  const exact = closingCosts / monthlySavings;
  // Whole years, long enough to show the crossing with room after it: 2 to 10 years.
  const years = Math.min(10, Math.max(2, Math.ceil((exact * 1.6) / 12)));
  const months = years * 12;
  // Round gridlines: a step of 1, 2, 2.5 or 5 times a power of ten, at least four of them.
  const peak = Math.max(monthlySavings * months, closingCosts);
  const magnitude = Math.pow(10, Math.floor(Math.log10(peak / 4)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s * 4 >= peak) ?? peak / 4;
  const top = Math.ceil(peak / step) * step;

  const x = (m: number) => PAD.left + ((W - PAD.left - PAD.right) * m) / months;
  const y = (v: number) => PAD.top + (H - PAD.top - PAD.bottom) * (1 - v / top);
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const label = `Breakeven: ${breakevenMonths} month${breakevenMonths === 1 ? "" : "s"}`;
  const labelLeft = x(exact) > W * 0.6;

  return (
    <figure className="m-0 min-w-0 rounded-lg border border-line bg-paper p-4">
      <figcaption className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-3.5 gap-y-1 text-[15px]">
        <strong>Savings against closing costs</strong>
        <span className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-muted">
          <span><Swatch className="bg-chart-1" />Savings so far</span>
          <span><Swatch className="bg-chart-2" />Closing costs</span>
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Savings start at $0 and reach the ${formatUSD(closingCosts)} of closing costs after ${breakevenMonths} month${breakevenMonths === 1 ? "" : "s"}.`}
        className="block h-auto w-full"
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className={t === 0 ? "stroke-chart-axis" : "stroke-chart-grid"} />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" className="fill-muted text-[12px] tabular-nums">{compactUSD(t)}</text>
          </g>
        ))}
        {Array.from({ length: years + 1 }, (_, i) => i)
          .filter((i) => years <= 5 || i % 2 === 0)
          .map((i) => (
            <text key={i} x={x(i * 12)} y={H - 8} textAnchor={i === 0 ? "start" : "middle"} className="fill-muted text-[12px]">
              {i === 0 ? "Start" : `${i} yr`}
            </text>
          ))}

        <line
          data-series="closing"
          x1={x(0)} x2={x(months)} y1={y(closingCosts)} y2={y(closingCosts)}
          strokeWidth={2} strokeDasharray="6 4" className="stroke-chart-2"
        />
        <line
          data-series="savings" data-start="0"
          x1={x(0)} y1={y(0)} x2={x(months)} y2={y(monthlySavings * months)}
          strokeWidth={2.5} strokeLinecap="round" className="stroke-chart-1"
        />

        <line
          data-breakeven-month={exact.toFixed(2)}
          x1={x(exact)} x2={x(exact)} y1={PAD.top - 6} y2={H - PAD.bottom}
          strokeDasharray="3 3" className="stroke-ink"
        />
        <circle cx={x(exact)} cy={y(closingCosts)} r={5} strokeWidth={2} className="fill-ink stroke-paper" />
        <text
          x={x(exact) + (labelLeft ? -8 : 8)} y={PAD.top - 10}
          textAnchor={labelLeft ? "end" : "start"}
          className="fill-ink text-[12px] font-bold"
        >
          {label}
        </text>
      </svg>
    </figure>
  );
}
