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
