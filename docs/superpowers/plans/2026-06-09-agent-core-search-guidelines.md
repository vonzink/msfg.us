# Agent Core — `search_guidelines` (Slice 1B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the agentic chat route the on-site front door and turn the Mortgage Brain into a tool the agent calls — `search_guidelines` — so the assistant answers conversationally while the brain's citations + disclaimer + escalation ride along.

**Architecture:** A new `search_guidelines` tool wraps `getMortgageBrain().ask()` and returns both (a) a string the model reasons over and (b) structured `sources` (citations/disclaimer/escalation). `runTool` is widened to return `{ text, data? }`; the chat route feeds `text` back to the model and emits a `sources` SSE event for the widget to render deterministically (so the disclaimer/citations never depend on the model). The widget's front door swaps from `/api/v1/ai/ask` to the streaming `/api/v1/ai/chat`. The system prompt gains a grounding guardrail.

**Tech Stack:** Next.js 16 · React 19 · TypeScript · Vitest. Reuses existing `AiProvider`, `TOOLS`/`runTool`, `getMortgageBrain`, `AiWidget`.

**Prereq for live test:** brain running + reachable (`ai.brain.enabled` + `baseUrl`) and an AI provider key (`ai_api_key` or `DEEPSEEK_API_KEY`). Unit tests mock both.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/server/ai/tools/searchGuidelines.ts` (new) | Brain-wrapper: `runSearchGuidelines()` → `{ text, sources }` |
| `src/server/ai/tools/searchGuidelines.test.ts` (new) | Vitest (mocked brain) |
| `src/server/ai/tools.ts` (modify) | Widen `runTool` → `{ text, data? }`; register `search_guidelines` |
| `src/server/ai/tools.test.ts` (modify) | Update for the new return shape |
| `src/server/ai/prompt.ts` (modify) | Grounding guardrail for `search_guidelines` |
| `src/app/api/v1/ai/chat/route.ts` (modify) | Use `{text,data}`; emit `sources` SSE event |
| `src/components/home/AiWidget.tsx` (modify) | Front door → `/chat`; parse + render `sources` |

---

### Task 1: `search_guidelines` brain-wrapper tool

**Files:**
- Create: `src/server/ai/tools/searchGuidelines.ts`
- Test: `src/server/ai/tools/searchGuidelines.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/server/ai/tools/searchGuidelines.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { runSearchGuidelines } from "./searchGuidelines";
import * as brainModule from "@/server/ai/brain";

vi.mock("@/server/ai/brain");

const ANSWER = {
  conversationId: "c1",
  answer: "FHA allows 3.5% down at 580+ FICO.",
  citations: [
    { sourceName: "HUD", documentName: "4000.1", section: "II.A", pageNumber: "12", effectiveDate: "2026-01-01" },
  ],
  confidence: 0.9,
  humanEscalationRequired: false,
  disclaimer: "General info, not a commitment to lend.",
};

beforeEach(() => vi.resetAllMocks());

describe("runSearchGuidelines", () => {
  it("returns model text grounded in the brain answer + structured sources", async () => {
    vi.mocked(brainModule.getMortgageBrain).mockResolvedValue({
      ask: vi.fn().mockResolvedValue({ ok: true, data: ANSWER }),
    } as never);

    const res = await runSearchGuidelines({ question: "FHA down payment?" }, "sess1");

    expect(res.text).toContain("FHA allows 3.5% down");
    expect(res.text).toContain("4000.1"); // citation visible to the model
    expect(res.sources).toEqual({
      citations: ANSWER.citations,
      disclaimer: ANSWER.disclaimer,
      humanEscalationRequired: false,
    });
  });

  it("falls back to an escalation message when the brain is unavailable", async () => {
    vi.mocked(brainModule.getMortgageBrain).mockResolvedValue(null);

    const res = await runSearchGuidelines({ question: "anything" }, "sess1");

    expect(res.text.toLowerCase()).toContain("loan officer");
    expect(res.sources?.humanEscalationRequired).toBe(true);
  });

  it("escalates on a brain error result", async () => {
    vi.mocked(brainModule.getMortgageBrain).mockResolvedValue({
      ask: vi.fn().mockResolvedValue({ ok: false, error: "timeout" }),
    } as never);

    const res = await runSearchGuidelines({ question: "x" }, "sess1");
    expect(res.sources?.humanEscalationRequired).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/server/ai/tools/searchGuidelines.test.ts`
Expected: FAIL — "Cannot find module './searchGuidelines'".

- [ ] **Step 3: Write the tool**

```typescript
// src/server/ai/tools/searchGuidelines.ts
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

export type SearchGuidelinesInput = {
  question: string;
  loanType?: string;
  state?: string;
};

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
  return {
    citations: a.citations,
    disclaimer: a.disclaimer,
    humanEscalationRequired: a.humanEscalationRequired,
  };
}

/**
 * Ground a mortgage-guideline question in the Mortgage Brain (RAG). Returns the
 * brain's answer formatted for the model PLUS structured `sources` the route
 * renders deterministically (so the disclaimer/citations never depend on the
 * model paraphrasing). Falls back to an escalation message when the brain is
 * disabled or unreachable — never fabricates regulated guidance.
 */
export async function runSearchGuidelines(
  input: SearchGuidelinesInput,
  sessionId: string,
): Promise<SearchGuidelinesResult> {
  const brain = await getMortgageBrain();
  if (!brain) {
    return { text: toModelText(unavailableAnswer), sources: sourcesOf(unavailableAnswer) };
  }
  const result = await brain.ask({
    question: input.question,
    sessionId,
    loanType: input.loanType,
    state: input.state,
  });
  const answer = result.ok ? result.data : unavailableAnswer;
  return { text: toModelText(answer), sources: sourcesOf(answer) };
}
```

> Note: if `src/server/ai/brain/types.ts` does not already export `BrainCitation`/`BrainAnswer` types and `unavailableAnswer`, add the exports (they exist per the brain client) — do not redefine.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/server/ai/tools/searchGuidelines.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/ai/tools/searchGuidelines.ts src/server/ai/tools/searchGuidelines.test.ts
git commit -m "feat(ai): add search_guidelines brain-wrapper tool"
```

---

### Task 2: Widen the tool-result contract to carry structured data

**Files:**
- Modify: `src/server/ai/tools.ts`
- Modify: `src/server/ai/tools.test.ts`

**Context:** `runTool(name, input)` currently returns `Promise<string>`. Widen it to
`Promise<ToolResult>` where `ToolResult = { text: string; sources?: GuidelineSources }`.
Existing tools wrap their string as `{ text }`; `search_guidelines` returns `{ text, sources }`.
The chat route (Task 4) consumes the new shape.

- [ ] **Step 1: Update the test for the new shape**

In `src/server/ai/tools.test.ts`, change assertions that expect a string from `runTool` to expect `{ text }`. Add a case:

```typescript
import { vi } from "vitest";
import * as sg from "@/server/ai/tools/searchGuidelines";

it("runTool('search_guidelines') returns text + sources", async () => {
  vi.spyOn(sg, "runSearchGuidelines").mockResolvedValue({
    text: "grounded answer",
    sources: { citations: [], disclaimer: "d", humanEscalationRequired: false },
  });
  const r = await runTool("search_guidelines", { question: "q" }, "sess1");
  expect(r.text).toBe("grounded answer");
  expect(r.sources).toBeDefined();
});

it("existing tools return { text } only", async () => {
  const r = await runTool("calculate_payment", { price: 400000, downPct: 20, rate: 6.5, termYears: 30 }, "sess1");
  expect(typeof r.text).toBe("string");
  expect(r.sources).toBeUndefined();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/server/ai/tools.test.ts`
Expected: FAIL (runTool signature/return mismatch).

- [ ] **Step 3: Widen `runTool`**

In `src/server/ai/tools.ts`:

```typescript
import { runSearchGuidelines, type GuidelineSources } from "@/server/ai/tools/searchGuidelines";

export type ToolResult = { text: string; sources?: GuidelineSources };

// Add the descriptor to TOOLS:
//   {
//     name: "search_guidelines",
//     description:
//       "Look up grounded answers to mortgage GUIDELINE, eligibility, pricing (LLPA), program, or required-document questions from MSFG's source library. Use for any specific 'do I qualify', max-LTV, rate-adjustment, or 'what documents' question. Returns an answer with cited sources and a disclaimer.",
//     parameters: {
//       type: "object",
//       properties: {
//         question: { type: "string", description: "The borrower's mortgage question, self-contained." },
//         loanType: { type: "string", description: "Optional: FHA, VA, Conventional, USDA, Jumbo." },
//         state: { type: "string", description: "Optional: 2-letter US state." },
//       },
//       required: ["question"],
//     },
//   },

export async function runTool(
  name: string,
  input: unknown,
  sessionId: string,
): Promise<ToolResult> {
  try {
    switch (name) {
      case "calculate_payment":
        return { text: runCalculatePayment(input) };
      case "lookup_rates":
        return { text: runLookupRates(input) };
      case "explain_program":
        return { text: runExplainProgram(input) };
      case "capture_lead":
        return { text: await runCaptureLead(input) };
      case "search_guidelines":
        return await runSearchGuidelines(input as never, sessionId);
      default:
        return { text: `Unknown tool "${name}".` };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      text: `The ${name} tool hit an error: ${message.slice(0, 200)}. Please offer general guidance or a loan officer instead.`,
    };
  }
}
```

(Note the new third arg `sessionId` — the brain needs it. Existing callers other than the chat route, if any, pass the session id; search the repo for `runTool(` and update call sites.)

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/server/ai/tools.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/ai/tools.ts src/server/ai/tools.test.ts
git commit -m "feat(ai): widen runTool to carry structured tool data + register search_guidelines"
```

---

### Task 3: Ground the system prompt

**Files:**
- Modify: `src/server/ai/prompt.ts`

- [ ] **Step 1: Add the grounding guardrail to `SYSTEM_PROMPT`**

Append a guardrail block to the existing prompt string (keep it static — caching contract; no interpolation). Insert near the other guardrails:

```
- GROUNDING: For any specific mortgage GUIDELINE, eligibility ("do I qualify"), pricing/rate-adjustment, program, or required-document question, you MUST call the search_guidelines tool and base your answer on its result. Never state guideline numbers, max LTV/DTI, rate adjustments, or document requirements from memory. Present the tool's answer in plain, conversational language, keep any cited sources it returns, and never omit the disclaimer. If search_guidelines signals a human is needed (or returns low confidence), warmly offer to connect the borrower with a licensed loan officer.
```

- [ ] **Step 2: Typecheck (the prompt is a plain string)**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/server/ai/prompt.ts
git commit -m "feat(ai): ground system prompt on search_guidelines for regulated answers"
```

---

### Task 4: Chat route — consume `{text,data}` and emit a `sources` event

**Files:**
- Modify: `src/app/api/v1/ai/chat/route.ts`

- [ ] **Step 1: Pass `sessionId` to `runTool` and handle the new result shape**

Where the route currently does `const result = await runTool(tc.name, parsed);`, change to:

```typescript
const result = await runTool(tc.name, parsed, sessionId ?? "anon");
await record("tool", result.text, tc.name);
if (result.sources) {
  controller.enqueue(
    sse({
      type: "sources",
      citations: result.sources.citations,
      disclaimer: result.sources.disclaimer,
      humanEscalationRequired: result.sources.humanEscalationRequired,
    }),
  );
}
history.push({
  role: "tool",
  toolCallId: tc.id,
  name: tc.name,
  result: result.text,
});
```

(`record(...)` and the `history.push` must use `result.text`, not the old string `result`.)

- [ ] **Step 2: Verify the route compiles + existing route test passes**

Run: `npx tsc --noEmit && npx vitest run src/app/api/v1/ai`
Expected: PASS. (If a chat-route test exists, update it for the `sources` event; if only the `/ask` route is tested, no change needed.)

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/v1/ai/chat/route.ts"
git commit -m "feat(ai): emit structured sources SSE event from the agentic chat route"
```

---

### Task 5: Widget — front door to `/chat`, render `sources`

**Files:**
- Modify: `src/components/home/AiWidget.tsx`

- [ ] **Step 1: Make the agentic `/chat` path the front door**

Route every send through `sendViaChat` (the brain is now reached via the `search_guidelines` tool inside `/chat`). In `send(...)`, replace the `brainEnabled ? sendViaBrain : sendViaChat` branch with `await sendViaChat(text)`. Keep `sendViaBrain`/`AnswerBubble` only if reused for rendering (Step 2); otherwise remove the now-dead direct-brain path and the `brainEnabled` prop.

- [ ] **Step 2: Parse the `sources` SSE event and attach it to the streamed answer**

Extend the `ChatEvent` type and the `handle(evt)` switch in `sendViaChat`:

```typescript
type ChatEvent =
  | { type: "session"; sessionId: string }
  | { type: "text"; value: string }
  | { type: "tool"; name: string }
  | { type: "sources"; citations: BrainCitation[]; disclaimer: string; humanEscalationRequired: boolean }
  | { type: "done" }
  | { type: "error" };

// in handle():
if (evt.type === "sources") {
  setConvo((c) => {
    // attach to the in-progress assistant bubble (last assistant entry)
    const next = [...c];
    for (let i = next.length - 1; i >= 0; i--) {
      if (next[i].role === "assistant") {
        next[i] = { ...next[i], sources: { citations: evt.citations, disclaimer: evt.disclaimer, humanEscalationRequired: evt.humanEscalationRequired } };
        break;
      }
    }
    return next;
  });
  return;
}
```

- [ ] **Step 3: Render the sources panel under the assistant bubble**

Reuse the existing citation/disclaimer/escalation markup (lift the `citationLine`, sources list, disclaimer, and "Talk to a Loan Officer" CTA from `AnswerBubble` into a small `SourcesPanel` component) and render it when an assistant turn has `sources`.

- [ ] **Step 4: Verify in the browser (local brain + provider required)**

Start local brain + set `ai.brain.enabled`/`baseUrl` + an AI key. Load the homepage, open the assistant, ask "What's the max LTV for an FHA cash-out?" Expected: streamed conversational answer + a Sources panel (citations + disclaimer) + escalation CTA when flagged. Ask "who can help me in Texas?" → the agent uses `find_loan_officer` (1C) once built; for 1B it should still answer conversationally and offer an officer.

- [ ] **Step 5: Commit**

```bash
git add src/components/home/AiWidget.tsx
git commit -m "feat(ai): route the on-site assistant through the agentic chat front door"
```

---

### Task 6: Full-suite check + sweep dead code

- [ ] **Step 1: Run the whole suite + typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all green.

- [ ] **Step 2: Confirm no orphaned `/ask` widget path / unused `brainEnabled`**

Grep for `sendViaBrain`, `brainEnabled`, `/api/v1/ai/ask` in `src/components`. The `/ask` route + brain client stay (other platform uses / `search_guidelines` depends on the client), but the widget should no longer call `/ask` directly. Remove dead widget code flagged.

- [ ] **Step 3: Commit any cleanup**

```bash
git add -A && git commit -m "chore(ai): remove dead direct-brain widget path"
```

---

## Notes / follow-ups (out of 1B scope)

- **1C** adds `find_loan_officer`, `get_document_checklist`, `request_callback` tools (same `runTool` pattern; 1A's `LoanOfficer` table backs `find_loan_officer`).
- **1D** adds the C/G/D model switch + per-turn telemetry.
- **1E** moves `SYSTEM_PROMPT` to DB + `/admin/assistant`.
- Brain must be deployed + `ai.brain.enabled` for `search_guidelines` to return real answers in prod (Phase 0a); until then it returns the escalation fallback (still correct, never fabricated).
