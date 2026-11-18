import Link from "next/link";
import { formatUSD } from "@/lib/finance";
import { cn } from "@/lib/cn";
import { Stat } from "../shared/Stat";
import type { BlendedResult } from "./math";

/** A rate as a percent with no trailing zeros: 0.07 is "7%", 0.06875 is "6.875%". */
export const percent = (rate: number) => `${Number((rate * 100).toFixed(3))}%`;
/** The blended rate always shows three decimals, as the dashboard does. */
export const blendedPercent = (rate: number) => `${(rate * 100).toFixed(3)}%`;

/** A share of the balance as a whole percent. A real debt never shows as 0%. */
export const sharePercent = (share: number) => (Math.round(share * 100) < 1 ? "under 1%" : `${Math.round(share * 100)}%`);

export const CAUTION =
  "A lower rate is not the whole decision. Moving a short-term debt into a 30-year loan can lower the rate and still raise the total interest you pay.";

/** One line comparing a new rate with the blended rate, in words. */
export function comparisonSentence(comparison: NonNullable<BlendedResult["comparison"]>): string {
  const points = Math.abs(comparison.difference * 100);
  if (points < 0.0005) return `A new rate of ${percent(comparison.rate)} is the same as this blended rate.`;
  const direction = comparison.difference > 0 ? "above" : "below";
  return `A new rate of ${percent(comparison.rate)} is ${Number(points.toFixed(3))} percentage points ${direction} this blended rate.`;
}

// Tailwind needs literal class names. Six rows at most.
const SWATCH = ["bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-4", "bg-green-700", "bg-muted"];

/**
 * The results column of the Blended rate calculator. `result` is null until a debt has a balance.
 * `breakevenHref` is the Refinance breakeven calculator's path, or null while it is not live.
 */
export function BlendedResults({ result: r, disclaimer, breakevenHref }: {
  result: BlendedResult | null;
  disclaimer: string;
  breakevenHref: string | null;
}) {
  if (!r) {
    return (
      <div role="status" className="rounded-xl border border-line bg-white p-6 text-[16px] text-muted shadow-card">
        Enter a balance and a rate for at least one debt to see the blended rate.
      </div>
    );
  }

  return (
    <>
      <div className="rounded-xl bg-green-800 p-6 text-on-dark shadow-card">
        <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-mint">Blended rate</p>
        <p aria-live="polite" className="mt-1 text-[clamp(40px,5vw,58px)] font-extrabold leading-[1.05] tracking-[-0.02em] tabular-nums text-white">
          {blendedPercent(r.blendedRate)}
        </p>
        <p className="mt-1.5 text-[16px] text-on-dark-2">across {formatUSD(r.totalBalance)} of debt</p>
        {r.comparison && <p className="mt-2 text-[15px] text-white">{comparisonSentence(r.comparison)}</p>}
      </div>

      <div className="rounded-xl border border-line bg-white p-5 shadow-card max-[600px]:p-4">
        <h2 className="text-[17px] font-bold">What makes up the rate</h2>
        <p className="mt-1 text-[14px] text-muted">Each debt pulls the blended rate toward its own rate, in proportion to its balance.</p>
        <div aria-hidden="true" className="mt-3 flex h-3 overflow-hidden rounded-full bg-paper-2">
          {r.debts.map((d, i) => (
            <span key={i} className={SWATCH[i % SWATCH.length]} style={{ width: `${d.share * 100}%` }} />
          ))}
        </div>
        <ul className="m-0 mt-3 grid list-none gap-2 p-0 text-[14px]">
          {r.debts.map((d, i) => (
            <li key={i} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <i aria-hidden="true" className={cn("inline-block size-2.5 flex-none rounded-[2px]", SWATCH[i % SWATCH.length])} />
              <span className="font-semibold">{d.name}</span>
              <span className="text-muted">
                {formatUSD(d.balance)} at {percent(d.rate)}
              </span>
              <span className="ml-auto font-semibold tabular-nums">{sharePercent(d.share)} of the balance</span>
            </li>
          ))}
        </ul>
        {r.debts.filter((d) => d.missingRate).map((d, i) => (
          <p key={i} className="mt-3 text-[13px] font-semibold text-loss">
            {d.name} has no rate entered, so it is counted at 0%.
          </p>
        ))}
      </div>

      {r.totalPayment > 0 && (
        <Stat
          label="Total monthly payment"
          value={formatUSD(r.totalPayment)}
          sub="the payments you entered, added up"
          tip="The sum of the monthly payments typed in under Add detail. It does not change the blended rate."
        />
      )}

      <p className="mx-1 text-[14px] text-ink">
        {CAUTION}{" "}
        {breakevenHref && (
          <Link href={breakevenHref} className="font-semibold text-green-700 underline">
            Check the breakeven on a refinance
          </Link>
        )}
      </p>
      <p className="mx-1 text-[13px] text-muted">{disclaimer}</p>
    </>
  );
}
