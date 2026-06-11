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
