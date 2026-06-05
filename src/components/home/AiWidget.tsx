"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUp,
  Banknote,
  Home,
  Mic,
  PiggyBank,
  RefreshCw,
} from "lucide-react";
import { Mark } from "@/components/ui/Mark";
import { Switch } from "@/components/ui/Switch";
import { cn } from "@/lib/cn";
import { AI_PILLS } from "@/content/ai-script";
import type { BrainAnswer } from "@/server/ai/brain/types";

const PILL_ICONS: Record<string, React.ReactNode> = {
  "Start my pre-approval": <ArrowRight className="size-[18px]" strokeWidth={1.8} />,
  "Lower my rate": <RefreshCw className="size-[18px]" strokeWidth={1.8} />,
  "Start saving": <PiggyBank className="size-[18px]" strokeWidth={1.8} />,
  "Get cash": <Banknote className="size-[18px]" strokeWidth={1.8} />,
};

/** Quick-prompt pills map to a natural first message sent to the assistant. */
const PILL_PROMPTS: Record<string, string> = {
  "Start my pre-approval": "I'm looking to start my pre-approval — how does it work?",
  "Lower my rate": "Can I lower my current mortgage rate?",
  "Start saving": "How can a refinance help me save money?",
  "Get cash": "I'd like to get cash from my home — what are my options?",
};

const INTENTS = [
  { label: "Buy a home", href: "/apply/buy", icon: <Home className="size-[26px]" strokeWidth={1.8} /> },
  { label: "Refinance my mortgage", href: "/apply/refi", icon: <RefreshCw className="size-[26px]" strokeWidth={1.8} /> },
  { label: "Get cash from my home", href: "/apply/cash", icon: <Banknote className="size-[26px]" strokeWidth={1.8} /> },
];

/** A turn in the transcript. Brain answers carry the full compliance payload. */
type ChatTurn =
  | { role: "user"; text: string }
  | { role: "answer"; data: BrainAnswer }
  | { role: "error"; text: string };

/** Stable per-visitor id for the brain (persisted in sessionStorage). */
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

function AnswerBubble({ data }: { data: BrainAnswer }) {
  return (
    <div className="max-w-[82%] self-start rounded-2xl rounded-bl-[5px] bg-paper-2 px-4 py-3 text-left">
      <p className="whitespace-pre-wrap text-[15px] leading-normal text-ink">{data.answer}</p>

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

/** Homepage hero card. Defaults to Classic (3 intent buttons); the AI-mode toggle
 *  reveals the assistant backed by the Mortgage Brain (/api/v1/ai/ask). */
export function AiWidget({
  assistantName,
  shortName,
}: {
  assistantName: string;
  shortName: string;
}) {
  const [aiMode, setAiMode] = useState(false);
  const [convo, setConvo] = useState<ChatTurn[]>([]);
  const [typing, setTyping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [value, setValue] = useState("");
  const conversationIdRef = useRef<string | undefined>(undefined);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [convo, typing]);

  /** Send a question to the brain; render the verbatim answer. */
  const send = async (userText: string) => {
    const text = userText.trim();
    if (!text || busy) return;

    setConvo((c) => [...c, { role: "user", text }]);
    setValue("");
    setTyping(true);
    setBusy(true);

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
            if (m.role === "error") {
              return (
                <div
                  key={i}
                  className="max-w-[82%] self-start rounded-2xl rounded-bl-[5px] bg-paper-2 px-4 py-3 text-[15px] leading-normal text-ink"
                >
                  {m.text}{" "}
                  <Link href="/loan-officers" className="font-semibold text-green-700 underline-offset-2 hover:underline">
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
            <span className="size-[30px] shrink-0">
              <Mark size={30} label={shortName} />
            </span>
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
          <div className="flex flex-wrap gap-2.5 px-4 pb-2.5">
            {AI_PILLS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => void send(PILL_PROMPTS[p] ?? p)}
                disabled={busy}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-white px-4 text-[14.5px] font-semibold text-ink transition-[border-color,background,transform] duration-150 hover:-translate-y-px hover:border-spring hover:bg-spring-soft disabled:opacity-60"
              >
                {PILL_ICONS[p]} {p}
              </button>
            ))}
          </div>
          {/* Recording / privacy disclosure + always-visible human handoff. */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-3.5 pt-1">
            <p className="text-[12px] leading-snug text-[#6b756d]">
              {assistantName} can make mistakes and may be recorded for quality &amp; compliance. Not a
              commitment to lend.
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
        <div className="flex flex-col gap-3 p-2">
          {INTENTS.map((it) => (
            <Link
              key={it.label}
              href={it.href}
              className="press-3d flex h-16 items-center gap-3.5 rounded-lg bg-spring px-6 text-[18px] font-bold tracking-[-0.01em] text-[#04130c] hover:bg-spring-3"
            >
              <span className="flex w-[26px] justify-center">{it.icon}</span>
              {it.label}
            </Link>
          ))}
        </div>
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
