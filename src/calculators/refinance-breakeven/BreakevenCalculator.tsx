"use client";

import { useMemo, useState } from "react";
import { AddDetail } from "../shared/AddDetail";
import { CalculatorShell } from "../shared/CalculatorShell";
import { Field } from "../shared/Field";
import { parseNumber, type FieldDef, type Numbers, type Values } from "../shared/fields";
import { BLANK, DETAIL_FIELDS, exampleValues, FRONT_FIELDS, toInput } from "./fields";
import { calculateBreakeven } from "./math";
import { BreakevenPrintSummary } from "./PrintSummary";
import { BreakevenResults, breakevenText, CAUTION, interestSentence } from "./Results";

const grid = "grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-x-4 gap-y-3.5";
const card = "rounded-xl border border-line bg-white shadow-card";
const NOW = ["currentBalance", "currentRate", "yearsLeft"];

/**
 * The Refinance breakeven calculator. The example new rate, the note under that field and the
 * disclaimer come from tenant config through the route page, never from a constant here.
 */
export function BreakevenCalculator({ exampleRatePct, exampleRateNote, disclaimer }: {
  exampleRatePct: number;
  exampleRateNote: string;
  disclaimer: string;
}) {
  const [values, setValues] = useState<Values>(() => exampleValues(exampleRatePct));
  const onChange = (id: string, value: string) => setValues((v) => ({ ...v, [id]: value }));

  const numbers = useMemo<Numbers>(
    () => Object.fromEntries(Object.entries(values).map(([id, v]) => [id, parseNumber(v)])),
    [values],
  );
  const input = useMemo(() => toInput(values), [values]);
  const result = useMemo(() => calculateBreakeven(input), [input]);
  // A loan too small for the balance and the cash out has no figures to print or pin.
  const shown = result && result.loanShortfall === 0 ? result : null;

  const field = (def: FieldDef) => (
    <Field
      key={def.id}
      def={def.id === "newRate" ? { ...def, hint: exampleRateNote } : def}
      idPrefix="breakeven" values={values} numbers={numbers} onChange={onChange}
    />
  );

  return (
    <CalculatorShell
      formLabel="Loan details"
      resultsId="breakeven-results"
      printBelowOnly
      onExample={() => setValues(exampleValues(exampleRatePct))}
      onClear={() => setValues(BLANK)}
      form={
        <>
          <section className={card}>
            <h2 className="px-5 py-4 text-[17px] font-bold max-[600px]:px-4">Your loan now</h2>
            <div className="px-5 pb-5 pt-1 max-[600px]:px-4">
              <div className={grid}>{FRONT_FIELDS.filter((f) => NOW.includes(f.id)).map(field)}</div>
            </div>
          </section>
          <section className={card}>
            <h2 className="px-5 py-4 text-[17px] font-bold max-[600px]:px-4">The new loan</h2>
            <div className="px-5 pb-5 pt-1 max-[600px]:px-4">
              <div className={grid}>{FRONT_FIELDS.filter((f) => !NOW.includes(f.id)).map(field)}</div>
            </div>
          </section>

          <AddDetail>
            <p className="mb-3.5 text-[14px] text-muted">Optional. Leave these empty if they do not apply.</p>
            <div className={grid}>{DETAIL_FIELDS.map(field)}</div>
          </AddDetail>
        </>
      }
      results={<BreakevenResults result={result} disclaimer={disclaimer} />}
      below={
        shown && (
          <>
            {/* The printed page: the two loans beside the estimate, then the interest line, the caution and the disclaimer. */}
            <BreakevenPrintSummary input={input} result={shown} />
            <div className="mt-4 hidden print:block">
              <p className="text-[12px] font-semibold">{interestSentence(shown)}</p>
              <p className="mt-1 text-[12px]">{CAUTION}</p>
              <p className="mt-2 text-[10px] text-muted">{disclaimer}</p>
            </div>

            {/* Phone: the breakeven pinned to the bottom of the screen, linking up to the results. */}
            <a
              href="#breakeven-results"
              className="fixed inset-x-3 bottom-3 z-10 hidden items-center gap-[18px] rounded-lg bg-green-900 px-3.5 py-2.5 text-white shadow-pop max-[980px]:flex print:hidden"
            >
              <span className="flex min-w-0 flex-col">
                <span className="text-[11px] text-on-dark-2">Breakeven</span>
                <strong className="text-[17px] tabular-nums">{breakevenText(shown)}</strong>
              </span>
              <span className="ml-auto whitespace-nowrap text-[13px] font-bold text-mint">See results</span>
            </a>
          </>
        )
      }
    />
  );
}
