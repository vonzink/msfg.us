"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { projectReo, type ReoResult } from "@/lib/calculators/reoMath";
import { formatUSD } from "@/lib/finance";
import { cn } from "@/lib/cn";
import { RentBreakdown, SeriesChart } from "./Charts";
import { GaugeDial, GaugeRating } from "./Gauge";
import { SCALES, type Scale } from "./gauges";
import {
  BLANK, EXAMPLE, GROUPS, parseNumber, toModel, toNumbers, verdict,
  type FieldDef, type GroupDef, type Numbers, type Values,
} from "./fields";

const pct = (x: number, digits = 1) => (Number.isFinite(x) ? `${(x * 100).toFixed(digits)}%` : "—");
const ratio = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : "n/a");

// ---------- Inputs ----------

function Field({ def, values, numbers, onChange }: {
  def: FieldDef;
  values: Values;
  numbers: Numbers;
  onChange: (id: string, value: string) => void;
}) {
  const id = `reo-${def.id}`;
  const value = values[def.id] ?? "";

  if (def.type === "choice") {
    return (
      <fieldset className="col-span-full m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0">
        <legend className="mb-1.5 p-0 text-[13px] font-semibold">{def.label}</legend>
        <div className="grid auto-cols-fr grid-flow-col gap-[3px] rounded-md bg-paper-2 p-[3px]">
          {def.options?.map((o) => (
            <label
              key={o.value}
              className={cn(
                "relative cursor-pointer rounded-sm px-1.5 py-2 text-center text-[14px] font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-spring-2",
                value === o.value ? "bg-green-600 text-white shadow-3d" : "text-muted",
              )}
            >
              <input
                type="radio" name={id} value={o.value} checked={value === o.value}
                onChange={() => onChange(def.id, o.value)}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
              {o.label}
            </label>
          ))}
        </div>
        {def.hint && <span className="text-[12px] text-muted print:hidden">{def.hint}</span>}
      </fieldset>
    );
  }

  const suffix = def.type === "pct" ? "%" : def.suffix;
  // Loan fields stay filled in but do nothing for an all-cash purchase.
  const disabled = def.loanOnly === true && values.amortType === "cash";
  const hint = disabled ? "Not used when paying all cash." : def.hintFn ? def.hintFn(numbers) : def.hint;
  const warning = disabled ? null : (def.warnFn?.(numbers) ?? null);
  const describedBy = [hint && `${id}-hint`, warning && `${id}-warn`].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", disabled && "opacity-60")}>
      <label htmlFor={id} className="text-[13px] font-semibold">{def.label}</label>
      <div
        className={cn(
          "flex items-center rounded-md border bg-white transition-shadow focus-within:border-spring-2 focus-within:shadow-[0_0_0_3px_var(--color-spring-soft)]",
          warning ? "border-loss" : "border-line",
          disabled && "bg-paper-2",
        )}
      >
        {def.type === "money" && <span aria-hidden="true" className="pl-2.5 text-[15px] font-semibold text-muted">$</span>}
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0"
          value={value}
          disabled={disabled}
          aria-describedby={describedBy}
          onChange={(e) => onChange(def.id, e.target.value)}
          onBlur={() => {
            if (def.type !== "money") return;
            const n = parseNumber(value);
            onChange(def.id, n ? n.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "");
          }}
          className="w-full min-w-0 flex-1 border-0 bg-transparent px-2.5 py-2.5 text-[16px] font-semibold tabular-nums text-ink outline-none placeholder:font-normal placeholder:text-muted/60 disabled:cursor-not-allowed"
        />
        {suffix && <span aria-hidden="true" className="pr-2.5 text-[15px] font-semibold text-muted">{suffix}</span>}
      </div>
      {def.slider && (
        <input
          type="range"
          aria-label={def.label}
          min={def.slider.min} max={def.slider.max} step={def.slider.step}
          value={parseNumber(value)}
          disabled={disabled}
          onChange={(e) => onChange(def.id, e.target.value)}
          className="mt-0.5 w-full accent-spring-2 disabled:cursor-not-allowed print:hidden"
        />
      )}
      {hint && <span id={`${id}-hint`} className="text-[12px] text-muted print:hidden">{hint}</span>}
      {warning && <span id={`${id}-warn`} className="text-[12px] font-semibold text-loss">{warning}</span>}
    </div>
  );
}

function Group({ def, values, numbers, result, onChange }: {
  def: GroupDef;
  values: Values;
  numbers: Numbers;
  result: ReoResult;
  onChange: (id: string, value: string) => void;
}) {
  const body = (
    <div className="px-5 pb-5 pt-1 max-[600px]:px-4">
      <p className="mb-3.5 text-[14px] text-muted">{def.lead}</p>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-x-4 gap-y-3.5">
        {def.fields.map((f) => (
          <Field key={f.id} def={f} values={values} numbers={numbers} onChange={onChange} />
        ))}
      </div>
    </div>
  );
  const shell = "rounded-xl border border-line bg-white shadow-card print:shadow-none print:break-inside-avoid";

  if (def.fixed) {
    return (
      <section className={shell}>
        <h2 className="px-5 py-4 text-[17px] font-bold max-[600px]:px-4">{def.title}</h2>
        {body}
      </section>
    );
  }
  return (
    <details data-reo-panel className={cn(shell, "group")}>
      <summary className="flex cursor-pointer list-none items-baseline gap-3 rounded-xl px-5 py-4 max-[600px]:px-4 [&::-webkit-details-marker]:hidden">
        <span className="text-[17px] font-bold">{def.title}</span>
        <span className="ml-auto text-right text-[14px] tabular-nums text-muted">{def.summary?.(numbers, result)}</span>
        <span
          aria-hidden="true"
          className="ml-1 size-2.5 flex-none -translate-y-0.5 rotate-45 self-center border-b-2 border-r-2 border-muted transition-transform group-open:translate-y-0.5 group-open:-rotate-135 print:hidden"
        />
      </summary>
      {body}
    </details>
  );
}

// ---------- Results ----------

function Stat({ label, value, sub, tip, loss, gauge }: {
  label: string;
  value: string;
  sub: string;
  tip: string;
  loss?: boolean;
  /** Position on the speedometer, in the scale's units. NaN draws an empty dial. */
  gauge: { value: number; scale: Scale };
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
        <GaugeDial value={gauge.value} scale={gauge.scale} />
        <span
          className={cn(
            "mt-1 text-[22px] font-extrabold tabular-nums tracking-[-0.01em]",
            loss && "text-loss",
            !Number.isFinite(gauge.value) && "text-[18px] text-muted",
          )}
        >
          {value}
        </span>
        <GaugeRating value={gauge.value} scale={gauge.scale} />
        <span className="text-[12px] text-muted">{sub}</span>
      </div>
    </div>
  );
}

type Row =
  | { group: string }
  | { label: string; key: keyof ReoResult; fmt: (x: number) => string; total?: boolean; plain?: boolean };

const pct2 = (x: number) => pct(x, 2);

/** Which optional rows the table shows. */
type Show = { saleTax: boolean; alt: boolean; heldLosses: boolean };

const tableRows = (show: Show): Row[] => [
  { group: "Running the property" },
  { label: "Rent collected", key: "grossIncome", fmt: formatUSD },
  { label: "Operating expenses", key: "expenses", fmt: formatUSD },
  { label: "Net operating income", key: "noi", fmt: formatUSD, total: true },
  { label: "Cap rate (on purchase price)", key: "capRate", fmt: pct2 },
  { group: "Cash flow" },
  { label: "Mortgage payments", key: "debtService", fmt: formatUSD },
  { label: "Debt coverage ratio", key: "dcr", fmt: ratio, plain: true },
  { label: "Cash flow before taxes", key: "cashFlow", fmt: formatUSD, total: true },
  { label: "Cash-on-cash return", key: "cashOnCash", fmt: pct2 },
  { label: "Depreciation", key: "depreciation", fmt: formatUSD },
  // A negative tax is a saving, so it is not flagged as a loss.
  { label: "Income tax (negative = saving)", key: "incomeTax", fmt: formatUSD, plain: true },
  ...(show.heldLosses ? [{ label: "Losses held for later", key: "heldLosses", fmt: formatUSD } as Row] : []),
  { label: "Cash flow after taxes", key: "afterTaxCashFlow", fmt: formatUSD, total: true },
  { group: "If you sold at the end of the year" },
  { label: "Property value", key: "propValue", fmt: formatUSD },
  { label: "Loan balance", key: "loanBalance", fmt: formatUSD },
  { label: "Net equity after selling costs", key: "netEquity", fmt: formatUSD, total: true },
  ...(show.saleTax ? [{ label: "Tax on the sale", key: "saleTax", fmt: formatUSD } as Row] : []),
  ...(show.saleTax && show.heldLosses
    ? [{ label: "Tax saved by held losses", key: "lossSavingAtSale", fmt: formatUSD } as Row]
    : []),
  { label: "Total after-tax return", key: "cumulativeReturn", fmt: formatUSD, total: true },
  { label: "Return on cash invested", key: "roi", fmt: pct2 },
  ...(show.alt
    ? [
        { label: "Same cash invested elsewhere", key: "altGain", fmt: formatUSD } as Row,
        { label: "Property ahead (behind)", key: "vsAlt", fmt: formatUSD, total: true } as Row,
      ]
    : []),
];

function Projection({ r, show }: { r: ReoResult; show: Show }) {
  const cell = "border-b border-line px-2.5 py-2 text-right whitespace-nowrap";
  return (
    <div className="overflow-x-auto px-5 max-[600px]:px-4">
      <table className="w-full border-collapse text-[14px] tabular-nums">
        <thead>
          <tr>
            <th scope="col" className="border-b-2 border-ink" />
            {r.noi.map((_, i) => (
              <th key={i} scope="col" className="border-b-2 border-ink px-2.5 py-2 text-right text-[12px] font-semibold uppercase tracking-[0.06em] text-muted">
                Year {i + 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tableRows(show).map((row) =>
            "group" in row ? (
              <tr key={row.group}>
                <th colSpan={6} scope="colgroup" className="border-b border-ink px-2.5 pb-2 pt-4 text-left text-[12px] font-semibold uppercase tracking-[0.06em] text-green-600">
                  {row.group}
                </th>
              </tr>
            ) : (
              <tr key={row.key} className={cn(row.total && "bg-paper-2 font-bold")}>
                <td className={cn(cell, "text-left whitespace-normal", !row.total && "font-medium")}>{row.label}</td>
                {(r[row.key] as number[]).map((v, i) => (
                  <td key={i} className={cn(cell, !row.plain && v < -0.005 && "text-loss")}>{row.fmt(v)}</td>
                ))}
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}

function Note({ term, children }: { term: string; children: ReactNode }) {
  return (
    <li className="mb-1">
      <strong>{term}</strong> {children}
    </li>
  );
}

// ---------- Calculator ----------

export function ReoCalculator() {
  const [values, setValues] = useState<Values>(EXAMPLE);
  const onChange = (id: string, value: string) => setValues((v) => ({ ...v, [id]: value }));

  const numbers = useMemo(() => toNumbers(values), [values]);
  const r = useMemo(() => projectReo(toModel(values, numbers)), [values, numbers]);
  const monthlyCf = r.cashFlow[0] / 12;
  const fiveYear = r.cumulativeReturn[4];
  const saleTaxMode = values.saleTax || "none";
  const withSaleTax = saleTaxMode !== "none";
  const withAlt = numbers.compareOn === 1 && numbers.altReturn > 0;
  const holdLosses = values.lossesNow !== "yes";
  const show: Show = { saleTax: withSaleTax, alt: withAlt, heldLosses: holdLosses };
  const vsAlt = r.vsAlt[4];
  const hasLoan = r.debtService[1] > 0;
  const heldSaving = r.lossSavingAtSale[4];

  // Closed <details> do not print, so open every panel for the printout and restore after.
  useEffect(() => {
    let reopened: HTMLDetailsElement[] = [];
    const before = () => {
      reopened = Array.from(document.querySelectorAll<HTMLDetailsElement>("details[data-reo-panel]")).filter((d) => !d.open);
      reopened.forEach((d) => (d.open = true));
    };
    const after = () => {
      reopened.forEach((d) => (d.open = false));
      reopened = [];
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);

  const ghost = "rounded-md border border-line bg-white px-3.5 py-2 text-[14px] font-bold text-ink hover:bg-paper-2";

  return (
    <>
      <div className="mb-5 flex flex-wrap gap-2.5 print:hidden">
        <button type="button" className={ghost} onClick={() => setValues(EXAMPLE)}>Load example</button>
        <button type="button" className={ghost} onClick={() => setValues(BLANK)}>Clear</button>
        <button type="button" className={ghost} onClick={() => window.print()}>Print / Save PDF</button>
      </div>

      <div className="grid grid-cols-[minmax(0,5fr)_minmax(0,6fr)] items-start gap-7 max-[980px]:grid-cols-1 max-[980px]:gap-5 print:block">
        <form aria-label="Deal details" className="grid gap-3.5" onSubmit={(e) => e.preventDefault()} noValidate>
          {GROUPS.map((g) => (
            <Group key={g.id} def={g} values={values} numbers={numbers} result={r} onChange={onChange} />
          ))}
        </form>

        <section id="reo-results" aria-label="Results" className="grid scroll-mt-24 gap-4 print:mt-4 [@media(min-width:981px)_and_(min-height:1000px)]:sticky [@media(min-width:981px)_and_(min-height:1000px)]:top-24">
          <div className="rounded-xl bg-green-800 p-6 text-on-dark shadow-card print:border print:border-ink print:bg-transparent print:text-ink print:shadow-none">
            <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-mint print:text-muted">
              {withSaleTax ? "Five-year after-tax return" : "Five-year return, before tax on the sale"}
            </p>
            <p aria-live="polite" className={cn("mt-1 text-[clamp(40px,5vw,58px)] font-extrabold leading-[1.05] tracking-[-0.02em] tabular-nums print:text-ink", fiveYear < -0.5 ? "text-loss-on-dark" : "text-white")}>
              {formatUSD(fiveYear)}
            </p>
            <p className="mt-1.5 text-[16px] text-on-dark-2 print:text-ink">
              <strong className="text-white print:text-ink">{pct(r.roi[4])}</strong> on{" "}
              <strong className="text-white print:text-ink">{formatUSD(r.cashInvested)}</strong> cash invested
            </p>
            <p className="mt-1 text-[14px] text-on-dark-2 print:text-ink">
              {withSaleTax
                ? `After ${formatUSD(r.saleTax[4])} tax on the sale at ${saleTaxMode === "long" ? "long-term" : "short-term"} rates` +
                  (heldSaving > 0.5 ? `, less ${formatUSD(heldSaving)} saved by using held losses.` : ".")
                : "Tax on the sale is left out."}
            </p>
            {withAlt && (
              <p className="mt-3 rounded-md bg-green-900 px-3 py-2 text-[15px] print:border print:border-line print:bg-transparent">
                <strong className={cn("print:text-ink", vsAlt < 0 ? "text-loss-on-dark" : "text-mint")}>
                  {formatUSD(Math.abs(vsAlt))} {vsAlt < 0 ? "behind" : "ahead of"}
                </strong>{" "}
                the same cash earning {numbers.altReturn}% a year, which would have made {formatUSD(r.altGain[4])}.
              </p>
            )}
            <p className="mt-4 border-t border-hair-dark pt-3.5 text-[15px] print:border-line">{verdict(numbers, r)}</p>
          </div>

          <div className="grid grid-cols-4 gap-3 max-[600px]:grid-cols-2">
            <Stat
              label="Monthly cash flow" value={formatUSD(monthlyCf)} sub="Year 1 average, before taxes" loss={monthlyCf < -0.5}
              gauge={{ value: numbers.grossRents > 0 ? monthlyCf / numbers.grossRents : NaN, scale: SCALES.cashFlowShare }}
              tip="Rent collected minus expenses and the mortgage payment, averaged over year 1, before income tax. Dial: Good keeps 10% or more of the rent, Fair keeps less than that, Poor loses money."
            />
            <Stat
              label="Cash-on-cash" value={pct(r.cashOnCash[0])} sub="Year 1" loss={r.cashOnCash[0] < 0}
              gauge={{ value: r.cashInvested > 0 ? r.cashOnCash[0] : NaN, scale: SCALES.cashOnCash }}
              tip="Year-1 cash flow divided by the cash you put in. It ignores appreciation and loan paydown. Dial: Good is 8% or more, Fair 4% to 8%, Poor under 4%, less than a savings account might pay."
            />
            <Stat
              label="Cap rate" value={pct(r.capRate[0])} sub="Year 1, on purchase price" loss={r.capRate[0] < 0}
              gauge={{ value: numbers.purchasePrice > 0 ? r.capRate[0] : NaN, scale: SCALES.capRate }}
              tip="A full rented year of net operating income divided by the purchase price. It measures the property itself, ignoring the loan. Dial: Good is 7% or more, Fair 5% to 7%, Poor under 5%. What's normal varies by market."
            />
            <Stat
              label="Debt coverage" value={hasLoan ? ratio(r.dcr[1]) : "No loan"}
              sub={hasLoan ? "Year 2, first full year" : "Paying all cash"} loss={hasLoan && r.dcr[1] < 1}
              gauge={{ value: hasLoan ? r.dcr[1] : NaN, scale: SCALES.dcr }}
              tip="Net operating income divided by the yearly mortgage payments. Dial: Good is 1.25 or more, what most lenders want; Fair is 1.00 to 1.25; Poor is under 1.00, where the rent doesn't cover the loan."
            />
          </div>

          <RentBreakdown
            rent={numbers.grossRents}
            expenses={r.expensesMonthly}
            mortgage={r.monthlyPayment}
            vacancy={(numbers.grossRents * numbers.vacancy) / 100}
          />

          <div className="grid grid-cols-2 gap-3 max-[600px]:grid-cols-1">
            <SeriesChart
              kind="bars" title="Cash flow each year"
              series={[{ label: "Before taxes", data: r.cashFlow }, { label: "After taxes", data: r.afterTaxCashFlow }]}
            />
            <SeriesChart
              kind="lines" title="If you sold at year end"
              series={[
                { label: "Net equity", data: r.netEquity },
                { label: "Total return", data: r.cumulativeReturn },
                ...(withAlt ? [{ label: "Invested elsewhere", data: r.altGain }] : []),
              ]}
            />
          </div>
        </section>

      </div>

      {/* Outside the grid above: a sticky results column may only travel within that grid,
          so it can never slide over this table. */}
      <section aria-label="Five-year projection" className="mt-7 max-[980px]:mt-5 print:break-before-page">
          <details data-reo-panel open className="group rounded-xl border border-line bg-white shadow-card print:shadow-none">
            <summary className="flex cursor-pointer list-none items-baseline gap-3 rounded-xl px-5 py-4 max-[600px]:px-4 [&::-webkit-details-marker]:hidden">
              <span className="text-[17px] font-bold">Year-by-year numbers</span>
              <span className="ml-auto text-[14px] text-muted">All five years, line by line</span>
              <span aria-hidden="true" className="ml-1 size-2.5 flex-none -translate-y-0.5 rotate-45 self-center border-b-2 border-r-2 border-muted transition-transform group-open:translate-y-0.5 group-open:-rotate-135 print:hidden" />
            </summary>
            <Projection r={r} show={show} />
            <ul className="mx-5 mb-5 mt-4 list-disc pl-[18px] text-[13px] text-muted max-[600px]:mx-4">
              <Note term="Cap rate">= a full rented year of net operating income ÷ purchase price.</Note>
              <Note term="Net equity">= property value − selling costs − loan balance.</Note>
              <Note term="Total return">
                = after-tax cash flow to date + net equity −{" "}
                {withSaleTax ? (holdLosses ? "tax on the sale + tax saved by held losses − " : "tax on the sale − ") : ""}
                cash invested.
                {!withSaleTax && " Tax on the sale itself (capital gains and depreciation recapture) is left out."}
              </Note>
              {withSaleTax && (
                <Note term="Tax on the sale">
                  is charged on the gain: sale price − selling costs − (purchase price + closing costs + renovation −
                  depreciation taken).{" "}
                  {saleTaxMode === "long"
                    ? "The part of the gain that comes from depreciation is taxed at your bracket, capped at 25%; the rest at your long-term gains rate."
                    : "The whole gain is taxed at your bracket."}{" "}
                  State tax and the 3.8% net investment income tax are not included, and a loss on sale is shown as no
                  tax.
                </Note>
              )}
              {withAlt && (
                <Note term="Same cash invested elsewhere">
                  = what your cash invested would have earned at {numbers.altReturn}% a year, compounded yearly, if you
                  had put all of it in on day one.
                </Note>
              )}
              <Note term="Income tax">
                = (net operating income − mortgage interest − depreciation) × your tax bracket.{" "}
                {holdLosses
                  ? `A loss saves no tax that year. It is held, offsets later rental profit first, and whatever is left is used when you sell${withSaleTax ? "" : " (not counted here, because tax on the sale is left out)"}.`
                  : "A negative figure is a tax saving, which assumes the loss can offset your other income."}
              </Note>
              <Note term="Depreciation">
                starts once the property is ready to rent, so year 1 counts only the months after renovation.
              </Note>
              <li>While the property is being renovated there is no rent, but property tax, insurance and HOA dues still count.</li>
            </ul>
          </details>

          <p className="mx-1 mt-5 max-w-[90ch] text-[13px] text-muted">
            This is a preliminary estimate based on the numbers you entered and the assumptions shown. It is not tax,
            legal or investment advice and is not a guarantee of return. Talk with your tax and investment advisors
            before you buy.
          </p>
      </section>

      {/* Phone: results summary pinned to the bottom of the screen */}
      <a
        href="#reo-results"
        className="fixed inset-x-3 bottom-3 z-10 hidden items-center gap-[18px] rounded-lg bg-green-900 px-3.5 py-2.5 text-white shadow-pop max-[980px]:flex print:hidden"
      >
        <span className="flex min-w-0 flex-col">
          <span className="text-[11px] text-on-dark-2">5-year return</span>
          <strong className="text-[17px] tabular-nums">{formatUSD(fiveYear)}</strong>
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="text-[11px] text-on-dark-2">Monthly cash flow</span>
          <strong className="text-[17px] tabular-nums">{formatUSD(monthlyCf)}</strong>
        </span>
        <span className="ml-auto whitespace-nowrap text-[13px] font-bold text-mint">See results</span>
      </a>
    </>
  );
}
