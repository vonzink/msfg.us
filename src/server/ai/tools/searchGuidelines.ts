import "server-only";
import { getMortgageBrain } from "@/server/ai/brain";
import { unavailableAnswer } from "@/server/ai/brain/types";
import type { BrainAnswer, BrainCitation } from "@/server/ai/brain/types";

export type GuidelineSources = {
  citations: BrainCitation[];
  disclaimer: string;
  humanEscalationRequired: boolean;
};
export type SearchGuidelinesResult = { text: string; sources: GuidelineSources };
export type SearchGuidelinesInput = { question: string; loanType?: string; state?: string };

function citationLine(c: BrainCitation): string {
  return [c.sourceName, c.documentName, c.section, c.pageNumber ? `p.${c.pageNumber}` : null]
    .filter(Boolean)
    .join(" · ");
}
/** Format a brain answer into the string the model reasons over. */
function toModelText(a: BrainAnswer): string {
  const sources = a.citations.length
    ? `\nSources:\n${a.citations.map((c) => `- ${citationLine(c)}`).join("\n")}`
    : "";
  return `${a.answer}${sources}\n\nDisclaimer: ${a.disclaimer}`;
}
function sourcesOf(a: BrainAnswer): GuidelineSources {
  return { citations: a.citations, disclaimer: a.disclaimer, humanEscalationRequired: a.humanEscalationRequired };
}
/**
 * `search_guidelines` tool — grounds a regulated mortgage question in the tenant's
 * Mortgage Brain (RAG) and returns the result in two shapes:
 *
 * - `text`: the brain's compliance-locked answer plus a rendered "Sources" list
 *   and disclaimer, formatted as the string the LLM reasons over so it cites real
 *   guidelines instead of fabricating them.
 * - `sources`: the structured citations + disclaimer + escalation flag for the UI.
 *
 * When the brain is disabled/unconfigured (`getMortgageBrain()` → null) or its
 * `ask` returns an error, this falls back to the compliant `unavailableAnswer()`
 * which escalates to a licensed loan officer and sets `humanEscalationRequired`.
 * It never invents mortgage content.
 */
export async function runSearchGuidelines(
  input: SearchGuidelinesInput,
  sessionId: string,
): Promise<SearchGuidelinesResult> {
  const brain = await getMortgageBrain();
  if (!brain) {
    const fallback = unavailableAnswer();
    return { text: toModelText(fallback), sources: sourcesOf(fallback) };
  }
  const result = await brain.ask({ question: input.question, sessionId, loanType: input.loanType, state: input.state });
  const answer = result.ok ? result.answer : unavailableAnswer();
  return { text: toModelText(answer), sources: sourcesOf(answer) };
}
