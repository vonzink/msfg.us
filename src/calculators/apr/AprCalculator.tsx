"use client";

import { useMemo, useState } from "react";
import { AddDetail } from "../shared/AddDetail";
import { CalculatorShell } from "../shared/CalculatorShell";
import { Field } from "../shared/Field";
import type { FieldDef, Values } from "../shared/fields";
import { BLANK, DETAIL_FIELDS, entryFaults, exampleValues, FRONT_FIELDS, lenderFeesEmpty, toInput } from "./fields";
import { calculateApr } from "./math";
import { AprPrintDetails, AprPrintSummary } from "./PrintSummary";
import { AprResults, percentText } from "./Results";

const grid = "grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-x-4 gap-y-3.5";
const card = "rounded-xl border border-line bg-white shadow-card";
const CARDS: { heading: string; ids: string[] }[] = [
  { heading: "The loan", ids: ["loanAmount", "rate", "termYears"] },
  { heading: "Fees", ids: ["lenderFees"] },
];
const NO_NUMBERS = {};

/**
 * The APR calculator. The example interest rate, the note under that field and the disclaimer
 * come from tenant config through the route page, never from a constant here.
 * Nothing typed here is stored or sent.
 */
export function AprCalculator({ exampleRatePct, exampleRateNote, disclaimer }: {
  exampleRatePct: number;
  exampleRateNote: string;
  disclaimer: string;
}) {
  const [values, setValues] = useState<Values>(() => exampleValues(exampleRatePct));
  const onChange = (id: string, value: string) => setValues((v) => ({ ...v, [id]: value }));

  // One input feeds the math, the results and the printed page.
  const input = useMemo(() => toInput(values), [values]);
  const faults = useMemo(() => entryFaults(values), [values]);
  const result = useMemo(() => calculateApr(input), [input]);
  // Empty lender fees count as $0, the same as a typed 0. Only what is in the box says which it is.
  const noLenderFees = lenderFeesEmpty(values);

  const front: FieldDef[] = FRONT_FIELDS.map((f) => (f.id === "rate" ? { ...f, hint: exampleRateNote } : f));
  const field = (def: FieldDef) => (
    <Field key={def.id} def={def} idPrefix="apr" values={values} numbers={NO_NUMBERS} onChange={onChange} />
  );

  return (
    <CalculatorShell
      formLabel="Loan and fees"
      resultsId="apr-results"
      printBelowOnly
      onExample={() => setValues(exampleValues(exampleRatePct))}
      onClear={() => setValues(BLANK)}
      form={
        <div className="contents">
          {CARDS.map(({ heading, ids }) => (
            <section key={heading} className={card}>
              <h2 className="px-5 py-4 text-[17px] font-bold max-[600px]:px-4">{heading}</h2>
              <div className="px-5 pb-5 pt-1 max-[600px]:px-4">
                <div className={grid}>{front.filter((f) => ids.includes(f.id)).map(field)}</div>
              </div>
            </section>
          ))}

          <AddDetail>
            <div className={grid}>{DETAIL_FIELDS.map(field)}</div>
          </AddDetail>
        </div>
      }
      results={<AprResults input={input} result={result} disclaimer={disclaimer} faults={faults} lenderFeesEmpty={noLenderFees} />}
      below={
        result && (
          <>
            {/* The printed page: the loan beside the estimate, then the fees, the Loan Estimate sentence and the disclaimer. */}
            <AprPrintSummary input={input} result={result} />
            <AprPrintDetails input={input} result={result} disclaimer={disclaimer} lenderFeesEmpty={noLenderFees} />

            {/* Phone: the headline pinned to the bottom of the screen, linking up to the results. */}
            <a
              href="#apr-results"
              className="fixed inset-x-3 bottom-3 z-10 hidden items-center gap-[18px] rounded-lg bg-green-900 px-3.5 py-2.5 text-white shadow-pop max-[980px]:flex print:hidden"
            >
              <span className="flex min-w-0 flex-col">
                <span className="text-[11px] text-on-dark-2">{noLenderFees ? "Estimated APR, no lender fees entered" : "Estimated APR"}</span>
                <strong className="text-[17px] tabular-nums">{percentText(result.apr)}</strong>
              </span>
              <span className="ml-auto whitespace-nowrap text-[13px] font-bold text-mint">See results</span>
            </a>
          </>
        )
      }
    />
  );
}
