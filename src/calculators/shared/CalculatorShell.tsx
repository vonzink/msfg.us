"use client";

import { useEffect, type ReactNode } from "react";

/**
 * The frame every calculator sits in: Load example / Clear / Print buttons, inputs on the left,
 * results on the right (stacked on a phone), and anything in `below` under both at full width.
 *
 * The results column sticks while the inputs scroll, on screens tall enough to hold it.
 */
export function CalculatorShell({ formLabel, resultsId, onExample, onClear, form, results, below }: {
  /** Accessible name of the inputs form, such as "Loan details". */
  formLabel: string;
  /** Id of the results section, for in-page links to it. */
  resultsId: string;
  onExample: () => void;
  onClear: () => void;
  form: ReactNode;
  results: ReactNode;
  below?: ReactNode;
}) {
  // Closed <details> do not print, so open every panel for the printout and restore after.
  useEffect(() => {
    let reopened: HTMLDetailsElement[] = [];
    const before = () => {
      reopened = Array.from(document.querySelectorAll<HTMLDetailsElement>("details[data-calc-panel]")).filter((d) => !d.open);
      reopened.forEach((d) => (d.open = true));
    };
    const after = () => {
      reopened.forEach((d) => (d.open = false));
      reopened = [];
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);

  const ghost = "rounded-md border border-line bg-white px-3.5 py-2 text-[14px] font-bold text-ink hover:bg-paper-2";

  return (
    <>
      <div className="mb-5 flex flex-wrap gap-2.5 print:hidden">
        <button type="button" className={ghost} onClick={onExample}>Load example</button>
        <button type="button" className={ghost} onClick={onClear}>Clear</button>
        <button type="button" className={ghost} onClick={() => window.print()}>Print / Save PDF</button>
      </div>

      <div className="grid grid-cols-[minmax(0,5fr)_minmax(0,6fr)] items-start gap-7 max-[980px]:grid-cols-1 max-[980px]:gap-5 print:block">
        <form aria-label={formLabel} className="grid gap-3.5" onSubmit={(e) => e.preventDefault()} noValidate>
          {form}
        </form>

        <section id={resultsId} aria-label="Results" className="grid scroll-mt-24 gap-4 print:mt-4 [@media(min-width:981px)_and_(min-height:1000px)]:sticky [@media(min-width:981px)_and_(min-height:1000px)]:top-24">
          {results}
        </section>
      </div>

      {below}
    </>
  );
}
