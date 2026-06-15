# Ask AI in the Application — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the dead "Ask AI" button in the apply wizard to a single-thread chat panel powered by the same RAG-brain endpoint as the hero chat, so applicants can ask grounded questions mid-application.

**Architecture:** A thin single-thread hook (`useApplyChat`) reuses the hero's pure `threads.ts` reducers + `streamChat` against `POST /api/v1/ai/chat`. A new `ApplyChatPanel` (right drawer on desktop, full-screen sheet on mobile) renders the hero's `Convo` + `SourcesPanel` + composer with intent-aware starter chips. The wizard mounts the panel as a persistent sibling and opens it from the button. No backend changes.

**Tech Stack:** Next.js 16 / React 19 client components, TypeScript, Tailwind v4 tokens, vitest (node env). Reuses `src/components/home/hero-chat/{chatClient,threads,Convo,SourcesPanel,GrowTextarea}` and `@/components/ai/ChatMarkdown`.

**Spec:** `docs/superpowers/specs/2026-06-14-apply-ask-ai-design.md`

**Deviation from spec file inventory (intentional):** the spec listed only `Wizard.tsx` as modified, but this plan also makes ONE additive, hero-safe change to `Convo.tsx` — an optional `emptyState?: ReactNode` prop (default preserves the current "Fresh thread" block exactly). This lets the apply panel show a clean greeting + starter chips as the empty state instead of stacking two intro blocks. The hero passes no `emptyState`, so its behavior is byte-identical.

---

## File Structure

**New**
- `src/content/applyChatStarters.ts` — `APPLY_CHAT_STARTERS: Record<Intent, string[]>` + `stepHelpPrompt(stepQuestion)`.
- `src/content/applyChatStarters.test.ts` — starter-map + step-prompt guard.
- `src/components/apply/ask-ai/useApplyChat.ts` — single-thread chat hook (reuses `threads.ts` reducers + `streamChat`).
- `src/components/apply/ask-ai/ApplyChatPanel.tsx` — drawer/sheet shell with `role="dialog"`, focus trap, starter chips.

**Modified**
- `src/components/home/hero-chat/Convo.tsx` — add optional `emptyState?: ReactNode` prop (additive).
- `src/components/apply/Wizard.tsx` — `chatOpen` state, wire the button, mount the panel, focus return; add an `iconSrc` prop.
- `src/app/apply/[intent]/page.tsx` — pass `iconSrc={config.brand.logos.mark}` to `Wizard`.

---

## Task 1: Starter chips content + step-help prompt

**Files:**
- Create: `src/content/applyChatStarters.ts`
- Test: `src/content/applyChatStarters.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { INTENTS } from "@/content/flows";
import { APPLY_CHAT_STARTERS, stepHelpPrompt } from "./applyChatStarters";

describe("apply chat starters", () => {
  it("every intent has at least one non-empty starter", () => {
    for (const intent of INTENTS) {
      const starters = APPLY_CHAT_STARTERS[intent];
      expect(starters?.length, intent).toBeGreaterThan(0);
      for (const s of starters) expect(s.trim().length).toBeGreaterThan(0);
    }
  });

  it("stepHelpPrompt includes the step question text", () => {
    const q = "What's your estimated credit score?";
    expect(stepHelpPrompt(q)).toContain(q);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/content/applyChatStarters.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `applyChatStarters.ts`**

```ts
import type { Intent } from "@/content/flows";

/** Suggested opening questions per apply flow, shown as tappable chips on the
 *  empty apply-chat panel. Intent-aware; never references the applicant's own
 *  entered answers. */
export const APPLY_CHAT_STARTERS: Record<Intent, string[]> = {
  buy: [
    "How much home can I afford?",
    "What credit score do I need to buy?",
    "How much down payment do I need?",
    "FHA vs. conventional — what's the difference?",
  ],
  refi: [
    "Should I refinance right now?",
    "How much could refinancing save me?",
    "What is a VA IRRRL?",
    "Will applying affect my credit?",
  ],
  cash: [
    "How does a cash-out refinance work?",
    "HELOC vs. cash-out — which fits me?",
    "How much equity can I access?",
    "What can I use the cash for?",
  ],
};

/** Help prompt for the applicant's CURRENT step. Sends only the step's QUESTION
 *  text — never the applicant's answer. */
export function stepHelpPrompt(stepQuestion: string): string {
  return `On a mortgage application, what does this question mean and how should I answer it: "${stepQuestion}"?`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/content/applyChatStarters.test.ts`
Expected: PASS (2).

- [ ] **Step 5: Commit**

```bash
git add src/content/applyChatStarters.ts src/content/applyChatStarters.test.ts
git commit -m "feat(apply): intent-aware Ask-AI starter prompts"
```

---

## Task 2: useApplyChat hook

**Files:**
- Create: `src/components/apply/ask-ai/useApplyChat.ts`

No unit test (React hook; the repo has no RTL — the pure reducers it reuses are already tested in `threads.test.ts`, and behavior is browser-verified in T5). Matches the codebase pattern (pure logic unit-tested, components browser-verified).

- [ ] **Step 1: Create the hook** (mirrors `useThreads.run` for a single fixed thread; the ref-mirror uses the same `useEffect` pattern as `useThreads` to satisfy the React Compiler `react-hooks/refs` rule)

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { streamChat, type ChatHistoryMsg } from "@/components/home/hero-chat/chatClient";
import {
  type Thread,
  appendDelta,
  appendError,
  appendUser,
  attachSources,
  ensureAssistant,
  finishStream,
  setDraft as engineSetDraft,
  setSession,
} from "@/components/home/hero-chat/threads";

const TID = "apply";
const ERROR_TEXT =
  "Sorry — I hit a problem reaching the assistant. Please try again, or talk to a loan officer.";

function initialThread(): Thread {
  return { id: TID, title: "Ask AI", titleLocked: true, draft: "", busy: false, sessionId: null, msgs: [] };
}

/** History sent to the chat route: this thread's user/assistant turns only. */
function historyOf(t: Thread): ChatHistoryMsg[] {
  return t.msgs.flatMap((m) =>
    m.role === "user" || m.role === "assistant" ? [{ role: m.role, content: m.text }] : [],
  );
}

/**
 * Single-thread chat state for the in-application Ask-AI panel. Reuses the
 * hero's pure thread reducers + streamChat against /api/v1/ai/chat — same RAG
 * brain grounding, citations, and human-escalation fallback. The applicant's
 * wizard answers are never sent; only typed/tapped questions reach the assistant.
 */
export function useApplyChat() {
  const [threads, setThreads] = useState<Thread[]>([initialThread()]);
  const threadsRef = useRef<Thread[]>(threads);
  useEffect(() => {
    threadsRef.current = threads;
  }, [threads]);
  const seq = useRef(0);
  const nid = (p: string) => `${p}${++seq.current}`;

  const run = useCallback(async (messages: ChatHistoryMsg[]) => {
    const mid = nid("m");
    const sessionId = threadsRef.current[0]?.sessionId ?? null;
    try {
      await streamChat({
        sessionId,
        messages,
        onEvent: (evt) => {
          if (evt.type === "session") setThreads((ts) => setSession(ts, TID, evt.sessionId));
          else if (evt.type === "sources")
            setThreads((ts) =>
              attachSources(ts, TID, mid, {
                citations: evt.citations,
                disclaimer: evt.disclaimer,
                humanEscalationRequired: evt.humanEscalationRequired,
              }),
            );
          else if (evt.type === "text")
            setThreads((ts) => appendDelta(ensureAssistant(ts, TID, mid), TID, mid, evt.value));
        },
      });
      setThreads((ts) => finishStream(ts, TID, mid));
    } catch {
      setThreads((ts) => appendError(ts, TID, ERROR_TEXT));
    }
  }, []);

  const send = useCallback(
    (text: string) => {
      const t = threadsRef.current[0];
      const q = text.trim();
      if (!t || !q || t.busy) return;
      setThreads((ts) => appendUser(ts, TID, nid("m"), q));
      void run([...historyOf(t), { role: "user", content: q }]);
    },
    [run],
  );

  const setDraft = useCallback((v: string) => setThreads((ts) => engineSetDraft(ts, TID, v)), []);

  return { thread: threads[0], send, setDraft };
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/components/apply/ask-ai/useApplyChat.ts
git commit -m "feat(apply): single-thread chat hook reusing hero streamChat + reducers"
```

---

## Task 3: Convo emptyState prop + ApplyChatPanel

**Files:**
- Modify: `src/components/home/hero-chat/Convo.tsx`
- Create: `src/components/apply/ask-ai/ApplyChatPanel.tsx`

- [ ] **Step 1: Add the additive `emptyState` prop to `Convo`**

In `src/components/home/hero-chat/Convo.tsx`:

(a) Change the React import to bring in `ReactNode`:
```tsx
import { useEffect, useRef, type ReactNode, type RefObject } from "react";
```

(b) Add `emptyState` to the props destructure and type:
```tsx
export function Convo({
  thread,
  iconSrc,
  shortName,
  assistantName,
  onDraft,
  onSend,
  composerRef,
  emptyState,
}: {
  thread: Thread;
  iconSrc: string;
  shortName: string;
  assistantName: string;
  onDraft: (v: string) => void;
  onSend: () => void;
  composerRef?: RefObject<HTMLTextAreaElement | null>;
  emptyState?: ReactNode;
}) {
```

(c) In the render, replace the empty branch. The current code is:
```tsx
      {thread.msgs.length === 0 ? (
        <div className="flex flex-1 flex-col justify-end gap-2 pb-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={iconSrc} alt={shortName} className="size-[34px] rounded-md object-cover object-left" />
          <p className="text-[14.5px] font-medium text-muted">
            Fresh thread — ask anything about this scenario.
          </p>
        </div>
      ) : (
```
Change the opening of the ternary to prefer `emptyState` when provided:
```tsx
      {thread.msgs.length === 0 ? (
        emptyState ?? (
          <div className="flex flex-1 flex-col justify-end gap-2 pb-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={iconSrc} alt={shortName} className="size-[34px] rounded-md object-cover object-left" />
            <p className="text-[14.5px] font-medium text-muted">
              Fresh thread — ask anything about this scenario.
            </p>
          </div>
        )
      ) : (
```
(Everything else in `Convo` is unchanged. The hero callers pass no `emptyState`, so they render the default block exactly as before.)

- [ ] **Step 2: Create `ApplyChatPanel.tsx`**

```tsx
"use client";

import { useEffect, useRef, type RefObject } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Intent } from "@/content/flows";
import { Convo } from "@/components/home/hero-chat/Convo";
import { APPLY_CHAT_STARTERS, stepHelpPrompt } from "@/content/applyChatStarters";
import { useApplyChat } from "./useApplyChat";

/** In-application Ask-AI panel: right drawer on desktop (≥981px), full-screen
 *  sheet on mobile. Single-thread chat against the same RAG brain as the hero.
 *  Mounted persistently by the Wizard so the conversation survives step
 *  navigation and close/reopen. */
export function ApplyChatPanel({
  open,
  onClose,
  intent,
  assistantName,
  shortName,
  iconSrc,
  stepQuestion,
  returnFocusRef,
}: {
  open: boolean;
  onClose: () => void;
  intent: Intent;
  assistantName: string;
  shortName: string;
  iconSrc: string;
  stepQuestion: string;
  returnFocusRef?: RefObject<HTMLButtonElement | null>;
}) {
  const chat = useApplyChat();
  const panelRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  // Escape closes; Tab cycles focus within the dialog (lightweight focus trap).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "Tab" && panelRef.current) {
        const f = panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, [tabindex]:not([tabindex="-1"])',
        );
        if (f.length === 0) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Focus the composer on open; return focus to the trigger button on close.
  useEffect(() => {
    if (open) composerRef.current?.focus();
    else returnFocusRef?.current?.focus();
  }, [open, returnFocusRef]);

  const starters = APPLY_CHAT_STARTERS[intent] ?? [];
  const chipClass =
    "rounded-full border border-line bg-white px-3 py-1.5 text-[13.5px] font-semibold text-green-700 transition-colors hover:bg-paper-2";

  const emptyState = (
    <div className="flex flex-1 flex-col justify-end gap-3 pb-2">
      <p className="text-[14.5px] font-medium text-muted">
        Hi! Ask {assistantName} anything about your application or mortgages — your answers stay private.
      </p>
      <div className="flex flex-wrap gap-2">
        {starters.map((s) => (
          <button key={s} type="button" onClick={() => chat.send(s)} className={chipClass}>
            {s}
          </button>
        ))}
        <button type="button" onClick={() => chat.send(stepHelpPrompt(stepQuestion))} className={chipClass}>
          Help me with this step
        </button>
      </div>
    </div>
  );

  return (
    <>
      <div
        aria-hidden
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-40 bg-ink/30 transition-opacity duration-200 motion-reduce:transition-none",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Ask ${assistantName}`}
        className={cn(
          "fixed z-50 flex flex-col bg-paper shadow-pop transition-transform duration-200 ease-out motion-reduce:transition-none",
          "inset-0 min-[981px]:inset-y-0 min-[981px]:left-auto min-[981px]:right-0 min-[981px]:w-[380px]",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        <header className="flex items-center gap-2.5 border-b border-line px-4 py-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={iconSrc} alt="" aria-hidden className="size-7 rounded object-cover object-left" />
          <span className="text-[15px] font-bold text-ink">Ask {assistantName}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto flex size-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-paper-2"
          >
            <X className="size-5" strokeWidth={1.8} />
          </button>
        </header>
        <div className="flex min-h-0 flex-1 flex-col px-4 py-3">
          <Convo
            thread={chat.thread}
            iconSrc={iconSrc}
            shortName={shortName}
            assistantName={assistantName}
            composerRef={composerRef}
            onDraft={chat.setDraft}
            onSend={() => chat.send(chat.thread.draft)}
            emptyState={emptyState}
          />
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 3: Typecheck + run the hero chat tests (guard the Convo change)**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean; all tests pass (the `Convo` change is additive).

- [ ] **Step 4: Commit**

```bash
git add src/components/home/hero-chat/Convo.tsx src/components/apply/ask-ai/ApplyChatPanel.tsx
git commit -m "feat(apply): ApplyChatPanel drawer/sheet + Convo emptyState prop"
```

---

## Task 4: Wire the Wizard button + apply page

**Files:**
- Modify: `src/components/apply/Wizard.tsx`
- Modify: `src/app/apply/[intent]/page.tsx`

- [ ] **Step 1: Import the panel in `Wizard.tsx`**

Add to the imports (near the other `@/components/apply` imports):
```tsx
import { ApplyChatPanel } from "./ask-ai/ApplyChatPanel";
```
(`useState`/`useRef` are already imported on line 3.)

- [ ] **Step 2: Add the `iconSrc` prop to `Wizard`**

In the `Wizard` props type, add `iconSrc: string;` (e.g. right after `shortName: string;`), and add `iconSrc,` to the destructured params.

- [ ] **Step 3: Add panel state + a trigger ref**

Inside the component body, near the other `useState` calls (after `const [leadId, setLeadId] = useState<string | null>(null);`):
```tsx
  const [chatOpen, setChatOpen] = useState(false);
  const askBtnRef = useRef<HTMLButtonElement>(null);
```

- [ ] **Step 4: Wire the button and mount the panel**

Replace the existing Ask AI button (currently):
```tsx
      <button type="button" aria-label={`Ask ${assistantName}`} className="fixed bottom-6 right-6 z-40 flex h-14 items-center gap-2.5 rounded-full bg-green-800 py-0 pl-2.5 pr-5 text-[15px] font-bold text-white shadow-pop transition-transform duration-150 hover:-translate-y-0.5">
        <Mark size={36} label={shortName} /> Ask AI
      </button>
```
with:
```tsx
      <button
        ref={askBtnRef}
        type="button"
        onClick={() => setChatOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={chatOpen}
        aria-label={`Ask ${assistantName}`}
        className="fixed bottom-6 right-6 z-40 flex h-14 items-center gap-2.5 rounded-full bg-green-800 py-0 pl-2.5 pr-5 text-[15px] font-bold text-white shadow-pop transition-transform duration-150 hover:-translate-y-0.5"
      >
        <Mark size={36} label={shortName} /> Ask AI
      </button>

      <ApplyChatPanel
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        intent={intent}
        assistantName={assistantName}
        shortName={shortName}
        iconSrc={iconSrc}
        stepQuestion={step.q}
        returnFocusRef={askBtnRef}
      />
```
(Both remain inside the root `<div className="flex min-h-screen flex-col">`. `step` and `intent` are already in scope.)

- [ ] **Step 5: Pass `iconSrc` from the apply page**

In `src/app/apply/[intent]/page.tsx`, add to the `<Wizard …>` props (e.g. after `shortName={config.brand.shortName}`):
```tsx
      iconSrc={config.brand.logos.mark}
```

- [ ] **Step 6: Typecheck + full tests + lint**

Run: `npx tsc --noEmit && npx vitest run && npx eslint src/components/apply src/content/applyChatStarters.ts`
Expected: clean; tests pass (no lint errors — the React Compiler `refs`/`set-state-in-effect` rules are satisfied by the `useEffect` ref-mirror and the effect-driven focus).

- [ ] **Step 7: Commit**

```bash
git add src/components/apply/Wizard.tsx "src/app/apply/[intent]/page.tsx"
git commit -m "feat(apply): wire Ask AI button to the chat panel"
```

---

## Task 5: Browser verification (controller)

**Files:** none (verification). Requires the local Docker DB up (`npm run db:up`) for the dev server.

- [ ] **Step 1: Build to catch route/SSG errors**

Run: `npx next build`
Expected: succeeds; `/apply/[intent]` still SSG (●).

- [ ] **Step 2: Browser pass (preview)** on `/apply/buy`, `/apply/refi`, `/apply/cash`:
  - Tap **Ask AI** → the drawer opens (desktop ≥981px: right ~380px panel over a dimmed scrim; mobile ≤980px: full-screen sheet); the composer is focused.
  - Empty state shows the greeting + intent-tailored starter chips + a "Help me with this step" chip.
  - Tap a starter → a user bubble appears and the assistant streams a reply (grounded citations when the brain is enabled; otherwise the graceful "talk to a loan officer" fallback — the dev brain is off by default).
  - Type a custom question → sends; "Help me with this step" sends a prompt referencing the current step's question text only.
  - Advance the wizard (Next/Back) with the panel closed, reopen → the conversation persists. Full page reload → it resets.
  - **Escape** closes and returns focus to the Ask AI button; `role="dialog"` + `aria-modal` present; Tab stays within the panel.
  - Network shows `POST /api/v1/ai/chat` (SSE); console clean.

- [ ] **Step 3:** Screenshot the open drawer (desktop) + the mobile sheet as proof.

---

## Done criteria

- `npx tsc --noEmit` clean; `npx vitest run` green; `npx next build` succeeds.
- The apply "Ask AI" button opens a single-thread chat panel hitting `POST /api/v1/ai/chat` (same brain as the hero), with citations/disclaimer via `SourcesPanel` and the graceful fallback.
- Intent-aware starter chips; the applicant's wizard `answers` are never transmitted (only typed questions + the step's question text).
- Conversation persists across step navigation + close/reopen; resets on full reload.
- Drawer on desktop, full-screen sheet on mobile; Escape closes + returns focus; `role="dialog"`/`aria-modal`/focus trap.
- The hero chat is unchanged (Convo `emptyState` defaulted; deck/bloom untouched).
