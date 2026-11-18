"use client";

import { useMemo, useState } from "react";
import { formatUSD } from "@/lib/finance";
import { AddDetail } from "../shared/AddDetail";
import { CalculatorShell } from "../shared/CalculatorShell";
import { Field } from "../shared/Field";
import { parseNumber, type FieldDef, type Numbers, type Values } from "../shared/fields";
import { BLANK, DETAIL_FIELDS, exampleValues, FRONT_FIELDS, toInput } from "./fields";
import { calculateBuydown } from "./math";
import { BuydownPrintSummary } from "./PrintSummary";
import { BuydownResults, PaymentTable } from "./Results";

const grid = "grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-x-4 gap-y-3.5";

/**
 * The Rate buydown calculator. The example rate, the note under the rate field and the disclaimer
 * come from tenant config through the route page, never from a constant here.
 */
export function BuydownCalculator({ exampleRatePct, exampleRateNote, disclaimer }: {
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
  const result = useMemo(() => calculateBuydown(input), [input]);

  const field = (def: FieldDef) => (
    <Field key={def.id} def={def} idPrefix="buydown" values={values} numbers={numbers} onChange={onChange} />
  );

  return (
    <CalculatorShell
      formLabel="Loan details"
      resultsId="buydown-results"
      printBelowOnly
      onExample={() => setValues(exampleValues(exampleRatePct))}
      onClear={() => setValues(BLANK)}
      form={
        <>
          <section className="rounded-xl border border-line bg-white shadow-card print:shadow-none print:break-inside-avoid">
            <h2 className="px-5 py-4 text-[17px] font-bold max-[600px]:px-4">The loan</h2>
            <div className="px-5 pb-5 pt-1 max-[600px]:px-4">
              <div className={grid}>
                {FRONT_FIELDS.map((f) => field(f.id === "rate" ? { ...f, hint: exampleRateNote } : f))}
              </div>
            </div>
          </section>

          <AddDetail>
            <p className="mb-3.5 text-[14px] text-muted">
              Optional. These turn each figure into a full housing payment. They do not change what the buydown costs.
            </p>
            <div className={grid}>{DETAIL_FIELDS.map(field)}</div>
          </AddDetail>
        </>
      }
      results={<BuydownResults result={result} disclaimer={disclaimer} />}
      below={
        result && (
          <>
          {/* The printed page: a summary on top, the payment table, the reminder and the disclaimer. */}
          <BuydownPrintSummary input={input} result={result} />
          <div className="mt-5 hidden print:block">
            <PaymentTable result={result} />
            <p className="mt-3 text-[12px] font-semibold">
              When the reduced period ends, the payment returns to {formatUSD(result.full.total)} a month.
            </p>
            <p className="mt-2 text-[10px] text-muted">{disclaimer}</p>
          </div>

          {/* Phone: the cost and the full payment pinned to the bottom, linking up to the results. */}
          <a
            href="#buydown-results"
            className="fixed inset-x-3 bottom-3 z-10 hidden items-center gap-[18px] rounded-lg bg-green-900 px-3.5 py-2.5 text-white shadow-pop max-[980px]:flex print:hidden"
          >
            <span className="flex min-w-0 flex-col">
              <span className="text-[11px] text-on-dark-2">Buydown cost</span>
              <strong className="text-[17px] tabular-nums">{formatUSD(result.totalCost)}</strong>
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-[11px] text-on-dark-2">Full payment</span>
              <strong className="text-[17px] tabular-nums">{formatUSD(result.full.total)}</strong>
            </span>
            <span className="ml-auto whitespace-nowrap text-[13px] font-bold text-mint">See results</span>
          </a>
          </>
        )
      }
    />
  );
}
