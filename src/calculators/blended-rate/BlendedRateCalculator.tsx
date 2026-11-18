"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AddDetail } from "../shared/AddDetail";
import { CalculatorShell } from "../shared/CalculatorShell";
import { Field } from "../shared/Field";
import type { FieldDef } from "../shared/fields";
import { calculateBlended } from "./math";
import { BlendedPrintSummary } from "./PrintSummary";
import { BlendedResults, blendedPercent, CAUTION } from "./Results";
import { addRow, blankRows, EXAMPLE_ROWS, MAX_ROWS, parseCompareRate, removeRow, rowName, toDebts, updateRow, type Row } from "./rows";

const NAME: FieldDef = { id: "name", label: "What is it?", type: "text", example: "" };
const BALANCE: FieldDef = { id: "balance", label: "Balance", type: "money", example: "" };
const RATE: FieldDef = { id: "rate", label: "Interest rate", type: "pct", example: "" };
const COMPARE: FieldDef = {
  id: "compare", label: "A new rate to compare", type: "pct", example: "",
  hint: "A rate you have been quoted or are considering.",
};
const TERM: FieldDef = {
  id: "term", label: "New loan term", type: "choice", example: "30",
  options: [10, 15, 20, 25, 30].map((y) => ({ value: String(y), label: `${y} yr` })),
  hint: "Used with the new rate to work out the new payment and the monthly savings.",
};
const ghost = "rounded-md border border-line bg-white px-3.5 py-2 text-[14px] font-bold text-ink hover:bg-paper-2";

/**
 * The Blended rate calculator. The rates here are the visitor's own debts, not a market rate, so
 * it takes no example rate from tenant config. The disclaimer comes from config through the route.
 */
export function BlendedRateCalculator({ disclaimer, breakevenHref }: {
  disclaimer: string;
  /** The Refinance breakeven calculator's path, or null while it is not live. */
  breakevenHref: string | null;
}) {
  const [rows, setRows] = useState<Row[]>(EXAMPLE_ROWS);
  const [compare, setCompare] = useState("");
  const [term, setTerm] = useState("30");
  const result = useMemo(() => calculateBlended(toDebts(rows), parseCompareRate(compare), Number(term)), [rows, compare, term]);

  // Adding or removing a row unmounts the button that was just pressed. Without this, keyboard
  // focus would drop to the top of the page. Send it to the new row, or to the Add button.
  const focusNext = useRef<string | null>(null);
  useEffect(() => {
    if (!focusNext.current) return;
    document.getElementById(focusNext.current)?.focus();
    focusNext.current = null;
  }, [rows]);
  const add = () => {
    const next = addRow(rows);
    if (next !== rows) focusNext.current = `blended-${next[next.length - 1].id}-name`;
    setRows(next);
  };
  const remove = (id: number) => {
    focusNext.current = "blended-add";
    setRows(removeRow(rows, id));
  };

  const cell = (row: Row, def: FieldDef) => (
    <Field
      def={def}
      idPrefix={`blended-${row.id}`}
      values={{ [def.id]: row[def.id as "name" | "balance" | "rate" | "payment"] }}
      numbers={{}}
      onChange={(field, value) => setRows((was) => updateRow(was, row.id, field as "name" | "balance" | "rate" | "payment", value))}
    />
  );

  return (
    <CalculatorShell
      formLabel="Debts"
      resultsId="blended-results"
      printBelowOnly
      onExample={() => { setRows(EXAMPLE_ROWS); setCompare(""); setTerm("30"); }}
      onClear={() => { setRows(blankRows()); setCompare(""); setTerm("30"); }}
      form={
        <>
          <section className="rounded-xl border border-line bg-white shadow-card">
            <h2 className="px-5 py-4 text-[17px] font-bold max-[600px]:px-4">The debts</h2>
            <div className="grid gap-4 px-5 pb-5 pt-1 max-[600px]:px-4">
              {rows.map((row, i) => (
                <fieldset key={row.id} className="m-0 min-w-0 rounded-lg border border-line p-3.5">
                  <legend className="px-1.5 text-[13px] font-bold">Debt {i + 1}</legend>
                  <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.8fr)] items-start gap-x-3 gap-y-3 max-[600px]:grid-cols-2">
                    <div className="max-[600px]:col-span-2">{cell(row, NAME)}</div>
                    {cell(row, BALANCE)}
                    {cell(row, RATE)}
                  </div>
                  {rows.length > 1 && (
                    <button
                      type="button"
                      aria-label={`Remove ${rowName(row, i)}`}
                      onClick={() => remove(row.id)}
                      className="mt-2.5 text-[13px] font-semibold text-muted underline hover:text-ink"
                    >
                      Remove
                    </button>
                  )}
                </fieldset>
              ))}
              {rows.length < MAX_ROWS && (
                <button id="blended-add" type="button" className={`${ghost} justify-self-start`} onClick={add}>
                  Add another debt
                </button>
              )}
            </div>
          </section>

          <AddDetail>
            <p className="mb-3.5 text-[14px] text-muted">
              Optional. Enter what you pay on each debt now and a new rate to see the monthly savings from one new
              loan. Payments do not change the blended rate.
            </p>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-x-4 gap-y-3.5">
              {rows.map((row, i) => (
                <div key={row.id}>
                  {cell(row, { id: "payment", label: `${rowName(row, i)} payment`, type: "money", example: "", hint: "Per month." })}
                </div>
              ))}
              <Field
                def={COMPARE}
                idPrefix="blended"
                values={{ compare }}
                numbers={{}}
                onChange={(_id, value) => setCompare(value)}
              />
              <Field def={TERM} idPrefix="blended" values={{ term }} numbers={{}} onChange={(_id, value) => setTerm(value)} />
            </div>
          </AddDetail>
        </>
      }
      results={<BlendedResults result={result} disclaimer={disclaimer} breakevenHref={breakevenHref} />}
      below={
        result && (
          <>
            {/* The printed page: the debts beside the result, then the caution and the disclaimer. */}
            <BlendedPrintSummary result={result} />
            <div className="mt-4 hidden print:block">
              <p className="text-[12px]">{CAUTION}</p>
              <p className="mt-2 text-[10px] text-muted">{disclaimer}</p>
            </div>

            {/* Phone: the blended rate pinned to the bottom of the screen, linking up to the results. */}
            <a
              href="#blended-results"
              className="fixed inset-x-3 bottom-3 z-10 hidden items-center gap-[18px] rounded-lg bg-green-900 px-3.5 py-2.5 text-white shadow-pop max-[980px]:flex print:hidden"
            >
              <span className="flex min-w-0 flex-col">
                <span className="text-[11px] text-on-dark-2">Blended rate</span>
                <strong className="text-[17px] tabular-nums">{blendedPercent(result.blendedRate)}</strong>
              </span>
              <span className="ml-auto whitespace-nowrap text-[13px] font-bold text-mint">See results</span>
            </a>
          </>
        )
      }
    />
  );
}
