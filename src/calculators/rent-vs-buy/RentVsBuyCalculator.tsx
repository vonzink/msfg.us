"use client";

import { useMemo, useState } from "react";
import { AddDetail } from "../shared/AddDetail";
import { CalculatorShell } from "../shared/CalculatorShell";
import { Field } from "../shared/Field";
import { parseNumber, switchDownUnit, type FieldDef, type Numbers, type Values } from "../shared/fields";
import { BLANK, DETAIL_FIELDS, downPaymentBox, exampleValues, FRONT_FIELDS, toInput } from "./fields";
import { calculateRentVsBuy } from "./math";
import { RentVsBuyPrintDetails, RentVsBuyPrintSummary } from "./PrintSummary";
import { headlineText, MI_NOT_COUNTED, mortgageInsuranceIgnored, RentVsBuyResults, yearsText } from "./Results";

const grid = "grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-x-4 gap-y-3.5";
const card = "rounded-xl border border-line bg-white shadow-card";
const CARDS: { heading: string; ids: string[] }[] = [
  { heading: "Renting", ids: ["monthlyRent"] },
  { heading: "Buying", ids: ["homePrice", "downPayment", "downUnit", "rate"] },
  { heading: "How long", ids: ["stayYears"] },
];

/**
 * The Rent vs buy calculator. The example interest rate, the note under that field and the
 * disclaimer come from tenant config through the route page, never from a constant here.
 * Nothing typed here is stored or sent.
 */
export function RentVsBuyCalculator({ exampleRatePct, exampleRateNote, disclaimer }: {
  exampleRatePct: number;
  exampleRateNote: string;
  disclaimer: string;
}) {
  const [values, setValues] = useState<Values>(() => exampleValues(exampleRatePct));
  // Zero down is an answer here, so a typed 0 stays in the box when the unit changes.
  const onChange = (id: string, value: string) => {
    setValues((v) => (id === "downUnit" ? switchDownUnit(v, value, true) : { ...v, [id]: value }));
  };

  const numbers = useMemo<Numbers>(
    () => Object.fromEntries(Object.entries(values).map(([id, v]) => [id, parseNumber(v)])),
    [values],
  );
  // One input feeds the math, the results, the assumptions list and the printed page.
  const input = useMemo(() => toInput(values), [values]);
  const result = useMemo(() => calculateRentVsBuy(input), [input]);

  const front: FieldDef[] = FRONT_FIELDS.map((f) =>
    f.id === "downPayment" ? downPaymentBox(values.downUnit) : f.id === "rate" ? { ...f, hint: exampleRateNote } : f,
  );
  // Mortgage insurance typed with 20% or more down is not charged: say so under the box.
  const detail: FieldDef[] = DETAIL_FIELDS.map((f) =>
    f.id === "monthlyMi" ? { ...f, warnFn: () => (mortgageInsuranceIgnored(input) ? MI_NOT_COUNTED : null) } : f,
  );
  const field = (def: FieldDef) => (
    <Field key={def.id} def={def} idPrefix="rentbuy" values={values} numbers={numbers} onChange={onChange} />
  );

  return (
    <CalculatorShell
      formLabel="Rent and home details"
      resultsId="rentbuy-results"
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
            <p className="mb-3.5 text-[14px] text-muted">These are the assumptions behind the estimate. Change any that do not fit.</p>
            <div className={grid}>{detail.map(field)}</div>
          </AddDetail>
        </div>
      }
      results={<RentVsBuyResults input={input} result={result} disclaimer={disclaimer} />}
      below={
        result && (
          <>
            {/* The printed page: the numbers beside the estimate, then the assumptions, the caution and the disclaimer. */}
            <RentVsBuyPrintSummary input={input} result={result} />
            <RentVsBuyPrintDetails input={input} result={result} disclaimer={disclaimer} />

            {/* Phone: the headline pinned to the bottom of the screen, linking up to the results. */}
            <a
              href="#rentbuy-results"
              className="fixed inset-x-3 bottom-3 z-10 hidden items-center gap-[18px] rounded-lg bg-green-900 px-3.5 py-2.5 text-white shadow-pop max-[980px]:flex print:hidden"
            >
              <span className="flex min-w-0 flex-col">
                <span className="text-[11px] text-on-dark-2">After {yearsText(input.stayYears)}</span>
                <strong className="text-[15px] leading-tight tabular-nums">{headlineText(result)}</strong>
              </span>
              <span className="ml-auto whitespace-nowrap text-[13px] font-bold text-mint">See results</span>
            </a>
          </>
        )
      }
    />
  );
}
