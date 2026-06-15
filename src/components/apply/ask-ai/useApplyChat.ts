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
