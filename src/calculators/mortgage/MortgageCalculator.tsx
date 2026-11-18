"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { formatUSD } from "@/lib/finance";
import { AddDetail } from "../shared/AddDetail";
import { CalculatorShell } from "../shared/CalculatorShell";
import { Field } from "../shared/Field";
import { downPaymentField, parseNumber, switchDownUnit, type FieldDef, type Numbers, type Values } from "../shared/fields";
import { BLANK, DETAIL_FIELDS, exampleValues, FRONT_FIELDS, toInput } from "./fields";
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

/**
 * The Mortgage calculator. The example rate, the note under the rate field and the disclaimer come
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
    setValues((v) => (id === "downUnit" ? switchDownUnit(v, value) : { ...v, [id]: value }));

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

  const front: FieldDef[] = FRONT_FIELDS.map((f) =>
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
      onExample={() => setValues(exampleValues(exampleRatePct))}
      onClear={() => setValues(BLANK)}
      form={
        <>
          <section className="rounded-xl border border-line bg-white shadow-card print:shadow-none print:break-inside-avoid">
            <h2 className="px-5 py-4 text-[17px] font-bold max-[600px]:px-4">The home and the loan</h2>
            <div className="px-5 pb-5 pt-1 max-[600px]:px-4">
              <div className={grid}>{front.map(field)}</div>
            </div>
          </section>

          <AddDetail>
            <p className="mb-3.5 text-[14px] text-muted">Optional. Leave these empty if they do not apply.</p>
            <div className={grid}>
              {DETAIL_FIELDS.map(field)}
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
      results={<MortgageResults result={result} start={start} disclaimer={disclaimer} />}
      below={
        result && (
          <>
          {/* The printed page is these three: a summary on top, the schedule, then the disclaimer. */}
          <PrintSummary input={input} result={result} start={start} />
          <Schedule result={result} start={start} />
          <p className="mt-3 hidden text-[10px] text-muted print:block">{disclaimer}</p>

          {/* Phone: the payment pinned to the bottom of the screen, linking up to the results. */}
          <a
            href="#mortgage-results"
            className="fixed inset-x-3 bottom-3 z-10 hidden items-center gap-[18px] rounded-lg bg-green-900 px-3.5 py-2.5 text-white shadow-pop max-[980px]:flex print:hidden"
          >
            <span className="flex min-w-0 flex-col">
              <span className="text-[11px] text-on-dark-2">Monthly payment</span>
              <strong className="text-[17px] tabular-nums">{formatUSD(result.first.total)}</strong>
            </span>
            <span className="ml-auto whitespace-nowrap text-[13px] font-bold text-mint">See results</span>
          </a>
          </>
        )
      }
    />
  );
}
