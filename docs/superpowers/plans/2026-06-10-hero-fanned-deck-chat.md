# Hero Fanned-Deck Multi-Thread Chat — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hero's single-conversation chat card with a resting card that blooms into a fanned deck of up to 5 parallel chat threads, each a real SSE conversation against `/api/v1/ai/chat`.

**Architecture:** A pure thread-state engine (`threads.ts`, unit-tested) + a pure SSE frame parser (`chatClient.ts`, unit-tested) are wired by a thin `useThreads` hook. Presentational components (`RestingCard`, `Deck`, `ThreadCard`, `Convo`, `SourcesPanel`) consume the hook via the `HeroChat` orchestrator. A small client `HeroBloomShell` collapses the server-rendered headline on bloom. `AiWidget.tsx` is deleted; its SSE/bubble/sources code moves into this module.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind v4 tokens, vitest (node env — pure-TS tests only), lucide-react icons.

**Spec:** `docs/superpowers/specs/2026-06-10-hero-fanned-deck-chat-design.md`

**Conventions that apply to every task:** no hardcoded hex outside `globals.css` (use token utilities; the only carried-over exceptions are the pre-existing `#fafbf8` footer, `#9aa39c` placeholder gray, and `#04130c` dark-on-green, all already in the codebase). Breakpoint is 980px (`max-[980px]:`). `@/*` → `src/*`.

**Spec deviation note (resolved):** the spec's token table maps the prototype's green800 to `green-700` "(user bubble / send-on)" while the RestingCard row says send-on is `green-800`. Resolution: **user bubbles = `green-700`** (today's bubble green), **filled send buttons = `green-800`** (closest to the prototype's `#0d3320`). Both are AA with white icons/text.

---

## File map

| File | Action | Responsibility |
| --- | --- | --- |
| `src/components/home/hero-chat/threads.ts` | Create | Pure thread-state engine: types, title map, immutable update helpers, caps |
| `src/components/home/hero-chat/threads.test.ts` | Create | Engine unit tests |
| `src/components/home/hero-chat/chatClient.ts` | Create | SSE wire protocol: `splitSseFrames` (pure) + `streamChat` (fetch) |
| `src/components/home/hero-chat/chatClient.test.ts` | Create | Frame-parser unit tests |
| `src/components/home/hero-chat/useThreads.ts` | Create | Client hook wiring engine + stream; per-thread sessionId/busy |
| `src/components/home/hero-chat/SourcesPanel.tsx` | Create | Citations + disclaimer + escalation CTA (moved from AiWidget) |
| `src/components/home/hero-chat/Convo.tsx` | Create | Message list + composer + streaming dots/caret + disclosure line |
| `src/components/home/hero-chat/RestingCard.tsx` | Create | Idle card (input / IntentTabs swap / AI-mode footer) |
| `src/components/home/hero-chat/ThreadCard.tsx` | Create | Deck card chrome (dot, title, preview, number, close) |
| `src/components/home/hero-chat/Deck.tsx` | Create | Fan layout, parallax, footer controls, ≤980px tab-row fallback |
| `src/components/home/hero-chat/HeroChat.tsx` | Create | Orchestrator: aiMode, resting ↔ bloomed, onBloom |
| `src/components/home/HeroBloomShell.tsx` | Create | Client shell: `.is-bloomed` toggle around server headline |
| `src/app/globals.css` | Modify | `.hero-fade`, ring/breath/caret keyframes, `.pill-glow` |
| `src/components/home/Hero.tsx` | Modify | Rings, breathing logo, shell wiring, "Start an application" pill |
| `src/components/home/AiWidget.tsx` | Delete | Replaced by hero-chat module |

---

### Task 1: Pure thread engine

**Files:**
- Create: `src/components/home/hero-chat/threads.ts`
- Test: `src/components/home/hero-chat/threads.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/components/home/hero-chat/threads.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  MAX_THREADS,
  type Thread,
  addThread,
  appendDelta,
  appendError,
  appendUser,
  attachSources,
  closeThread,
  ensureAssistant,
  finishStream,
  launchThreads,
  setDraft,
  setSession,
  titleFor,
} from "./threads";

const SOURCES = { citations: [], disclaimer: "Not advice.", humanEscalationRequired: false };

function bareThread(id: string, n: number): Thread {
  return { id, title: `Thread ${n}`, titleLocked: false, draft: "", busy: false, sessionId: null, msgs: [] };
}

describe("titleFor", () => {
  it("maps known topics (prototype keyword order)", () => {
    expect(titleFor("What can I afford on $120k income?")).toBe("Affordability");
    expect(titleFor("What are rates today?")).toBe("Rates today");
    expect(titleFor("minimum down payment for a condo")).toBe("Down payment");
    expect(titleFor("Should I refinance?")).toBe("Refinance");
    expect(titleFor("Do I qualify for an FHA program?")).toBe("Affordability"); // "qualify" wins by order
    expect(titleFor("first-time buyer credit options")).toBe("Programs");
  });
  it("falls back to the truncated question", () => {
    expect(titleFor("Tell me about HOA fees")).toBe("Tell me about HOA fees");
    expect(titleFor("Can you explain how escrow accounts actually work")).toBe("Can you explain how escr…");
  });
});

describe("launch / add / close", () => {
  it("launchThreads creates one busy thread holding the user message", () => {
    const ts = launchThreads("t1", "m1", "What are rates today?");
    expect(ts).toHaveLength(1);
    expect(ts[0].busy).toBe(true);
    expect(ts[0].msgs).toEqual([{ id: "m1", role: "user", text: "What are rates today?" }]);
    expect(ts[0].title).toBe("Thread 1");
  });
  it("addThread appends an empty numbered thread and caps at MAX_THREADS", () => {
    let ts = launchThreads("t1", "m1", "hi");
    ts = addThread(ts, "t2");
    expect(ts).toHaveLength(2);
    expect(ts[1]).toMatchObject({ id: "t2", title: "Thread 2", msgs: [], busy: false });
    for (let i = 3; i <= 7; i++) ts = addThread(ts, `t${i}`);
    expect(ts).toHaveLength(MAX_THREADS);
  });
  it("closeThread is a no-op with one thread", () => {
    const ts = launchThreads("t1", "m1", "hi");
    expect(closeThread(ts, "t1", "t1")).toEqual({ threads: ts, activeId: "t1" });
  });
  it("closing the active thread falls back to the last remaining", () => {
    const ts = [bareThread("t1", 1), bareThread("t2", 2), bareThread("t3", 3)];
    const r = closeThread(ts, "t2", "t2");
    expect(r.threads.map((t) => t.id)).toEqual(["t1", "t3"]);
    expect(r.activeId).toBe("t3");
  });
  it("closing an inactive thread keeps the active id", () => {
    const ts = [bareThread("t1", 1), bareThread("t2", 2)];
    const r = closeThread(ts, "t1", "t2");
    expect(r.activeId).toBe("t1");
  });
});

describe("streaming appliers", () => {
  it("appendUser adds the message, sets busy, clears the draft", () => {
    let ts = [{ ...bareThread("t1", 1), draft: "What are rates today?" }];
    ts = appendUser(ts, "t1", "m1", "What are rates today?");
    expect(ts[0].msgs).toEqual([{ id: "m1", role: "user", text: "What are rates today?" }]);
    expect(ts[0]).toMatchObject({ busy: true, draft: "" });
  });
  it("ensureAssistant opens one bubble, idempotently", () => {
    let ts = launchThreads("t1", "m1", "hi");
    ts = ensureAssistant(ts, "t1", "m2");
    ts = ensureAssistant(ts, "t1", "m2");
    expect(ts[0].msgs).toHaveLength(2);
    expect(ts[0].msgs[1]).toMatchObject({ id: "m2", role: "assistant", text: "", done: false });
  });
  it("sources arriving before text open the bubble and later deltas fill the SAME bubble", () => {
    let ts = launchThreads("t1", "m1", "hi");
    ts = attachSources(ts, "t1", "m2", SOURCES);
    ts = ensureAssistant(ts, "t1", "m2");
    ts = appendDelta(ts, "t1", "m2", "Hello");
    ts = appendDelta(ts, "t1", "m2", " there");
    expect(ts[0].msgs).toHaveLength(2);
    expect(ts[0].msgs[1]).toMatchObject({ role: "assistant", text: "Hello there", sources: SOURCES });
  });
  it("finishStream marks done, clears busy, and locks the title from the first user message once", () => {
    let ts = launchThreads("t1", "m1", "Should I refinance?");
    ts = ensureAssistant(ts, "t1", "m2");
    ts = appendDelta(ts, "t1", "m2", "Yes.");
    ts = finishStream(ts, "t1", "m2");
    expect(ts[0]).toMatchObject({ busy: false, title: "Refinance", titleLocked: true });
    ts = appendUser(ts, "t1", "m3", "What are rates today?");
    ts = ensureAssistant(ts, "t1", "m4");
    ts = finishStream(ts, "t1", "m4");
    expect(ts[0].title).toBe("Refinance"); // locked — no retitle
  });
  it("appendError clears busy and appends an error turn", () => {
    let ts = launchThreads("t1", "m1", "hi");
    ts = appendError(ts, "t1", "Sorry — try again.");
    expect(ts[0].busy).toBe(false);
    expect(ts[0].msgs[1]).toMatchObject({ role: "error", text: "Sorry — try again." });
  });
  it("setSession and setDraft update only the targeted thread", () => {
    let ts = [bareThread("t1", 1), bareThread("t2", 2)];
    ts = setSession(ts, "t2", "sess-9");
    ts = setDraft(ts, "t1", "typing…");
    expect(ts[0]).toMatchObject({ sessionId: null, draft: "typing…" });
    expect(ts[1]).toMatchObject({ sessionId: "sess-9", draft: "" });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/home/hero-chat/threads.test.ts`
Expected: FAIL — `Cannot find module './threads'`

- [ ] **Step 3: Implement the engine**

`src/components/home/hero-chat/threads.ts`:

```ts
import type { BrainCitation } from "@/server/ai/brain/types";

/** Hard cap on parallel hero threads (design handoff). */
export const MAX_THREADS = 5;

/** Grounding payload attached to a streamed answer (citations + compliance). */
export type Sources = {
  citations: BrainCitation[];
  disclaimer: string;
  humanEscalationRequired: boolean;
};

/** A turn in one thread's transcript. Assistant turns stream (`done: false`)
 *  and may carry grounding `sources`. */
export type Msg =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; text: string; done: boolean; sources?: Sources }
  | { id: string; role: "error"; text: string };

/** One conversation card in the deck. `sessionId` is the chat-recording
 *  session for THIS thread — every thread is its own conversation. */
export type Thread = {
  id: string;
  title: string;
  titleLocked: boolean;
  draft: string;
  busy: boolean;
  sessionId: string | null;
  msgs: Msg[];
};

/** Keyword → title map, in the design handoff's match order ("qualify" wins
 *  over "down payment" by order, matching the prototype). */
const TOPICS: ReadonlyArray<readonly [RegExp, string]> = [
  [/afford|income|qualif|how much|\bmuch\b/i, "Affordability"],
  [/\brates?\b|interest|\bapr\b|today/i, "Rates today"],
  [/down.?payment|\bdown\b|deposit|\bsave\b/i, "Down payment"],
  [/refi|refinance|lower/i, "Refinance"],
  [/first.?time|\bfha\b|\bva\b|usda|credit|program/i, "Programs"],
];

/** Thread title from the first question: topic match, else truncate to 24. */
export function titleFor(question: string): string {
  const hit = TOPICS.find(([re]) => re.test(question));
  if (hit) return hit[1];
  const t = question.trim();
  return t.length <= 24 ? t : `${t.slice(0, 24).trimEnd()}…`;
}

function blank(id: string, n: number): Thread {
  return { id, title: `Thread ${n}`, titleLocked: false, draft: "", busy: false, sessionId: null, msgs: [] };
}

function update(threads: Thread[], tid: string, fn: (t: Thread) => Thread): Thread[] {
  return threads.map((t) => (t.id === tid ? fn(t) : t));
}

/** First submit: a single busy thread holding the user's question. */
export function launchThreads(tid: string, mid: string, question: string): Thread[] {
  return [{ ...blank(tid, 1), busy: true, msgs: [{ id: mid, role: "user", text: question }] }];
}

/** Append a fresh empty thread (peeking tab). No-op at the cap. */
export function addThread(threads: Thread[], tid: string): Thread[] {
  if (threads.length >= MAX_THREADS) return threads;
  return [...threads, blank(tid, threads.length + 1)];
}

/** Remove a thread (never the last one). Closing the active thread hands
 *  focus to the last remaining thread (design handoff behavior). */
export function closeThread(
  threads: Thread[],
  activeId: string,
  tid: string,
): { threads: Thread[]; activeId: string } {
  if (threads.length <= 1) return { threads, activeId };
  const next = threads.filter((t) => t.id !== tid);
  return { threads: next, activeId: activeId === tid ? next[next.length - 1].id : activeId };
}

export function setDraft(threads: Thread[], tid: string, draft: string): Thread[] {
  return update(threads, tid, (t) => ({ ...t, draft }));
}

export function setSession(threads: Thread[], tid: string, sessionId: string): Thread[] {
  return update(threads, tid, (t) => ({ ...t, sessionId }));
}

/** User sends in a thread: append the turn, mark busy, clear the draft. */
export function appendUser(threads: Thread[], tid: string, mid: string, text: string): Thread[] {
  return update(threads, tid, (t) => ({
    ...t,
    busy: true,
    draft: "",
    msgs: [...t.msgs, { id: mid, role: "user", text }],
  }));
}

/** Open the streaming assistant bubble for message `mid` exactly once.
 *  (`sources` may arrive first via attachSources — same idempotence rule.) */
export function ensureAssistant(threads: Thread[], tid: string, mid: string): Thread[] {
  return update(threads, tid, (t) =>
    t.msgs.some((m) => m.id === mid) ? t : { ...t, msgs: [...t.msgs, { id: mid, role: "assistant", text: "", done: false }] },
  );
}

/** Append a streamed text delta to the assistant bubble `mid`. */
export function appendDelta(threads: Thread[], tid: string, mid: string, delta: string): Thread[] {
  return update(threads, tid, (t) => ({
    ...t,
    msgs: t.msgs.map((m) => (m.id === mid && m.role === "assistant" ? { ...m, text: m.text + delta } : m)),
  }));
}

/** Attach grounding to bubble `mid`, opening it if text hasn't started yet —
 *  guarantees sources and text land in the SAME bubble. */
export function attachSources(threads: Thread[], tid: string, mid: string, sources: Sources): Thread[] {
  const opened = ensureAssistant(threads, tid, mid);
  return update(opened, tid, (t) => ({
    ...t,
    msgs: t.msgs.map((m) => (m.id === mid && m.role === "assistant" ? { ...m, sources } : m)),
  }));
}

/** Stream ended: mark the bubble done, clear busy, and (first completed
 *  exchange only) lock the title derived from the first user message. */
export function finishStream(threads: Thread[], tid: string, mid: string): Thread[] {
  return update(threads, tid, (t) => {
    const firstUser = t.msgs.find((m) => m.role === "user");
    return {
      ...t,
      busy: false,
      title: t.titleLocked || !firstUser ? t.title : titleFor(firstUser.text),
      titleLocked: t.titleLocked || Boolean(firstUser),
      msgs: t.msgs.map((m) => (m.id === mid && m.role === "assistant" ? { ...m, done: true } : m)),
    };
  });
}

/** Request failed: clear busy and append the human-fallback error turn. */
export function appendError(threads: Thread[], tid: string, text: string): Thread[] {
  return update(threads, tid, (t) => ({
    ...t,
    busy: false,
    msgs: [...t.msgs, { id: `${tid}-err-${t.msgs.length}`, role: "error", text }],
  }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/home/hero-chat/threads.test.ts`
Expected: PASS (all)

- [ ] **Step 5: Commit**

```bash
git add src/components/home/hero-chat/threads.ts src/components/home/hero-chat/threads.test.ts
git commit -m "feat(hero): pure thread-state engine for the fanned-deck chat"
```

---

### Task 2: SSE chat client

**Files:**
- Create: `src/components/home/hero-chat/chatClient.ts`
- Test: `src/components/home/hero-chat/chatClient.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/components/home/hero-chat/chatClient.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { splitSseFrames, type ChatEvent } from "./chatClient";

describe("splitSseFrames", () => {
  it("parses complete data frames and returns the unterminated tail", () => {
    const { events, rest } = splitSseFrames('data: {"type":"text","value":"Hi"}\n\ndata: {"type":"done"}\n\ndata: {"ty');
    expect(events).toEqual([{ type: "text", value: "Hi" }, { type: "done" }] satisfies ChatEvent[]);
    expect(rest).toBe('data: {"ty');
  });
  it("skips malformed JSON and non-data frames without throwing", () => {
    const { events } = splitSseFrames("data: {not json}\n\n: keep-alive\n\ndata: {\"type\":\"done\"}\n\n");
    expect(events).toEqual([{ type: "done" }]);
  });
  it("returns everything as rest when no frame is complete", () => {
    const { events, rest } = splitSseFrames('data: {"type":"text"');
    expect(events).toEqual([]);
    expect(rest).toBe('data: {"type":"text"');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/home/hero-chat/chatClient.test.ts`
Expected: FAIL — `Cannot find module './chatClient'`

- [ ] **Step 3: Implement the client**

`src/components/home/hero-chat/chatClient.ts` (protocol moved verbatim from `AiWidget.sendViaChat`):

```ts
import type { BrainCitation } from "@/server/ai/brain/types";

/** Wire format for one SSE event from /api/v1/ai/chat (agentic path). */
export type ChatEvent =
  | { type: "session"; sessionId: string }
  | { type: "text"; value: string }
  | { type: "tool"; name: string }
  | { type: "sources"; citations: BrainCitation[]; disclaimer: string; humanEscalationRequired: boolean }
  | { type: "done" }
  | { type: "error" };

export type ChatHistoryMsg = { role: "user" | "assistant"; content: string };

/** Split an SSE buffer into parsed `data:` events + the unterminated tail.
 *  Malformed frames are skipped (keep streaming). Pure — unit-tested. */
export function splitSseFrames(buffer: string): { events: ChatEvent[]; rest: string } {
  const frames = buffer.split("\n\n");
  const rest = frames.pop() ?? "";
  const events: ChatEvent[] = [];
  for (const frame of frames) {
    const line = frame.trim();
    if (!line.startsWith("data:")) continue;
    const jsonStr = line.slice(5).trim();
    if (!jsonStr) continue;
    try {
      events.push(JSON.parse(jsonStr) as ChatEvent);
    } catch {
      // ignore malformed frames; keep streaming
    }
  }
  return { events, rest };
}

/** POST one turn to the agentic chat route and invoke `onEvent` per SSE
 *  event until the stream closes. Throws on a non-OK response so the caller
 *  can render the error turn. */
export async function streamChat(opts: {
  sessionId: string | null;
  messages: ChatHistoryMsg[];
  onEvent: (evt: ChatEvent) => void;
}): Promise<void> {
  const res = await fetch("/api/v1/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId: opts.sessionId ?? undefined, messages: opts.messages }),
  });
  if (!res.ok || !res.body) throw new Error(`chat request failed: ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const { events, rest } = splitSseFrames(buffer);
    buffer = rest;
    for (const evt of events) opts.onEvent(evt);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/home/hero-chat/chatClient.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/home/hero-chat/chatClient.ts src/components/home/hero-chat/chatClient.test.ts
git commit -m "feat(hero): extract agentic SSE chat client with tested frame parser"
```

---

### Task 3: useThreads hook

**Files:**
- Create: `src/components/home/hero-chat/useThreads.ts`

(Hook glue — exercised in the browser; the logic it composes is already unit-tested.)

- [ ] **Step 1: Implement the hook**

`src/components/home/hero-chat/useThreads.ts`:

```ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { streamChat, type ChatHistoryMsg } from "./chatClient";
import {
  type Thread,
  addThread as engineAdd,
  appendDelta,
  appendError,
  appendUser,
  attachSources,
  closeThread as engineClose,
  ensureAssistant,
  finishStream,
  launchThreads,
  setDraft as engineSetDraft,
  setSession,
} from "./threads";

const ERROR_TEXT =
  "Sorry — I hit a problem reaching the assistant. Please try again, or talk to a loan officer.";

/** History sent to the chat route: this thread's user/assistant turns. */
function historyOf(t: Thread): ChatHistoryMsg[] {
  return t.msgs.flatMap((m) =>
    m.role === "user" || m.role === "assistant" ? [{ role: m.role, content: m.text }] : [],
  );
}

/**
 * Thread state engine for the hero deck. Each thread is its own conversation
 * against /api/v1/ai/chat (own sessionId, own busy flag); streams may run
 * concurrently across threads. `bloomed` flips true on the first launch and
 * never back (the last thread cannot be closed).
 */
export function useThreads() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const threadsRef = useRef<Thread[]>(threads);
  const seq = useRef(0);
  useEffect(() => {
    threadsRef.current = threads;
  }, [threads]);
  const nid = (prefix: string) => `${prefix}${++seq.current}`;

  /** Run one streamed exchange inside thread `tid`. */
  const run = useCallback(async (tid: string, messages: ChatHistoryMsg[]) => {
    const mid = nid("m");
    const sessionId = threadsRef.current.find((t) => t.id === tid)?.sessionId ?? null;
    try {
      await streamChat({
        sessionId,
        messages,
        onEvent: (evt) => {
          if (evt.type === "session") setThreads((ts) => setSession(ts, tid, evt.sessionId));
          else if (evt.type === "sources")
            setThreads((ts) =>
              attachSources(ts, tid, mid, {
                citations: evt.citations,
                disclaimer: evt.disclaimer,
                humanEscalationRequired: evt.humanEscalationRequired,
              }),
            );
          else if (evt.type === "text")
            setThreads((ts) => appendDelta(ensureAssistant(ts, tid, mid), tid, mid, evt.value));
        },
      });
      setThreads((ts) => finishStream(ts, tid, mid));
    } catch {
      setThreads((ts) => appendError(ts, tid, ERROR_TEXT));
    }
  }, []);

  /** First question: bloom into thread 1 and start its stream. */
  const launch = useCallback(
    (question: string) => {
      const q = question.trim();
      if (!q) return;
      const tid = nid("t");
      setThreads(launchThreads(tid, nid("m"), q));
      setActiveId(tid);
      void run(tid, [{ role: "user", content: q }]);
    },
    [run],
  );

  /** Send the draft of thread `tid` (no-op if empty or that thread is busy). */
  const sendIn = useCallback(
    (tid: string) => {
      const t = threadsRef.current.find((x) => x.id === tid);
      const q = t?.draft.trim();
      if (!t || !q || t.busy) return;
      setThreads((ts) => appendUser(ts, tid, nid("m"), q));
      void run(tid, [...historyOf(t), { role: "user", content: q }]);
    },
    [run],
  );

  /** Add a peeking empty thread WITHOUT stealing focus (design handoff). */
  const add = useCallback(() => setThreads((ts) => engineAdd(ts, nid("t"))), []);

  const close = useCallback(
    (tid: string) => {
      // Compute against the ref mirror so the updater stays pure (Strict Mode
      // double-invokes state updaters — no setState side effects inside them).
      const r = engineClose(threadsRef.current, activeId ?? "", tid);
      setThreads(r.threads);
      setActiveId(r.activeId || null);
    },
    [activeId],
  );

  const setDraft = useCallback(
    (tid: string, v: string) => setThreads((ts) => engineSetDraft(ts, tid, v)),
    [],
  );

  return {
    threads,
    activeId,
    setActiveId,
    launch,
    sendIn,
    add,
    close,
    setDraft,
    bloomed: threads.length > 0,
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean

- [ ] **Step 3: Commit**

```bash
git add src/components/home/hero-chat/useThreads.ts
git commit -m "feat(hero): useThreads hook wiring the engine to per-thread SSE streams"
```

---

### Task 4: CSS foundations

**Files:**
- Modify: `src/app/globals.css` (add inside `@layer components`, after the `.step-in` rule ~line 236; keyframes at file end next to `@keyframes msfg-blink`)

- [ ] **Step 1: Add component classes**

Insert after the `.step-in` block, inside `@layer components`:

```css
  /* Hero headline collapse while the chat deck is bloomed. min-height: 0 is
     required (flex item) for max-height: 0 to actually collapse it. Toggle
     via class — inline-style transitions proved unreliable (design handoff). */
  .hero-fade {
    min-height: 0;
    max-height: 480px;
    overflow: hidden;
    transition:
      max-height 0.6s ease,
      opacity 0.5s ease,
      filter 0.5s ease;
  }
  .hero-fade.is-bloomed {
    max-height: 0;
    opacity: 0;
    filter: blur(3px);
    pointer-events: none;
  }

  /* Ambient topographic ring drift (hero bg). Duration/delay set per ring
     via CSS vars. */
  .ring-drift {
    animation: msfg-ring-drift var(--ring-dur, 30s) ease-in-out var(--ring-delay, 0s) infinite alternate;
    transform-origin: 500px 430px;
  }

  /* Gentle 7s breathing loop on the hero logo mark. */
  .logo-breath {
    animation: msfg-logo-breath 7s ease-in-out infinite;
    transform-origin: 50% 80%;
  }

  /* Blinking mint caret at the end of a streaming AI answer. */
  .stream-caret {
    display: inline-block;
    width: 7px;
    height: 16px;
    margin-left: 2px;
    border-radius: 1px;
    background: var(--color-mint);
    vertical-align: -2px;
    animation: msfg-caret 1s step-start infinite;
  }

  /* Mint glow under the hero "Start an application" pill. */
  .pill-glow {
    box-shadow: 0 12px 30px -12px rgba(127, 227, 168, 0.5);
  }
```

- [ ] **Step 2: Add keyframes at the end of the file**

```css
@keyframes msfg-ring-drift {
  from {
    transform: scale(1) translateY(0);
  }
  to {
    transform: scale(1.06) translateY(-8px);
  }
}

@keyframes msfg-logo-breath {
  0%,
  100% {
    transform: scale(1) translateY(0);
  }
  50% {
    transform: scale(1.025) translateY(-3px);
  }
}

@keyframes msfg-caret {
  50% {
    opacity: 0;
  }
}
```

(The global `prefers-reduced-motion` block at the top of the file already
forces all animations/transitions to 0.01ms — rings, breath, caret, fan, and
bloom all become instant. No extra reduced-motion CSS needed.)

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit && npm run lint -- src/app 2>/dev/null || npm run lint`
Expected: clean (CSS is validated by the dev server in Task 8's verification)

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(hero): bloom-collapse, ring-drift, logo-breath, caret CSS foundations"
```

---

### Task 5: SourcesPanel + Convo

**Files:**
- Create: `src/components/home/hero-chat/SourcesPanel.tsx`
- Create: `src/components/home/hero-chat/Convo.tsx`

- [ ] **Step 1: Create SourcesPanel (moved from AiWidget, imports the engine's Sources type)**

`src/components/home/hero-chat/SourcesPanel.tsx`:

```tsx
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
```

- [ ] **Step 2: Create Convo**

`src/components/home/hero-chat/Convo.tsx`:

```tsx
"use client";

import { useEffect, useRef, type RefObject } from "react";
import Link from "next/link";
import { ArrowUp, Mic } from "lucide-react";
import { cn } from "@/lib/cn";
import { ChatMarkdown } from "@/components/ai/ChatMarkdown";
import { SourcesPanel } from "./SourcesPanel";
import type { Thread } from "./threads";

/**
 * The active card's conversation: scrolling message list, streaming dots +
 * mint caret, composer pill, and the recording/compliance disclosure.
 * Empty threads show the "fresh thread" prompt instead of a list.
 */
export function Convo({
  thread,
  iconSrc,
  shortName,
  assistantName,
  onDraft,
  onSend,
  composerRef,
}: {
  thread: Thread;
  iconSrc: string;
  shortName: string;
  assistantName: string;
  onDraft: (v: string) => void;
  onSend: () => void;
  composerRef?: RefObject<HTMLInputElement | null>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [thread.msgs]);

  const lastMsg = thread.msgs[thread.msgs.length - 1];
  const thinking = thread.busy && (!lastMsg || lastMsg.role === "user");

  return (
    <div className="flex h-full min-h-0 flex-col">
      {thread.msgs.length === 0 ? (
        <div className="flex flex-1 flex-col justify-end gap-2 pb-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={iconSrc} alt={shortName} className="size-[34px] rounded-md object-cover object-left" />
          <p className="text-[14.5px] font-medium text-muted">
            Fresh thread — ask anything about this scenario.
          </p>
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-1 pb-2 pt-1 text-left"
        >
          {thread.msgs.map((m) => {
            if (m.role === "user") {
              return (
                <div
                  key={m.id}
                  className="max-w-[86%] self-end rounded-2xl rounded-br-[5px] bg-green-700 px-3.5 py-2.5 text-[15px] leading-[1.42] text-white"
                >
                  {m.text}
                </div>
              );
            }
            if (m.role === "assistant") {
              return (
                <div key={m.id} className="flex items-start gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={iconSrc}
                    alt=""
                    aria-hidden
                    className="mt-1 size-5 shrink-0 rounded object-cover object-left"
                  />
                  <div className="max-w-[90%] rounded-2xl rounded-tl-[5px] bg-paper-2 px-3.5 py-2.5">
                    {m.text === "" && !m.done ? (
                      <span className="inline-flex gap-1">
                        <span className="typing-dot" />
                        <span className="typing-dot" />
                        <span className="typing-dot" />
                      </span>
                    ) : (
                      <>
                        <ChatMarkdown>{m.text}</ChatMarkdown>
                        {!m.done && <span className="stream-caret" aria-hidden />}
                      </>
                    )}
                    {m.sources && <SourcesPanel sources={m.sources} />}
                  </div>
                </div>
              );
            }
            return (
              <div
                key={m.id}
                className="max-w-[86%] self-start rounded-2xl rounded-tl-[5px] bg-paper-2 px-3.5 py-2.5 text-[15px] leading-normal text-ink"
              >
                {m.text}{" "}
                <Link
                  href="/loan-officers"
                  className="font-semibold text-green-700 underline-offset-2 hover:underline"
                >
                  Talk to a loan officer
                </Link>
              </div>
            );
          })}
          {thinking && (
            <div className="self-start rounded-2xl rounded-tl-[5px] bg-paper-2 px-3.5 py-2.5">
              <span className="inline-flex gap-1">
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
              </span>
            </div>
          )}
        </div>
      )}

      <form
        className="flex items-center gap-1.5 rounded-[15px] border border-line bg-white py-[5px] pl-3.5 pr-[5px]"
        onSubmit={(e) => {
          e.preventDefault();
          onSend();
        }}
      >
        <input
          ref={composerRef}
          value={thread.draft}
          onChange={(e) => onDraft(e.target.value)}
          placeholder="Continue this thread…"
          aria-label={`Message ${assistantName} in ${thread.title}`}
          className="min-w-0 flex-1 border-0 bg-transparent text-[15px] text-ink outline-none placeholder:text-[#9aa39c]"
        />
        <button
          type="button"
          aria-label="Voice input"
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-[#6b756d] transition-colors hover:bg-paper-2"
        >
          <Mic className="size-[17px]" strokeWidth={1.8} />
        </button>
        <button
          type="submit"
          aria-label="Send"
          disabled={thread.busy}
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full transition-colors",
            thread.draft.trim() && !thread.busy
              ? "bg-green-700 text-white"
              : "bg-paper-2 text-[#9aa39c]",
          )}
        >
          <ArrowUp className="size-4" strokeWidth={2.2} />
        </button>
      </form>
      <p className="mt-1.5 text-[11px] leading-snug text-[#6b756d]">
        {assistantName}
        {" can make mistakes and may be recorded for quality & compliance. Not a commitment to lend."}
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean

- [ ] **Step 4: Commit**

```bash
git add src/components/home/hero-chat/SourcesPanel.tsx src/components/home/hero-chat/Convo.tsx
git commit -m "feat(hero): Convo message list + composer with extracted SourcesPanel"
```

---

### Task 6: RestingCard

**Files:**
- Create: `src/components/home/hero-chat/RestingCard.tsx`

- [ ] **Step 1: Create the resting card**

`src/components/home/hero-chat/RestingCard.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUp, Mic } from "lucide-react";
import { cn } from "@/lib/cn";
import { Switch } from "@/components/ui/Switch";
import { IntentTabs } from "@/components/home/IntentTabs";

/**
 * The hero card at rest — the familiar single chat box (design handoff
 * "State 1"). AI mode on: big input that launches the first thread (bloom).
 * AI mode off: the IntentTabs picker. The AI-mode toggle exists ONLY here;
 * once bloomed the deck replaces this card until reload.
 */
export function RestingCard({
  assistantName,
  shortName,
  iconSrc,
  aiMode,
  onAiMode,
  onLaunch,
}: {
  assistantName: string;
  shortName: string;
  iconSrc: string;
  aiMode: boolean;
  onAiMode: (next: boolean) => void;
  onLaunch: (question: string) => void;
}) {
  const [value, setValue] = useState("");
  const go = () => {
    if (value.trim()) onLaunch(value);
  };

  return (
    <div className="mx-auto mt-7 w-full max-w-[760px] overflow-hidden rounded-[30px] bg-white text-ink shadow-hero">
      {aiMode ? (
        <div className="px-[22px] pt-[22px]">
          <div className="flex items-center gap-3.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={iconSrc}
              alt={shortName}
              className="size-[34px] shrink-0 rounded-md object-cover object-left"
            />
            <input
              className="min-w-0 flex-1 border-0 bg-transparent text-[22px] text-ink outline-none placeholder:text-[#9aa39c] max-[600px]:text-[17px]"
              placeholder="Ask me anything, or tell me what you want to do"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && go()}
              aria-label={`Ask ${assistantName}`}
            />
            <button
              type="button"
              aria-label="Voice input"
              className="flex size-[38px] shrink-0 items-center justify-center rounded-full text-[#6b756d] transition-colors hover:bg-paper-2"
            >
              <Mic className="size-5" strokeWidth={1.8} />
            </button>
            <button
              type="button"
              onClick={go}
              aria-label="Send"
              className={cn(
                "flex size-11 shrink-0 items-center justify-center rounded-full transition-all",
                value.trim()
                  ? "bg-green-800 text-white shadow-3d"
                  : "bg-paper-2 text-[#9aa39c]",
              )}
            >
              <ArrowUp className="size-[18px]" strokeWidth={2.2} />
            </button>
          </div>
          <p className="mx-auto mt-4 max-w-[560px] text-center text-[14.5px] leading-[1.45] text-muted">
            {assistantName}
            {" can make mistakes and may be recorded for quality & compliance. Not a commitment to lend."}
          </p>
          <Link
            href="/loan-officers"
            className="block pt-3.5 text-left text-[16.5px] font-semibold text-green-700 underline-offset-2 hover:underline"
          >
            Talk to a loan officer
          </Link>
        </div>
      ) : (
        <IntentTabs />
      )}

      <div className="mt-4 flex items-center justify-end gap-2.5 border-t border-line bg-[#fafbf8] px-[22px] py-4 text-[13.5px] font-semibold">
        <span className="ai-text font-bold">AI mode</span>
        <Switch checked={aiMode} onChange={onAiMode} label="Toggle AI mode" />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean

- [ ] **Step 3: Commit**

```bash
git add src/components/home/hero-chat/RestingCard.tsx
git commit -m "feat(hero): resting chat card with AI-mode toggle and IntentTabs swap"
```

---

### Task 7: ThreadCard + Deck

**Files:**
- Create: `src/components/home/hero-chat/ThreadCard.tsx`
- Create: `src/components/home/hero-chat/Deck.tsx`

- [ ] **Step 1: Create ThreadCard**

`src/components/home/hero-chat/ThreadCard.tsx`:

```tsx
"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Thread } from "./threads";

/**
 * Deck card chrome: status dot, title, (inactive) first-message preview,
 * card number, and × close on the active card when >1 thread. The top row of
 * an INACTIVE card is a real button so threads are keyboard-operable.
 */
export function ThreadCard({
  thread,
  index,
  isActive,
  canClose,
  onActivate,
  onClose,
  children,
  className,
}: {
  thread: Thread;
  index: number;
  isActive: boolean;
  canClose: boolean;
  onActivate: () => void;
  onClose: () => void;
  children?: React.ReactNode;
  className?: string;
}) {
  const firstMsg = thread.msgs.find((m) => m.role === "user");
  const top = (
    <>
      <span
        className={cn("size-2 shrink-0 rounded-full", isActive ? "bg-mint" : "bg-[#c4cdc7]")}
        aria-hidden
      />
      <span className="shrink-0 whitespace-nowrap text-[15.5px] font-semibold text-ink">
        {thread.title}
      </span>
      {!isActive && firstMsg && (
        <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left text-[13.5px] text-muted">
          · {firstMsg.text}
        </span>
      )}
      <span className="ml-auto shrink-0 text-[13px] font-bold tracking-[0.04em] text-[#c0c9c3]">
        {String(index + 1).padStart(2, "0")}
      </span>
    </>
  );

  return (
    <div
      className={cn(
        "flex flex-col rounded-[24px] bg-white px-[18px] pb-4 pt-3.5 shadow-hero",
        className,
      )}
    >
      {isActive ? (
        <div className="flex items-center gap-2 border-b border-line pb-3">
          {top}
          {canClose && (
            <button
              type="button"
              aria-label={`Close thread: ${thread.title}`}
              onClick={onClose}
              className="ml-1 grid place-items-center rounded p-0.5 text-[#aab2ad] hover:text-ink"
            >
              <X className="size-[15px]" strokeWidth={2.2} />
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={onActivate}
          aria-label={`Switch to thread: ${thread.title}`}
          className="flex w-full cursor-pointer items-center gap-2 border-b border-line pb-3"
        >
          {top}
        </button>
      )}
      {isActive && <div className="min-h-0 flex-1 pt-3">{children}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Create Deck**

`src/components/home/hero-chat/Deck.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { ThreadCard } from "./ThreadCard";
import { MAX_THREADS, type Thread } from "./threads";

/** Fan transform per design handoff: depth d from the active card, dir −1
 *  (before) / +1 (after). Active card carries the parallax CSS vars. */
function fanStyle(i: number, activePos: number): CSSProperties {
  const depth = Math.abs(i - activePos);
  if (depth === 0) {
    return {
      transform:
        "translateY(0) scale(1) rotate(0deg) perspective(1000px) rotateX(var(--tilt-x, 0deg)) rotateY(var(--tilt-y, 0deg))",
      zIndex: 30,
    };
  }
  const dir = i < activePos ? -1 : 1;
  return {
    transform: `translateY(${-(40 + (depth - 1) * 26)}px) translateX(${dir * depth * 5}px) scale(${1 - depth * 0.04}) rotate(${dir * (1.1 + depth * 0.45)}deg)`,
    zIndex: 22 - depth,
  };
}

/** matchMedia hook (mounted-gated to avoid hydration mismatch). */
function useMedia(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const apply = () => setMatches(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [query]);
  return matches;
}

/**
 * The bloomed deck: desktop = absolutely-positioned fan with parallax tilt
 * and spring re-fan; ≤980px = horizontal thread-tab row above one static
 * card. Footer: pips + live count, "Add a question" (< cap), LO link.
 */
export function Deck({
  threads,
  activeId,
  onActivate,
  onClose,
  onAdd,
  renderConvo,
}: {
  threads: Thread[];
  activeId: string | null;
  onActivate: (tid: string) => void;
  onClose: (tid: string) => void;
  onAdd: () => void;
  renderConvo: (t: Thread, composerRef: RefObject<HTMLInputElement | null>) => React.ReactNode;
}) {
  const narrow = useMedia("(max-width: 980px)");
  const reduced = useMedia("(prefers-reduced-motion: reduce)");
  const deckRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLInputElement>(null);
  const raf = useRef(0);

  const activePos = Math.max(
    0,
    threads.findIndex((t) => t.id === activeId),
  );
  const active = threads[activePos];

  // Focus the active card's composer whenever the front thread changes.
  useEffect(() => {
    composerRef.current?.focus();
  }, [activeId]);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  /** Parallax tilt via rAF + CSS vars — no React re-render per mousemove. */
  const onMove = (e: React.MouseEvent) => {
    if (reduced || narrow) return;
    const el = deckRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      el.style.setProperty("--tilt-x", `${py * -4}deg`);
      el.style.setProperty("--tilt-y", `${px * 5}deg`);
    });
  };
  const onLeave = () => {
    const el = deckRef.current;
    if (!el) return;
    el.style.setProperty("--tilt-x", "0deg");
    el.style.setProperty("--tilt-y", "0deg");
  };

  const footer = (
    <div className="mt-[18px] flex w-full flex-wrap items-center justify-center gap-[22px]">
      <span className="flex items-center gap-1.5">
        {threads.map((t) => (
          <span
            key={t.id}
            aria-hidden
            className={cn(
              "size-[7px] rounded-full transition-colors duration-300",
              t.id === activeId ? "bg-mint" : "bg-white/30",
            )}
          />
        ))}
        <span aria-live="polite" className="ml-1 text-[13px] font-medium text-on-dark-2">
          {threads.length}/{MAX_THREADS} threads
        </span>
      </span>
      {threads.length < MAX_THREADS && (
        <button
          type="button"
          onClick={onAdd}
          className="flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-2 text-[13.5px] font-semibold text-on-dark backdrop-blur-sm transition-colors hover:bg-white/20"
        >
          <Plus className="size-[16px]" strokeWidth={2.4} /> Add a question
        </button>
      )}
      <Link
        href="/loan-officers"
        className="text-[15px] font-semibold text-mint underline-offset-2 hover:underline"
      >
        Talk to a loan officer
      </Link>
    </div>
  );

  // ----- ≤980px: tab row + single static card --------------------------------
  if (narrow) {
    return (
      <div className="mx-auto mt-7 flex w-full flex-col items-center">
        <div className="flex w-full gap-2 overflow-x-auto pb-2.5" role="tablist" aria-label="Open questions">
          {threads.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={t.id === activeId}
              onClick={() => onActivate(t.id)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-[13.5px] font-semibold transition-colors",
                t.id === activeId ? "bg-white text-ink" : "bg-white/10 text-on-dark",
              )}
            >
              <span
                aria-hidden
                className={cn("size-2 rounded-full", t.id === activeId ? "bg-mint" : "bg-white/40")}
              />
              {t.title}
            </button>
          ))}
        </div>
        {active && (
          <ThreadCard
            thread={active}
            index={activePos}
            isActive
            canClose={threads.length > 1}
            onActivate={() => {}}
            onClose={() => onClose(active.id)}
            className="w-full [&>div:last-child]:max-h-[60vh]"
          >
            {renderConvo(active, composerRef)}
          </ThreadCard>
        )}
        {footer}
      </div>
    );
  }

  // ----- Desktop: the fan -----------------------------------------------------
  return (
    <div className="relative z-30 mx-auto mt-7 flex w-full max-w-[720px] flex-col items-center">
      <div
        ref={deckRef}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        className="relative h-[810px] w-full"
      >
        {threads.map((t, i) => {
          const isActive = t.id === activeId;
          return (
            <div
              key={t.id}
              style={fanStyle(i, activePos)}
              className={cn(
                "absolute inset-x-0 top-[70px] origin-bottom",
                !reduced && "transition-transform duration-[550ms] [transition-timing-function:cubic-bezier(0.18,0.9,0.2,1.05)]",
                !isActive && "cursor-pointer",
              )}
            >
              <ThreadCard
                thread={t}
                index={i}
                isActive={isActive}
                canClose={threads.length > 1}
                onActivate={() => onActivate(t.id)}
                onClose={() => onClose(t.id)}
                className={isActive ? "[&>div:last-child]:h-[580px]" : undefined}
              >
                {isActive && renderConvo(t, composerRef)}
              </ThreadCard>
            </div>
          );
        })}
      </div>
      {footer}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean

- [ ] **Step 4: Commit**

```bash
git add src/components/home/hero-chat/ThreadCard.tsx src/components/home/hero-chat/Deck.tsx
git commit -m "feat(hero): fanned deck with parallax tilt and mobile tab-row fallback"
```

---

### Task 8: HeroChat + HeroBloomShell + Hero rewire; delete AiWidget

**Files:**
- Create: `src/components/home/hero-chat/HeroChat.tsx`
- Create: `src/components/home/HeroBloomShell.tsx`
- Modify: `src/components/home/Hero.tsx`
- Delete: `src/components/home/AiWidget.tsx`

- [ ] **Step 1: Create HeroChat**

`src/components/home/hero-chat/HeroChat.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Convo } from "./Convo";
import { Deck } from "./Deck";
import { RestingCard } from "./RestingCard";
import { useThreads } from "./useThreads";

/**
 * Hero chat orchestrator. Resting (no threads): the familiar single card
 * (AI mode on → big input; off → IntentTabs). First question blooms into the
 * fanned deck of up to 5 threads and reports the bloom up so the hero shell
 * can collapse the headline. There is no toggle while bloomed (user decision).
 */
export function HeroChat({
  assistantName,
  shortName,
  iconSrc,
  onBloom,
}: {
  assistantName: string;
  shortName: string;
  iconSrc: string;
  onBloom: (bloomed: boolean) => void;
}) {
  const T = useThreads();
  const [aiMode, setAiMode] = useState(true);

  useEffect(() => {
    onBloom(T.bloomed);
  }, [T.bloomed, onBloom]);

  if (!T.bloomed) {
    return (
      <RestingCard
        assistantName={assistantName}
        shortName={shortName}
        iconSrc={iconSrc}
        aiMode={aiMode}
        onAiMode={setAiMode}
        onLaunch={T.launch}
      />
    );
  }

  return (
    <Deck
      threads={T.threads}
      activeId={T.activeId}
      onActivate={T.setActiveId}
      onClose={T.close}
      onAdd={T.add}
      renderConvo={(t, composerRef) => (
        <Convo
          thread={t}
          iconSrc={iconSrc}
          shortName={shortName}
          assistantName={assistantName}
          composerRef={composerRef}
          onDraft={(v) => T.setDraft(t.id, v)}
          onSend={() => T.sendIn(t.id)}
        />
      )}
    />
  );
}
```

- [ ] **Step 2: Create HeroBloomShell**

`src/components/home/HeroBloomShell.tsx`:

```tsx
"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { HeroChat } from "@/components/home/hero-chat/HeroChat";

/**
 * Client shell connecting the chat's bloom state to the headline collapse.
 * The headline arrives server-rendered as a ReactNode; we only toggle the
 * `.is-bloomed` class (CSS transition — see globals.css `.hero-fade`).
 */
export function HeroBloomShell({
  headline,
  assistantName,
  shortName,
  iconSrc,
}: {
  headline: React.ReactNode;
  assistantName: string;
  shortName: string;
  iconSrc: string;
}) {
  const [bloomed, setBloomed] = useState(false);
  return (
    <>
      <div
        className={cn("hero-fade flex w-full flex-col items-center", bloomed && "is-bloomed")}
        aria-hidden={bloomed}
      >
        {headline}
      </div>
      <HeroChat
        assistantName={assistantName}
        shortName={shortName}
        iconSrc={iconSrc}
        onBloom={setBloomed}
      />
    </>
  );
}
```

- [ ] **Step 3: Rewire Hero.tsx**

Replace the full contents of `src/components/home/Hero.tsx`:

```tsx
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { HeroBloomShell } from "@/components/home/HeroBloomShell";
import { getTenantConfig } from "@/server/tenant/config";

/** Ambient topographic rings (design handoff): 5 mint contour circles that
 *  slowly drift/scale. Pure CSS animation — server-rendered, aria-hidden. */
function TopoRings() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 1000 1000"
      preserveAspectRatio="xMidYMid slice"
      className="pointer-events-none absolute left-1/2 top-0 h-[1300px] w-[1300px] -translate-x-1/2"
    >
      {[120, 220, 320, 420, 520].map((r, i) => (
        <circle
          key={r}
          cx="500"
          cy="430"
          r={r}
          fill="none"
          className="ring-drift stroke-mint"
          strokeWidth="1"
          style={{
            opacity: 0.06 + i * 0.004,
            ["--ring-dur" as string]: `${26 + i * 5}s`,
            ["--ring-delay" as string]: `${i * 0.6}s`,
          }}
        />
      ))}
    </svg>
  );
}

export async function Hero() {
  const config = await getTenantConfig();
  return (
    <section id="top" className="hero-bg relative px-0 pb-[72px] pt-10 text-white">
      <TopoRings />
      <div className="wrap relative flex flex-col items-center text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={config.brand.logos.mark}
          alt={config.brand.legalName}
          className="logo-breath mb-4 h-[132px] w-auto"
        />

        <HeroBloomShell
          assistantName={config.brand.assistantName}
          shortName={config.brand.shortName}
          iconSrc={config.brand.logos.horizontal}
          headline={
            <>
              <h1 className="m-0 max-w-[18ch] text-balance text-[clamp(32px,4.4vw,54px)] font-extrabold leading-[1.04] tracking-[-0.035em] text-mint">
                Expert Mortgage Guidance from Seasoned Professionals
              </h1>
              <p className="mt-3.5 max-w-[40ch] text-balance text-[clamp(16px,1.9vw,20px)] font-medium tracking-[-0.01em] text-on-dark-2">
                Personal, transparent home financing across seven states.
              </p>
            </>
          }
        />

        <dl className="mt-7 flex justify-center gap-12 max-[980px]:gap-9">
          {config.marketing?.stats.map((s) => (
            <div key={s.label}>
              <dd className="m-0 whitespace-nowrap text-[clamp(34px,4vw,46px)] font-extrabold tracking-[-0.03em] text-on-dark-3">
                {s.num}
              </dd>
              <dt className="mt-0.5 text-[14px] text-on-dark-2">{s.label}</dt>
            </div>
          ))}
        </dl>

        <Link
          href="/apply/buy"
          className="pill-glow mt-8 inline-flex items-center gap-2 rounded-full bg-mint px-6 py-[13px] text-[17px] font-semibold text-green-900 transition-transform hover:-translate-y-0.5"
        >
          Start an application <ArrowRight className="size-[17px]" strokeWidth={2.4} />
        </Link>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Delete AiWidget**

```bash
rm src/components/home/AiWidget.tsx
grep -rn "AiWidget" src/  # expected: no matches
```

- [ ] **Step 5: Typecheck + lint + full test suite**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: all clean/pass

- [ ] **Step 6: Commit**

```bash
git add -A src/components/home src/app/globals.css
git commit -m "feat(hero): bloom the chat card into the fanned multi-thread deck"
```

---

### Task 9: Browser verification (preview)

**Files:** none (verification only; fix-forward anything found, then amend/commit)

Use the `msfg-web` launch config (`.claude/launch.json`, port 3000). The home page needs the dev DB reachable (tenant config read). Note: after each full page load, wait for hydration before clicking (first click on a fresh load can be swallowed).

- [ ] **Step 1: Resting + bloom.** Load `/`. Verify the resting card (30px radius, 22px input, gradient AI-mode label). Type "What are rates today?" + Enter. Expect: headline collapses (~0.6s), deck appears with Thread card "01", user bubble right, typing dots, then a streamed answer with blinking caret; title becomes "Rates today" when the stream finishes; a citations/disclaimer panel renders if the answer is grounded.
- [ ] **Step 2: Add + concurrent streams.** Click "Add a question" — a peeking tab joins BEHIND (focus stays on Thread 1, any in-flight stream keeps streaming). Click the peeking card — it springs to the front; ask a different question; while it streams, switch back to Thread 1 and confirm its transcript is intact and its composer works (send a follow-up).
- [ ] **Step 3: Close rules.** With 2+ threads, × closes the active card and the last remaining thread comes forward. With 1 thread, no × is rendered.
- [ ] **Step 4: Cap.** Add until 5/5 — the "Add a question" button disappears; pips show 5 with the active one mint.
- [ ] **Step 5: Toggle (rest only).** Reload. Flip AI mode off → IntentTabs picker renders inside the resting card; flip on → input returns. Confirm no toggle exists anywhere in the bloomed deck.
- [ ] **Step 6: Keyboard.** Reload, bloom, add a thread. Tab to the peeking card's top-row button, press Enter — it comes forward and focus lands in its composer. Verify visible focus rings on mic/send/close/toggle.
- [ ] **Step 7: Mobile (preview_resize 375×812).** Thread tabs render as a horizontal scrollable row, single full-width card below (body ≤60vh), footer wraps beneath. Resting card input is 17px.
- [ ] **Step 8: Reduced motion (preview_resize colorScheme + emulate reduce via preview_eval `matchMedia` check or OS setting).** Bloom/collapse/fan happen as instant swaps; rings/breath/caret effectively static.
- [ ] **Step 9: Console + screenshots.** `preview_console_logs` clean of errors; capture desktop bloomed deck + mobile screenshots as proof.
- [ ] **Step 10: Commit any fixes**

```bash
git add -A && git commit -m "fix(hero): polish from browser verification of the fanned deck"
```

---

## Self-review (done at plan time)

- **Spec coverage:** resting card ✓ (T6) · bloom + headline collapse ✓ (T4/T8) · fan math/spring/parallax ✓ (T7) · per-thread SSE sessions + sources ✓ (T1–T3, T5) · titles ✓ (T1) · add/close/cap rules ✓ (T1/T3/T7) · toggle-at-rest-only + IntentTabs ✓ (T6/T8) · rings/breath/pill ✓ (T4/T8) · mobile tab row ✓ (T7) · reduced motion ✓ (T4 note, T7 guards) · a11y labels/focus/aria-live ✓ (T5–T7) · error turns ✓ (T1/T3/T5) · unit tests ✓ (T1/T2) · browser checks ✓ (T9).
- **Type consistency:** `Thread`/`Msg`/`Sources` defined once in `threads.ts`; `ChatEvent`/`ChatHistoryMsg` once in `chatClient.ts`; hook API (`launch/sendIn/add/close/setDraft/setActiveId/bloomed`) matches `HeroChat` usage; `renderConvo(t, composerRef)` signature matches between `Deck` and `HeroChat`.
- **Placeholders:** none — every code step contains the complete file.
```
