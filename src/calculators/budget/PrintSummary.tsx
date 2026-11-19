import { formatUSD } from "@/lib/finance";
import { PrintSummary, type PrintColumn } from "../shared/PrintSummary";
import { FRONT_FIELDS, SAVINGS_RATE_FIELD } from "./fields";
import type { BudgetInput, BudgetResult } from "./math";
import { BAND_LABEL, fallsShort, percentText, RATIO_NOTE, reserveText, shareText, usd } from "./Results";

type Rows = PrintColumn["rows"];
/** The lines of one itemized group, as typed: only the ones with an amount. */
export type PrintGroup = { heading: string; lines: { label: string; amount: number }[] };

const label = (id: string) => FRONT_FIELDS.find((f) => f.id === id)!.label;

/** The top of the Home budget calculator's printed page: the month as entered beside the estimate. */
export function BudgetPrintSummary({ input, result: r }: { input: BudgetInput; result: BudgetResult }) {
  const month: Rows = [
    { label: label("grossIncome"), value: formatUSD(input.grossIncome) },
    { label: label("taxRate"), value: percentText(input.taxRate) },
    { label: label("housing"), value: usd(input.housing) },
    { label: label("debts"), value: usd(input.debts) },
    { label: label("living"), value: usd(input.living) },
    { label: SAVINGS_RATE_FIELD.label, value: input.savingsRate > 0 ? percentText(input.savingsRate) : "None" },
  ];
  const short = fallsShort(r.cashFlow);
  const estimate: Rows = [
    { label: short ? "Short each month" : "Left each month", value: usd(Math.abs(Math.round(r.cashFlow))) },
    { label: "Housing as a share of income", value: `${shareText(r.frontRatio)}, ${BAND_LABEL[r.frontBand]}` },
    { label: "Housing and debts as a share of income", value: `${shareText(r.backRatio)}, ${BAND_LABEL[r.backBand]}` },
    { label: "Left after housing and debts", value: usd(r.residual) },
    ...(r.reserveMonths !== null ? [{ label: "Savings cover", value: reserveText(r.reserveMonths) }] : []),
  ];
  return <PrintSummary title="Home budget estimate" columns={[{ heading: "The month", rows: month }, { heading: "The estimate", rows: estimate }]} />;
}

/**
 * The rest of the printed page, under the summary: the lines of each itemized group, the note on
 * what the ratios are and the disclaimer. Hidden on screen. The privacy line is about the form,
 * so it stays on screen under the form and is not printed.
 */
export function BudgetPrintDetails({ groups, disclaimer }: { groups: PrintGroup[]; disclaimer: string }) {
  return (
    <div className="mt-4 hidden print:block">
      {groups.length > 0 && (
        <section aria-label="Itemized lines" className="grid grid-cols-2 gap-x-10 gap-y-3 text-[12px]">
          {groups.map((group) => (
            <div key={group.heading} className="break-inside-avoid">
              <h3 className="mb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">{group.heading}</h3>
              <dl className="m-0">
                {group.lines.map((line, i) => (
                  <div key={i} className="flex items-baseline justify-between gap-4 border-b border-line py-1">
                    <dt className="text-muted">{line.label}</dt>
                    <dd className="m-0 font-semibold tabular-nums">{usd(line.amount)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </section>
      )}
      <p className="mt-3 text-[12px]">{RATIO_NOTE}</p>
      <p className="mt-2 text-[10px] text-muted">{disclaimer}</p>
    </div>
  );
}
