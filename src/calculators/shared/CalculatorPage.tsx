import type { ReactNode } from "react";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { CtaBand } from "@/components/CtaBand";
import { PageJsonLd } from "@/components/seo/PageJsonLd";
import type { CalculatorEntry } from "../registry";
import { PrintLetterhead } from "./PrintLetterhead";

/**
 * The call to action under every calculator: start the matching application, or find a loan
 * officer through a plain link. It never opens the booking pop-up, so a calculator page collects
 * nothing from the visitor.
 */
export function CalculatorCta({ entry }: { entry: CalculatorEntry }) {
  return (
    <div className="print:hidden">
      <CtaBand
        title="Like these numbers?"
        lead="Start your application or talk it through with a loan officer."
        primaryHref={entry.applyHref}
        secondaryHref="/loan-officers"
        secondaryLabel="Find a loan officer"
        secondaryMode="link"
      />
    </div>
  );
}

/**
 * The page around a calculator, the same on every one: breadcrumb, the visitor's question as the
 * heading, an optional short intro, the calculator, "How this works", common questions, then the
 * call to action. A server component: the calculator itself is the client component passed as
 * children. In print, only a letterhead and the calculator's own printed content appear.
 */
export function CalculatorPage({ entry, intro, howItWorks, questions, children }: {
  entry: CalculatorEntry;
  /** One or two sentences under the heading. Leave out when the heading says enough. */
  intro?: string;
  /** Plain-language paragraphs. No formulas. */
  howItWorks: string[];
  questions: { q: string; a: string }[];
  children: ReactNode;
}) {
  return (
    <>
      <PageJsonLd path={entry.path} />

      <section className="bg-paper pb-6 pt-12 text-ink print:bg-white print:pb-0 print:pt-0">
        <div className="wrap">
          <Breadcrumb
            className="print:hidden"
            items={[{ label: "Home", href: "/" }, { label: "Calculators", href: "/calculators" }, { label: entry.label }]}
          />
          <PrintLetterhead />
          <h1 className="mt-4 text-[clamp(32px,4.2vw,48px)] font-extrabold tracking-[-0.03em] print:hidden">{entry.question}</h1>
          {intro && <p className="mt-3 max-w-[60ch] text-[18px] text-muted print:hidden">{intro}</p>}
        </div>
      </section>

      <section className="bg-paper pb-16 text-ink max-[980px]:pb-20 print:bg-white print:pb-0">
        <div className="wrap">{children}</div>
      </section>

      <section className="bg-paper-2 py-16 text-ink print:hidden">
        <div className="wrap grid grid-cols-2 gap-12 max-[980px]:grid-cols-1 max-[980px]:gap-10">
          <div>
            <h2 className="text-[26px] font-extrabold tracking-[-0.02em]">How this works</h2>
            <div className="mt-4 grid gap-3.5 text-[16px] text-muted">
              {howItWorks.map((p) => <p key={p}>{p}</p>)}
            </div>
          </div>
          <div>
            <h2 className="text-[26px] font-extrabold tracking-[-0.02em]">Common questions</h2>
            <dl className="mt-4 grid gap-5">
              {questions.map(({ q, a }) => (
                <div key={q}>
                  <dt className="text-[17px] font-bold">{q}</dt>
                  <dd className="m-0 mt-1.5 text-[16px] text-muted">{a}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      <CalculatorCta entry={entry} />
    </>
  );
}
