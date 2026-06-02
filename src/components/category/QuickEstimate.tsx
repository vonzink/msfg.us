"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { monthlyPayment, formatUSD } from "@/lib/finance";
import type { Intent, QuickEstimateConfig } from "@/content/categories";

/** Derive the amortized loan principal from the two inputs, per category. */
function derivePrincipal(
  mode: QuickEstimateConfig["principal"],
  a: number,
  b: number,
): number {
  switch (mode) {
    case "priceDown":
      return a * (1 - b / 100); // price × (1 − down%)
    case "balancePlus":
      return a + b; // balance + cash out
    case "valueMinus":
      return a - b; // home value − mortgage balance
  }
}

/** Parse a possibly comma-formatted numeric string into an integer. */
function parseNum(raw: string): number {
  const n = Number(raw.replace(/\D/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Live payment estimator (hero side card). Two numeric inputs feed the
 * standard fixed-rate amortization; the result strip updates on every
 * keystroke. The "Get my real rate" button routes to the apply flow.
 */
export function QuickEstimate({
  q,
  intent,
}: {
  q: QuickEstimateConfig;
  intent: Intent;
}) {
  const [a, setA] = useState(q.inputs[0].default);
  const [b, setB] = useState(q.inputs[1].default);

  const isPct = q.inputs[1].kind === "downPct";
  const principal = derivePrincipal(q.principal, a, b);
  const payment = monthlyPayment(principal, q.apr, q.termMonths);

  const aId = "qe-a";
  const bId = "qe-b";

  return (
    <div className="rounded-xl bg-white p-[26px] text-ink shadow-hero">
      <h2 className="m-0 mb-1 text-[19px] font-bold tracking-[-0.01em]">
        {q.title}
      </h2>
      <div className="text-[14px] text-muted">
        Indicative only · {q.apr}% APR assumed
      </div>

      <div className="mt-[18px] flex flex-col gap-3.5">
        {/* Input A */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={aId}
            className="text-[12px] font-bold uppercase tracking-[0.03em] text-muted"
          >
            {q.inputs[0].label}
          </label>
          <div className="flex h-[50px] items-center gap-2 rounded-md border-[1.5px] border-line px-3.5 text-[17px] font-bold shadow-3d focus-within:border-spring">
            <span className="text-muted">$</span>
            <input
              id={aId}
              inputMode="numeric"
              className="w-full border-0 bg-transparent text-[17px] font-bold outline-none"
              value={a.toLocaleString("en-US")}
              onChange={(e) => setA(parseNum(e.target.value))}
            />
          </div>
        </div>

        {/* Input B */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={bId}
            className="text-[12px] font-bold uppercase tracking-[0.03em] text-muted"
          >
            {q.inputs[1].label}
            {isPct ? " (%)" : ""}
          </label>
          <div className="flex h-[50px] items-center gap-2 rounded-md border-[1.5px] border-line px-3.5 text-[17px] font-bold shadow-3d focus-within:border-spring">
            {!isPct && <span className="text-muted">$</span>}
            <input
              id={bId}
              inputMode="numeric"
              className="w-full border-0 bg-transparent text-[17px] font-bold outline-none"
              value={isPct ? b : b.toLocaleString("en-US")}
              onChange={(e) => setB(parseNum(e.target.value))}
            />
            {isPct && <span className="text-muted">%</span>}
          </div>
        </div>

        {/* Result strip */}
        <div className="mt-1 flex items-baseline justify-between gap-3 rounded-lg bg-green-800 px-[18px] py-4 text-white">
          <div>
            <div className="text-[12px] text-on-dark-2">Est. monthly</div>
            <div className="text-[34px] font-extrabold tracking-[-0.03em] text-mint">
              {formatUSD(payment)}
            </div>
          </div>
          <Button href={`/apply/${intent}`} size="sm">
            Get my real rate
          </Button>
        </div>
      </div>
    </div>
  );
}
