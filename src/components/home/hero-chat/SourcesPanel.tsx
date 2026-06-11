import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { BrainCitation } from "@/server/ai/brain/types";
import type { Sources } from "./threads";

/** Render a citation line, skipping null fields and sanitizing newlines. */
function citationLine(c: BrainCitation): string {
  return [
    c.sourceName,
    c.documentName,
    c.section,
    c.pageNumber ? `p. ${c.pageNumber}` : null,
    c.effectiveDate ? `eff. ${c.effectiveDate}` : null,
  ]
    .filter(Boolean)
    .map((s) => String(s).replace(/\s*\n\s*/g, " ").trim())
    .join(" · ");
}

/** Grounding panel under a grounded assistant bubble: citations (when
 *  present), the always-on compliance disclaimer, and the human-handoff CTA
 *  (when escalation is required). */
export function SourcesPanel({ sources }: { sources: Sources }) {
  return (
    <>
      {sources.citations.length > 0 && (
        <div className="mt-2 border-t border-line pt-2 text-[12px] text-[#6b756d]">
          <span className="font-semibold">Sources:</span>
          <ul className="mt-1 space-y-0.5">
            {sources.citations.map((c, i) => (
              <li key={i}>{citationLine(c)}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Disclaimer is rendered with EVERY grounded answer (compliance — not optional). */}
      <p className="mt-2 text-[11.5px] leading-snug text-[#6b756d]">{sources.disclaimer}</p>

      {sources.humanEscalationRequired && (
        <Link
          href="/loan-officers"
          className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-green-700 px-3.5 py-1.5 text-[13px] font-semibold text-white hover:bg-green-800"
        >
          Talk to a licensed loan officer <ArrowRight className="size-[15px]" strokeWidth={1.9} />
        </Link>
      )}
    </>
  );
}
