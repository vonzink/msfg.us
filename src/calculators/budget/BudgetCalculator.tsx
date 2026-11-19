"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AddDetail } from "../shared/AddDetail";
import { CalculatorShell } from "../shared/CalculatorShell";
import { Field } from "../shared/Field";
import { typedAmount, type FieldDef, type Values } from "../shared/fields";
import {
  BALANCE_FIELDS, BLANK, debtPaymentLabel, entryFaults, exampleValues, FRONT_FIELDS, GROUPS, groupTotal, HOUSING_LINES, isItemized, LIVING_LINES, MODE_FIELDS,
  SAVINGS_RATE_FIELD, savingsRateUnreadable, toInput, type Group,
} from "./fields";
import { calculateBudget } from "./math";
import { BudgetPrintDetails, BudgetPrintSummary, type PrintGroup } from "./PrintSummary";
import { BudgetResults, fallsShort, ITEMIZED_HINT, PRIVACY_LINE, usd, type FormState } from "./Results";
import { addRow, blankRows, MAX_ROWS, removeRow, rowName, updateRow, type Row } from "./rows";

const grid = "grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-x-4 gap-y-3.5";
const card = "rounded-xl border border-line bg-white shadow-card";
const ghost = "rounded-md border border-line bg-white px-3.5 py-2 text-[14px] font-bold text-ink hover:bg-paper-2";
const partHeading = "text-[15px] font-bold";
const NO_NUMBERS = {};

const front = (id: string) => FRONT_FIELDS.find((f) => f.id === id)!;
const modeField = (group: Group) => MODE_FIELDS.find((f) => f.id === `${group}Mode`)!;
const DEBT_NAME: FieldDef = { id: "name", label: "What is it?", type: "text", example: "" };
/** A debt of $0 a month is an answer, so a typed 0 stays in the box. */
const debtPayment = (row: Row, index: number): FieldDef => ({
  id: "payment", label: debtPaymentLabel(row, index), type: "money", example: "", keepZero: true,
});
const SAVINGS_WARNING = "Enter a number, or leave it empty.";
const PART_HEADING: Record<Group, string> = {
  housing: "Housing, line by line",
  debts: "Debts, one by one",
  living: "Living costs, by category",
};

/** What the front box of an itemized group shows: the sum of its lines, or nothing while none is entered. */
const totalText = (amount: number) => (Number.isNaN(amount) ? "" : amount.toLocaleString("en-US", { maximumFractionDigits: 2 }));
const enteredLines = (defs: FieldDef[], values: Values) =>
  defs.map((f) => ({ label: f.label, amount: typedAmount(values[f.id]) })).filter((l) => !Number.isNaN(l.amount));

/**
 * The Home budget calculator. There is no interest rate here, so it takes no example rate from
 * tenant config; the disclaimer comes from config through the route page.
 * Nothing typed here is stored or sent.
 */
export function BudgetCalculator({ disclaimer, mortgageHref }: {
  disclaimer: string;
  /** The Mortgage calculator's path, or null when it is switched off. */
  mortgageHref: string | null;
}) {
  const [values, setValues] = useState<Values>(exampleValues);
  const [rows, setRows] = useState<Row[]>(blankRows);
  const onChange = (id: string, value: string) => setValues((v) => ({ ...v, [id]: value }));

  // One input feeds the math, the results and the printed page.
  const input = useMemo(() => toInput(values, rows), [values, rows]);
  const form = useMemo<FormState>(
    () => ({ itemized: GROUPS.filter((g) => isItemized(values, g)), savingsUnreadable: savingsRateUnreadable(values), ...entryFaults(values, rows) }),
    [values, rows],
  );
  // An optional box holding something unreadable is not counted as 0%, and a negative line is not
  // quietly taken off a sum: there is no result until it is fixed.
  const result = useMemo(() => (form.savingsUnreadable || form.negative ? null : calculateBudget(input)), [form, input]);

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
    if (next !== rows) focusNext.current = `budget-debt-${next[next.length - 1].id}-name`;
    setRows(next);
  };
  const remove = (id: number) => {
    focusNext.current = "budget-debt-add";
    setRows(removeRow(rows, id));
  };

  const field = (def: FieldDef) => (
    <Field key={def.id} def={def} idPrefix="budget" values={values} numbers={NO_NUMBERS} onChange={onChange} />
  );
  /** The front box of a group: typed as one total, or read-only showing the sum the math uses. Read-only, so it can still be reached and read. */
  const groupBox = (group: Group) => {
    const itemized = isItemized(values, group);
    return (
      <Field
        def={front(group)}
        idPrefix="budget"
        values={itemized ? { [group]: totalText(groupTotal(values, rows, group)) } : values}
        numbers={NO_NUMBERS}
        onChange={onChange}
        readOnly={itemized}
        readOnlyHint={ITEMIZED_HINT}
      />
    );
  };
  const cell = (row: Row, def: FieldDef) => (
    <Field
      def={def}
      idPrefix={`budget-debt-${row.id}`}
      values={{ [def.id]: row[def.id as "name" | "payment"] }}
      numbers={NO_NUMBERS}
      onChange={(id, value) => setRows((was) => updateRow(was, row.id, id as "name" | "payment", value))}
    />
  );
  const savingsRate: FieldDef = { ...SAVINGS_RATE_FIELD, warnFn: () => (form.savingsUnreadable ? SAVINGS_WARNING : null) };

  // The printed page lists the lines of each itemized group, as the math read them.
  const printGroups: PrintGroup[] = form.itemized
    .map((group) => ({
      heading: PART_HEADING[group],
      lines: group === "debts"
        ? rows.map((r, i) => ({ label: rowName(r, i), amount: typedAmount(r.payment) })).filter((l) => !Number.isNaN(l.amount))
        : enteredLines(group === "housing" ? HOUSING_LINES : LIVING_LINES, values),
    }))
    .filter((g) => g.lines.length > 0);

  return (
    <CalculatorShell
      formLabel="Income and monthly costs"
      resultsId="budget-results"
      printBelowOnly
      onExample={() => { setValues(exampleValues()); setRows(blankRows()); }}
      onClear={() => { setValues(BLANK); setRows(blankRows()); }}
      form={
        <div className="contents">
          <section className={card}>
            <h2 className="px-5 py-4 text-[17px] font-bold max-[600px]:px-4">Income</h2>
            <div className="px-5 pb-5 pt-1 max-[600px]:px-4">
              <div className={grid}>{field(front("grossIncome"))}{field(front("taxRate"))}</div>
            </div>
          </section>

          <section className={card}>
            <h2 className="px-5 py-4 text-[17px] font-bold max-[600px]:px-4">Each month</h2>
            <div className="px-5 pb-5 pt-1 max-[600px]:px-4">
              <div className={grid}>
                <div className="flex min-w-0 flex-col gap-1.5">
                  {groupBox("housing")}
                  {mortgageHref && (
                    <Link href={mortgageHref} target="_blank" rel="noopener noreferrer" className="self-start text-[13px] font-semibold text-green-700 underline">
                      Work this out<span className="sr-only"> with the mortgage calculator (opens in a new tab)</span>
                    </Link>
                  )}
                </div>
                {groupBox("debts")}
                {groupBox("living")}
              </div>
            </div>
          </section>

          <AddDetail>
            <p className="mb-4 text-[14px] text-muted">
              Optional. Enter housing, debts or living costs line by line instead of as one total, and add savings.
            </p>
            <div className="grid gap-6">
              <section className="grid gap-3">
                <h3 className={partHeading}>{PART_HEADING.housing}</h3>
                <div className={grid}>
                  {field(modeField("housing"))}
                  {isItemized(values, "housing") && HOUSING_LINES.map(field)}
                </div>
              </section>

              <section className="grid gap-3">
                <h3 className={partHeading}>{PART_HEADING.debts}</h3>
                <div className={grid}>{field(modeField("debts"))}</div>
                {isItemized(values, "debts") && (
                  <div className="grid gap-3">
                    {rows.map((row, i) => (
                      <fieldset key={row.id} className="m-0 min-w-0 rounded-lg border border-line p-3.5">
                        <legend className="px-1.5 text-[13px] font-bold">Debt {i + 1}</legend>
                        <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] items-start gap-x-3 gap-y-3 max-[600px]:grid-cols-1">
                          {cell(row, DEBT_NAME)}
                          {cell(row, debtPayment(row, i))}
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
                      <button id="budget-debt-add" type="button" className={`${ghost} justify-self-start`} onClick={add}>
                        Add another debt
                      </button>
                    )}
                  </div>
                )}
              </section>

              <section className="grid gap-3">
                <h3 className={partHeading}>{PART_HEADING.living}</h3>
                <div className={grid}>
                  {field(modeField("living"))}
                  {isItemized(values, "living") && LIVING_LINES.map(field)}
                </div>
              </section>

              <section className="grid gap-3">
                <h3 className={partHeading}>Savings</h3>
                <div className={grid}>{field(savingsRate)}</div>
                <p className="text-[14px] text-muted">Account balances. Enter what would be left after your down payment and closing costs.</p>
                <div className={grid}>{BALANCE_FIELDS.map(field)}</div>
              </section>
            </div>
          </AddDetail>

          <p className="mx-1 text-[13px] text-muted">{PRIVACY_LINE}</p>
        </div>
      }
      results={<BudgetResults input={input} result={result} disclaimer={disclaimer} form={form} />}
      below={
        result && (
          <>
            {/* The printed page: the month beside the estimate, then the lines, the note, the privacy line and the disclaimer. */}
            <BudgetPrintSummary input={input} result={result} />
            <BudgetPrintDetails groups={printGroups} disclaimer={disclaimer} />

            {/* Phone: the headline pinned to the bottom of the screen, linking up to the results. */}
            <a
              href="#budget-results"
              className="fixed inset-x-3 bottom-3 z-10 hidden items-center gap-[18px] rounded-lg bg-green-900 px-3.5 py-2.5 text-white shadow-pop max-[980px]:flex print:hidden"
            >
              <span className="flex min-w-0 flex-col">
                <span className="text-[11px] text-on-dark-2">{fallsShort(result.cashFlow) ? "Short each month" : "Left each month"}</span>
                <strong className="text-[17px] tabular-nums">{usd(Math.abs(Math.round(result.cashFlow)))}</strong>
              </span>
              <span className="ml-auto whitespace-nowrap text-[13px] font-bold text-mint">See results</span>
            </a>
          </>
        )
      }
    />
  );
}
