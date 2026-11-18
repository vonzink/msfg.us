import type { ReactNode } from "react";

export type PrintColumn = { heading: string; rows: { label: string; value: ReactNode }[] };

/**
 * The top of a calculator's printed page: a title and two columns of label and value, usually what
 * was entered on the left and what it comes to on the right. Hidden on screen. Use it with
 * CalculatorShell's `printBelowOnly`, and put whatever table should print underneath it.
 */
export function PrintSummary({ title, columns }: { title: string; columns: [PrintColumn, PrintColumn] }) {
  return (
    <section aria-label="Estimate summary" className="hidden text-[12px] print:block">
      <h2 className="text-[18px] font-extrabold tracking-[-0.01em]">{title}</h2>
      <div className="mt-3 grid grid-cols-2 gap-x-10">
        {columns.map((column) => (
          <div key={column.heading}>
            <h3 className="mb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">{column.heading}</h3>
            <dl className="m-0">
              {column.rows.map((row) => (
                <div key={row.label} className="flex items-baseline justify-between gap-4 border-b border-line py-1">
                  <dt className="text-muted">{row.label}</dt>
                  <dd className="m-0 font-semibold tabular-nums">{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </section>
  );
}
