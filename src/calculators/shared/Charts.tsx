"use client";

import { useState } from "react";
import { formatUSD } from "@/lib/finance";
import { cn } from "@/lib/cn";

/** Year-by-year charts of two or three series, drawn as inline SVG (no chart library). */

const W = 420;
const H = 260;
const PAD = { top: 14, right: 12, bottom: 30, left: 50 };
// Fixed order: a series keeps its colour whether or not a later one is shown.
const FILL = ["fill-chart-1", "fill-chart-2", "fill-chart-3"] as const;
const STROKE = ["stroke-chart-1", "stroke-chart-2", "stroke-chart-3"] as const;
const SWATCH = ["bg-chart-1", "bg-chart-2", "bg-chart-3"] as const;

export type Series = { label: string; data: number[] };

export function compactUSD(x: number): string {
  const a = Math.abs(x);
  const sign = x < 0 ? "-" : "";
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (a >= 1e3) return `${sign}$${(a / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace(/\.0$/, "")}k`;
  return `${sign}$${Math.round(a)}`;
}

/** Round tick values covering [min, max] and always including zero. */
function ticksFor(min: number, max: number): number[] {
  min = Math.min(0, min);
  max = Math.max(0, max);
  if (max - min < 1) max = min + 1;
  const rough = (max - min) / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= rough) ?? rough;
  const ticks: number[] = [];
  for (let t = Math.floor(min / step) * step; t < max + step * 0.999; t += step) {
    ticks.push(Math.round(t * 1e6) / 1e6);
  }
  return ticks;
}

/** A bar with a rounded data-end, square where it meets the zero baseline. */
function barPath(x: number, w: number, y0: number, y1: number): string {
  const r = Math.min(4, w / 2, Math.abs(y1 - y0));
  const d = y1 < y0 ? 1 : -1;
  return `M${x},${y0}V${y1 + d * r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 + d * r}V${y0}Z`;
}

export function Swatch({ className }: { className: string }) {
  return <i aria-hidden="true" className={cn("mr-1.5 inline-block size-2.5 rounded-[2px]", className)} />;
}

export function SeriesChart({
  kind,
  title,
  series: named,
}: {
  kind: "bars" | "lines";
  title: string;
  /** Two series for bars; two or three for lines. */
  series: Series[];
}) {
  const [hover, setHover] = useState<number | null>(null);
  const labels = named.map((s) => s.label);
  const series = named.map((s) => s.data);
  const a = series[0];
  const all = series.flat();
  const ticks = ticksFor(Math.min(...all), Math.max(...all));
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];
  const y = (v: number) => PAD.top + (H - PAD.top - PAD.bottom) * (1 - (v - lo) / (hi - lo));
  const band = (W - PAD.left - PAD.right) / a.length;
  const cx = (i: number) => PAD.left + band * (i + 0.5);
  const barW = Math.min(22, band * 0.3);
  // A long chart (a 30-year loan) labels and marks about six years, always with the first and last.
  const every = a.length > 12 ? Math.ceil(a.length / 6) : 1;
  const marked = (i: number) => (i + 1) % every === 0 || i === 0 || i === a.length - 1;

  return (
    <figure className="m-0 min-w-0 rounded-lg border border-line bg-paper p-4">
      <figcaption className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-3.5 gap-y-1 text-[15px]">
        <strong>{title}</strong>
        <span className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-muted">
          {labels.map((label, s) => (
            <span key={label}>
              <Swatch className={SWATCH[s]} />
              {label}
            </span>
          ))}
        </span>
      </figcaption>

      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`${title}: ${labels.join(", ")}, years 1 to ${a.length}`}
          className="block h-auto w-full"
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)}
                className={t === 0 ? "stroke-chart-axis" : "stroke-chart-grid"}
              />
              <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" className="fill-muted text-[12px] tabular-nums">
                {compactUSD(t)}
              </text>
            </g>
          ))}
          {a.map((_, i) => marked(i) && (
            <text key={i} x={cx(i)} y={H - 8} textAnchor="middle" className="fill-muted text-[12px]">
              Yr {i + 1}
            </text>
          ))}

          {kind === "lines" && hover !== null && (
            <line
              x1={cx(hover)} x2={cx(hover)} y1={PAD.top} y2={H - PAD.bottom}
              className="stroke-chart-axis" strokeDasharray="3 3"
            />
          )}

          {kind === "bars"
            ? series.map((arr, s) =>
                arr.map((v, i) => (
                  <path
                    key={`${s}-${i}`}
                    d={barPath(s === 0 ? cx(i) - 1 - barW : cx(i) + 1, barW, y(0), y(v))}
                    className={FILL[s]}
                  />
                )),
              )
            : series.map((arr, s) => (
                <g key={s}>
                  <polyline
                    points={arr.map((v, i) => `${cx(i)},${y(v)}`).join(" ")}
                    fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
                    className={STROKE[s]}
                  />
                  {arr.map((v, i) => marked(i) && (
                    <circle key={i} cx={cx(i)} cy={y(v)} r={4} strokeWidth={2} className={cn(FILL[s], "stroke-paper")} />
                  ))}
                </g>
              ))}

          {/* One hover column per year, wider than the marks, driving the tooltip. */}
          {a.map((_, i) => (
            <rect
              key={i}
              x={PAD.left + band * i} y={PAD.top} width={band} height={H - PAD.top - PAD.bottom}
              tabIndex={0}
              aria-label={`Year ${i + 1}: ${series.map((arr, s) => `${labels[s]} ${formatUSD(arr[i])}`).join(", ")}`}
              className="fill-transparent outline-none hover:fill-ink/5 focus:fill-ink/5"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
            />
          ))}
        </svg>

        {hover !== null && (
          <div
            role="status"
            className="pointer-events-none absolute top-1 z-[2] -translate-x-1/2 whitespace-nowrap rounded-md border border-line bg-white px-2.5 py-2 text-[13px] shadow-3d"
            style={{ left: `clamp(95px, ${(cx(hover) / W) * 100}%, calc(100% - 95px))` }}
          >
            <div className="mb-0.5 font-bold">Year {hover + 1}</div>
            {series.map((arr, s) => (
              <div key={s} className="flex items-center">
                <Swatch className={SWATCH[s]} />
                <span>{labels[s]}</span>
                <strong className="ml-auto pl-3.5 tabular-nums">{formatUSD(arr[hover])}</strong>
              </div>
            ))}
          </div>
        )}
      </div>
    </figure>
  );
}
