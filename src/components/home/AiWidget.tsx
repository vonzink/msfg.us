"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUp, Mic } from "lucide-react";
import { Switch } from "@/components/ui/Switch";
import { cn } from "@/lib/cn";
import { ChatMarkdown } from "@/components/ai/ChatMarkdown";
import { IntentReel } from "@/components/home/IntentReel";
import type { BrainAnswer } from "@/server/ai/brain/types";

/** A turn in the transcript. Brain answers carry the full compliance payload;
 *  DeepSeek (pre-Brain) turns are streamed plain text. Both render as Markdown. */
type ChatTurn =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string }
  | { role: "answer"; data: BrainAnswer }
  | { role: "error"; text: string };

/** Wire format for one SSE event from /api/v1/ai/chat (DeepSeek path). */
type ChatEvent =
  | { type: "text"; value: string }
  | { type: "tool"; name: string }
  | { type: "session"; sessionId: string }
  | { type: "done" }
  | { type: "error" };

/** Stable per-visitor id for the Brain (persisted in sessionStorage). */
function getVisitorSessionId(): string {
  if (typeof window === "undefined") return "";
  const KEY = "msfg.ai.sessionId";
  let id = window.sessionStorage.getItem(KEY);
  if (!id) {
    id = window.crypto?.randomUUID?.() ?? `s_${Date.now()}_${Math.round(Math.random() * 1e9)}`;
    window.sessionStorage.setItem(KEY, id);
  }
  return id;
}

/** Render a citation line, skipping null fields and sanitizing newlines. */
function citationLine(c: BrainAnswer["citations"][number]): string {
  return [
    c.sourceName,
    c.section,
    c.pageNumber ? `p. ${c.pageNumber}` : null,
    c.effectiveDate ? `eff. ${c.effectiveDate}` : null,
  ]
    .filter(Boolean)
    .map((s) => String(s).replace(/\s*\n\s*/g, " ").trim())
    .join(" · ");
}

/** Brain answer bubble: verbatim answer (as Markdown) + sources + disclaimer + escalation. */
function AnswerBubble({ data }: { data: BrainAnswer }) {
  return (
    <div className="max-w-[82%] self-start rounded-2xl rounded-bl-[5px] bg-paper-2 px-4 py-3 text-left">
      <ChatMarkdown>{data.answer}</ChatMarkdown>

      {data.citations.length > 0 && (
        <div className="mt-2 border-t border-line pt-2 text-[12px] text-[#6b756d]">
          <span className="font-semibold">Sources:</span>
          <ul className="mt-1 space-y-0.5">
            {data.citations.map((c, i) => (
              <li key={i}>{citationLine(c)}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Disclaimer is rendered with EVERY answer (compliance — not optional). */}
      <p className="mt-2 text-[11.5px] leading-snug text-[#6b756d]">{data.disclaimer}</p>

      {data.humanEscalationRequired && (
        <Link
          href="/loan-officers"
          className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-green-700 px-3.5 py-1.5 text-[13px] font-semibold text-white hover:bg-green-800"
        >
          Talk to a licensed loan officer <ArrowRight className="size-[15px]" strokeWidth={1.9} />
        </Link>
      )}
    </div>
  );
}

/** Homepage hero card. Opens in AI mode by default; the toggle flips back to the
 *  Classic slot-reel of apply intents. When `brainEnabled`, answers come from the
 *  compliance-bound Mortgage Brain (verbatim + citations); otherwise the DeepSeek
 *  assistant streams (the pre-Brain experience). `iconSrc` is the MSFG logo we
 *  crop (object-left) into the small assistant mark. */
export function AiWidget({
  assistantName,
  shortName,
  iconSrc,
  brainEnabled = false,
}: {
  assistantName: string;
  shortName: string;
  iconSrc: string;
  brainEnabled?: boolean;
}) {
  const [aiMode, setAiMode] = useState(true);
  const [convo, setConvo] = useState<ChatTurn[]>([]);
  const [typing, setTyping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [value, setValue] = useState("");
  const conversationIdRef = useRef<string | undefined>(undefined); // Brain
  const sessionIdRef = useRef<string | null>(null); // DeepSeek recording session
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [convo, typing]);

  /** Brain path: one JSON request, render the verbatim answer. */
  const sendViaBrain = async (text: string) => {
    try {
      const res = await fetch("/api/v1/ai/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: getVisitorSessionId(),
          conversationId: conversationIdRef.current,
          question: text,
        }),
      });
      const data = (await res.json()) as BrainAnswer | { error?: string; kind?: string };
      if (!res.ok || !("answer" in data) || typeof data.answer !== "string") {
        const msg =
          "error" in data && data.error
            ? data.error
            : "Sorry — I hit a problem. Please try again, or talk to a loan officer.";
        setConvo((c) => [...c, { role: "error", text: msg }]);
        return;
      }
      if (data.conversationId) conversationIdRef.current = data.conversationId;
      setConvo((c) => [...c, { role: "answer", data }]);
    } catch {
      setConvo((c) => [
        ...c,
        {
          role: "error",
          text: "Sorry — I couldn't reach the assistant. Please try again, or talk to a loan officer.",
        },
      ]);
    }
  };

  /** DeepSeek path (pre-Brain): stream the reply token-by-token into the bubble. */
  const sendViaChat = async (text: string) => {
    const history = [
      ...convo.flatMap((t) =>
        t.role === "user" || t.role === "assistant" ? [{ role: t.role, content: t.text }] : [],
      ),
      { role: "user" as const, content: text },
    ];
    let assistantStarted = false;
    const pushDelta = (delta: string) => {
      setConvo((c) => {
        if (!assistantStarted) return c;
        const next = [...c];
        const last = next[next.length - 1];
        if (last && last.role === "assistant") {
          next[next.length - 1] = { role: "assistant", text: last.text + delta };
        }
        return next;
      });
    };
    try {
      const res = await fetch("/api/v1/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sessionIdRef.current ?? undefined, messages: history }),
      });
      if (!res.ok || !res.body) throw new Error(`chat request failed: ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const handle = (evt: ChatEvent) => {
        if (evt.type === "session") {
          sessionIdRef.current = evt.sessionId;
          return;
        }
        if (evt.type === "text") {
          if (!assistantStarted) {
            assistantStarted = true;
            setTyping(false);
            setConvo((c) => [...c, { role: "assistant", text: "" }]);
          }
          pushDelta(evt.value);
        }
      };
      for (;;) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        buffer += decoder.decode(chunk, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const line = frame.trim();
          if (!line.startsWith("data:")) continue;
          const jsonStr = line.slice(5).trim();
          if (!jsonStr) continue;
          try {
            handle(JSON.parse(jsonStr) as ChatEvent);
          } catch {
            // ignore malformed frames; keep streaming
          }
        }
      }
    } catch {
      setConvo((c) => [
        ...c,
        {
          role: "error",
          text: "Sorry — I hit a problem reaching the assistant. Please try again, or talk to a loan officer.",
        },
      ]);
    }
  };

  /** Send a user message via whichever assistant is active. */
  const send = async (userText: string) => {
    const text = userText.trim();
    if (!text || busy) return;
    setConvo((c) => [...c, { role: "user", text }]);
    setValue("");
    setTyping(true);
    setBusy(true);
    try {
      if (brainEnabled) await sendViaBrain(text);
      else await sendViaChat(text);
    } finally {
      setTyping(false);
      setBusy(false);
    }
  };

  const onSend = () => {
    if (value.trim()) void send(value);
  };

  return (
    <div className="mx-auto mt-7 w-full max-w-[760px] overflow-hidden rounded-xl bg-white text-ink shadow-hero">
      {aiMode && convo.length > 0 && (
        <div
          ref={scrollRef}
          className="flex max-h-[360px] flex-col gap-3.5 overflow-y-auto p-[18px] text-left"
        >
          {convo.map((m, i) => {
            if (m.role === "user") {
              return (
                <div
                  key={i}
                  className="max-w-[82%] self-end rounded-2xl rounded-br-[5px] bg-green-700 px-4 py-3 text-[15px] leading-normal text-white"
                >
                  {m.text}
                </div>
              );
            }
            if (m.role === "assistant") {
              return (
                <div
                  key={i}
                  className="max-w-[82%] self-start rounded-2xl rounded-bl-[5px] bg-paper-2 px-4 py-3"
                >
                  <ChatMarkdown>{m.text}</ChatMarkdown>
                </div>
              );
            }
            if (m.role === "error") {
              return (
                <div
                  key={i}
                  className="max-w-[82%] self-start rounded-2xl rounded-bl-[5px] bg-paper-2 px-4 py-3 text-[15px] leading-normal text-ink"
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
            }
            return <AnswerBubble key={i} data={m.data} />;
          })}
          {typing && (
            <div className="max-w-[82%] self-start rounded-2xl rounded-bl-[5px] bg-paper-2 px-4 py-3">
              <span className="inline-flex gap-1">
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
              </span>
            </div>
          )}
        </div>
      )}

      {aiMode ? (
        <div className="p-2">
          <div className="flex items-center gap-3 rounded-lg px-4 py-3.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={iconSrc}
              alt={shortName}
              className="size-[30px] shrink-0 rounded-md object-cover object-left"
            />
            <input
              className="min-w-0 flex-1 border-0 bg-transparent text-[18px] text-ink outline-none placeholder:text-[#9aa39c]"
              placeholder="Ask me anything, or tell me what you want to do"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSend()}
              aria-label={`Ask ${assistantName}`}
              disabled={busy}
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
              onClick={onSend}
              aria-label="Send"
              disabled={busy}
              className={cn(
                "flex size-[38px] shrink-0 items-center justify-center rounded-full transition-colors",
                value.trim() && !busy ? "bg-spring text-[#04130c]" : "bg-paper-2 text-[#9aa39c]",
              )}
            >
              <ArrowUp className="size-[18px]" strokeWidth={2} />
            </button>
          </div>
          {/* Recording / privacy disclosure + always-visible human handoff. */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-3.5 pt-1">
            <p className="text-[12px] leading-snug text-[#6b756d]">
              {assistantName}
              {" can make mistakes and may be recorded for quality & compliance. Not a commitment to lend."}
            </p>
            <Link
              href="/loan-officers"
              className="shrink-0 text-[12.5px] font-semibold text-green-700 underline-offset-2 hover:underline"
            >
              Talk to a loan officer
            </Link>
          </div>
        </div>
      ) : (
        <IntentReel />
      )}

      <div className="flex items-center border-t border-line bg-[#fafbf8] px-[18px] py-3.5">
        <div className="ml-auto flex items-center gap-2.5 text-[13.5px] font-semibold">
          <span className="ai-text font-bold">AI mode</span>
          <Switch checked={aiMode} onChange={setAiMode} label="Toggle AI mode" />
        </div>
      </div>
    </div>
  );
}
