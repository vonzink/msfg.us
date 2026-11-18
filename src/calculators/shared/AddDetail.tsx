import type { ReactNode } from "react";

/**
 * The optional inputs of a calculator, closed until the visitor opens them. A native <details>, so
 * it works from the keyboard and without JavaScript. `data-calc-panel` lets CalculatorShell open it
 * for printing.
 */
export function AddDetail({ summary = "Add detail", children }: { summary?: string; children: ReactNode }) {
  return (
    <details data-calc-panel className="group rounded-xl border border-line bg-white shadow-card print:shadow-none print:break-inside-avoid">
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-xl px-5 py-4 max-[600px]:px-4 [&::-webkit-details-marker]:hidden">
        <span className="text-[17px] font-bold">{summary}</span>
        <span
          aria-hidden="true"
          className="ml-auto size-2.5 flex-none -translate-y-0.5 rotate-45 border-b-2 border-r-2 border-muted transition-transform group-open:translate-y-0.5 group-open:-rotate-135 print:hidden"
        />
      </summary>
      <div className="px-5 pb-5 pt-1 max-[600px]:px-4">{children}</div>
    </details>
  );
}
