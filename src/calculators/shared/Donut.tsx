import { cn } from "@/lib/cn";
import { formatUSD } from "@/lib/finance";

/**
 * A ring chart of how one total splits into parts, drawn as inline SVG (no chart library).
 * The legend beside it lists every part with its amount, so colour is never the only signal.
 * Tailwind needs literal class names, so each slice passes its stroke and its swatch class.
 */
export type DonutSlice = { label: string; value: number; stroke: string; swatch: string };

const R = 42;
const CIRCUMFERENCE = 2 * Math.PI * R;

export function Donut({ title, total, slices }: {
  /** What the ring shows, for screen readers and the figure caption. */
  title: string;
  /** The formatted total, printed in the middle. */
  total: string;
  slices: DonutSlice[];
}) {
  const shown = slices.filter((s) => s.value > 0);
  const sum = shown.reduce((t, s) => t + s.value, 0);
  let offset = 0;

  return (
    <figure className="m-0 flex min-w-0 flex-wrap items-center gap-5 rounded-lg border border-line bg-paper p-4 print:break-inside-avoid">
      <svg
        viewBox="0 0 100 100"
        role="img"
        aria-label={`${title}: ${shown.map((s) => `${s.label} ${formatUSD(s.value)}`).join(", ")}`}
        className="block size-[150px] flex-none -rotate-90"
      >
        <circle cx="50" cy="50" r={R} fill="none" strokeWidth="14" className="stroke-chart-grid" />
        {sum > 0 && shown.map((s) => {
          const length = (s.value / sum) * CIRCUMFERENCE;
          const dash = `${Math.max(0, length - 1)} ${CIRCUMFERENCE}`;
          const circle = (
            <circle
              key={s.label} cx="50" cy="50" r={R} fill="none" strokeWidth="14"
              strokeDasharray={dash} strokeDashoffset={-offset} className={s.stroke}
            />
          );
          offset += length;
          return circle;
        })}
      </svg>
      <figcaption className="min-w-[180px] flex-1 text-[14px]">
        <strong className="block text-[15px]">{title}</strong>
        <ul className="m-0 mt-2 grid list-none gap-1.5 p-0">
          {shown.map((s) => (
            <li key={s.label} className="flex items-baseline gap-2">
              <i aria-hidden="true" className={cn("inline-block size-2.5 flex-none rounded-[2px]", s.swatch)} />
              <span className="text-muted">{s.label}</span>
              <span className="ml-auto font-semibold tabular-nums">{formatUSD(s.value)}</span>
            </li>
          ))}
          <li className="mt-1 flex items-baseline gap-2 border-t border-line pt-1.5 font-bold">
            <span>Total</span>
            <span className="ml-auto tabular-nums">{total}</span>
          </li>
        </ul>
      </figcaption>
    </figure>
  );
}
