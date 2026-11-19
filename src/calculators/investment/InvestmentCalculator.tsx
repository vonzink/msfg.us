"use client";

import { useMemo, useState, type ReactNode } from "react";
import { projectReo, type ReoResult } from "./math";
import { formatUSD } from "@/lib/finance";
import { cn } from "@/lib/cn";
import { AddDetail } from "../shared/AddDetail";
import { CalculatorShell } from "../shared/CalculatorShell";
import { SeriesChart } from "../shared/Charts";
import { Field } from "../shared/Field";
import { Stat } from "../shared/Stat";
import { RentBreakdown } from "./RentBreakdown";
import { SCALES } from "./gauges";
import {
  BLANK, exampleValues, GROUPS, toModel, toNumbers, verdict,
  type GroupDef, type Numbers, type Values,
} from "./fields";

const pct = (x: number, digits = 1) => (Number.isFinite(x) ? `${(x * 100).toFixed(digits)}%` : "—");
const ratio = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : "n/a");

// ---------- Inputs ----------

function Group({ def, rateNote, values, numbers, result, onChange }: {
  def: GroupDef;
  /** The tenant's example-rate note, shown under the interest rate field while a loan is picked. */
  rateNote: string;
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
          <Field
            key={f.id} def={f.id === "rate" ? { ...f, hint: rateNote } : f}
            idPrefix="reo" values={values} numbers={numbers} onChange={onChange}
            // Loan fields stay filled in but do nothing for an all-cash purchase.
            disabled={f.loanOnly === true && values.amortType === "cash"}
            disabledHint="Not used when paying all cash."
          />
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
  // A panel inside "Add detail" has its own named group, so its arrow turns with it and not with the expander around it.
  const arrow = def.detail
    ? "group-open/detail:translate-y-0.5 group-open/detail:-rotate-135"
    : "group-open:translate-y-0.5 group-open:-rotate-135";
  return (
    <details data-calc-panel className={cn(shell, def.detail ? "group/detail" : "group")}>
      <summary className="flex cursor-pointer list-none items-baseline gap-3 rounded-xl px-5 py-4 max-[600px]:px-4 [&::-webkit-details-marker]:hidden">
        <span className="text-[17px] font-bold">{def.title}</span>
        <span className="ml-auto text-right text-[14px] tabular-nums text-muted">{def.summary?.(numbers, result)}</span>
        <span
          aria-hidden="true"
          className={cn("ml-1 size-2.5 flex-none -translate-y-0.5 rotate-45 self-center border-b-2 border-r-2 border-muted transition-transform", arrow, "print:hidden")}
        />
      </summary>
      {body}
    </details>
  );
}

// ---------- Results ----------

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

/**
 * The example interest rate, the note under that field and the disclaimer come from tenant config
 * through the route page, never from a constant here.
 */
export function InvestmentCalculator({ exampleRatePct, exampleRateNote, disclaimer }: {
  exampleRatePct: number;
  exampleRateNote: string;
  disclaimer: string;
}) {
  const [values, setValues] = useState<Values>(() => exampleValues(exampleRatePct));
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
  const group = (g: GroupDef) => (
    <Group key={g.id} def={g} rateNote={exampleRateNote} values={values} numbers={numbers} result={r} onChange={onChange} />
  );

  return (
    <>
    {/* The printout's title, in the type of the shared PrintSummary heading. */}
    <h2 className="hidden text-[18px] font-extrabold tracking-[-0.01em] print:block">Investment property estimate</h2>
    <CalculatorShell
      formLabel="Deal details"
      resultsId="reo-results"
      onExample={() => setValues(exampleValues(exampleRatePct))}
      onClear={() => setValues(BLANK)}
      form={
        <>
          {GROUPS.filter((g) => !g.detail).map(group)}
          <AddDetail>
            <div className="grid gap-3.5">{GROUPS.filter((g) => g.detail).map(group)}</div>
          </AddDetail>
          {/* What the three panels say beside their titles, readable while "Add detail" is closed. The printout opens them, so it is left off there. */}
          <p className="mx-1 text-[13px] text-muted print:hidden">
            {GROUPS.filter((g) => g.detail).map((g) => g.summary?.(numbers, r)).join(", ")}
          </p>
        </>
      }
      results={
        <>
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
        </>
      }
      below={
        <>
      {/* Outside the results grid: a sticky results column may only travel within that grid,
          so it can never slide over this table. */}
      <section aria-label="Five-year projection" className="mt-7 max-[980px]:mt-5 print:break-before-page">
          <details data-calc-panel open className="group rounded-xl border border-line bg-white shadow-card print:shadow-none">
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
          <p className="mx-1 mt-2 max-w-[90ch] text-[13px] text-muted">{disclaimer}</p>
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
      }
    />
    </>
  );
}
