"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { formatUSD } from "@/lib/finance";
import { AddDetail } from "../shared/AddDetail";
import { CalculatorShell } from "../shared/CalculatorShell";
import { Field } from "../shared/Field";
import { downPaymentField, parseNumber, switchDownUnit, type FieldDef, type Numbers, type Values } from "../shared/fields";
import { blank, detailFields, exampleValues, frontFields, inputFault, MODE_FIELD, scenarioOf, switchMode, toInput, type Mode } from "./fields";
import { calculateMortgage } from "./math";
import { MONTHS } from "./dates";
import { PrintSummary } from "./PrintSummary";
import { MortgageResults } from "./Results";
import { Schedule } from "./Schedule";

type Start = { month: number; year: number };

// The month after today, as "year-month". Read in the browser only: a statically generated page
// must not bake in the build date, so the server render has no start date at all.
let nextMonth: string | null = null;
function readNextMonth(): string {
  if (nextMonth === null) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + 1);
    nextMonth = `${d.getFullYear()}-${d.getMonth()}`;
  }
  return nextMonth;
}
const subscribe = () => () => {};

const grid = "grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-x-4 gap-y-3.5";
const select = "rounded-md border border-line bg-white px-2.5 py-2.5 text-[16px] font-semibold text-ink";

/** Payment mode has no home in it. */
const FIRST_CARD: Record<Mode, string> = { purchase: "The home and the loan", refinance: "The home and the loan", payment: "The loan" };

/**
 * The Mortgage calculator, in three modes that fill in the same model: Purchase, Refinance and
 * Payment (see fields.ts). The switch sits above the first card; the schedule, the payment slider
 * and the totals run on whichever loan the mode produces. The example rate, the note under the rate field and the disclaimer come
 * from tenant config through the route page, never from a constant here.
 */
export function MortgageCalculator({ exampleRatePct, exampleRateNote, disclaimer }: {
  exampleRatePct: number;
  exampleRateNote: string;
  disclaimer: string;
}) {
  const [values, setValues] = useState<Values>(() => exampleValues(exampleRatePct));
  const [chosenStart, setChosenStart] = useState<Start | null>(null);
  const onChange = (id: string, value: string) =>
    setValues((v) =>
      id === MODE_FIELD.id ? switchMode(v, value as Mode, exampleRatePct) : id === "downUnit" ? switchDownUnit(v, value) : { ...v, [id]: value },
    );
  const scenario = useMemo(() => scenarioOf(values), [values]);
  const { mode } = scenario;

  const todayKey = useSyncExternalStore(subscribe, readNextMonth, () => null);
  const defaultStart = useMemo<Start | null>(() => {
    if (!todayKey) return null;
    const [year, month] = todayKey.split("-").map(Number);
    return { month, year };
  }, [todayKey]);
  const start = chosenStart ?? defaultStart;

  const numbers = useMemo<Numbers>(
    () => Object.fromEntries(Object.entries(values).map(([id, v]) => [id, parseNumber(v)])),
    [values],
  );
  const input = useMemo(() => toInput(values, start ?? { month: 0, year: 0 }), [values, start]);
  const result = useMemo(() => calculateMortgage(input), [input]);

  // Only read when there is no result, to name the box at fault.
  const fault = useMemo(() => (result ? null : inputFault(values)), [result, values]);

  const front: FieldDef[] = frontFields(mode).map((f) =>
    f.id === "downPayment" ? downPaymentField(values.downUnit) : f.id === "rate" ? { ...f, hint: exampleRateNote } : f,
  );
  const field = (def: FieldDef) => (
    <Field key={def.id} def={def} idPrefix="mortgage" values={values} numbers={numbers} onChange={onChange} />
  );

  return (
    <CalculatorShell
      formLabel="Loan details"
      resultsId="mortgage-results"
      printBelowOnly
      onExample={() => setValues(exampleValues(exampleRatePct, mode))}
      onClear={() => setValues(blank(mode))}
      form={
        <>
          {field(MODE_FIELD)}

          <section className="rounded-xl border border-line bg-white shadow-card print:shadow-none print:break-inside-avoid">
            <h2 className="px-5 py-4 text-[17px] font-bold max-[600px]:px-4">{FIRST_CARD[mode]}</h2>
            <div className="px-5 pb-5 pt-1 max-[600px]:px-4">
              <div className={grid}>{front.map(field)}</div>
            </div>
          </section>

          <AddDetail>
            <p className="mb-3.5 text-[14px] text-muted">Optional. Leave these empty if they do not apply.</p>
            <div className={grid}>
              {detailFields(mode).map(field)}
              {start && (
                <fieldset className="col-span-full m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0">
                  <legend className="mb-1.5 p-0 text-[13px] font-semibold">First payment</legend>
                  <div className="flex flex-wrap gap-2">
                    <select
                      aria-label="First payment month" className={select} value={start.month}
                      onChange={(e) => setChosenStart({ ...start, month: Number(e.target.value) })}
                    >
                      {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
                    </select>
                    <select
                      aria-label="First payment year" className={select} value={start.year}
                      onChange={(e) => setChosenStart({ ...start, year: Number(e.target.value) })}
                    >
                      {Array.from({ length: 12 }, (_, i) => (defaultStart?.year ?? start.year) - 10 + i).map((y) => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                </fieldset>
              )}
            </div>
          </AddDetail>
        </>
      }
      results={<MortgageResults result={result} start={start} disclaimer={disclaimer} scenario={scenario} fault={fault} />}
      below={
        result && (
          <>
          {/* The printed page is these three: a summary on top, the schedule, then the disclaimer. */}
          <PrintSummary input={input} result={result} start={start} scenario={scenario} />
          <Schedule result={result} start={start} />
          <p className="mt-3 hidden text-[10px] text-muted print:block">{disclaimer}</p>

          {/* Phone: the payment pinned to the bottom of the screen, linking up to the results. */}
          <a
            href="#mortgage-results"
            className="fixed inset-x-3 bottom-3 z-10 hidden items-center gap-[18px] rounded-lg bg-green-900 px-3.5 py-2.5 text-white shadow-pop max-[980px]:flex print:hidden"
          >
            <span className="flex min-w-0 flex-col">
              <span className="text-[11px] text-on-dark-2">{mode === "payment" ? "Estimated loan amount" : "Monthly payment"}</span>
              <strong className="text-[17px] tabular-nums">{formatUSD(mode === "payment" ? result.loanAmount : result.first.total)}</strong>
            </span>
            <span className="ml-auto whitespace-nowrap text-[13px] font-bold text-mint">See results</span>
          </a>
          </>
        )
      }
    />
  );
}
