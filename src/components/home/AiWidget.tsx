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

/** A turn in the live transcript. Assistant text streams in token-by-token. */
type ChatTurn =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string };

/** Wire format for one SSE event from /api/v1/ai/chat. */
type ChatEvent =
  | { type: "text"; value: string }
  | { type: "tool"; name: string }
  | { type: "session"; sessionId: string }
  | { type: "done" }
  | { type: "error" };

/** Homepage hero card. Defaults to Classic (3 intent buttons); the AI-mode
 *  toggle reveals a REAL streaming assistant backed by /api/v1/ai/chat. */
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
  const [streaming, setStreaming] = useState(false);
  const [value, setValue] = useState("");
  const sessionIdRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current)
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [convo, typing]);

  /** Send a user message, stream the assistant reply into the transcript. */
  const send = async (userText: string) => {
    const text = userText.trim();
    if (!text || streaming) return;

    // Build the full history (the API is stateless — send everything).
    const history = [
      ...convo.map((t) => ({ role: t.role, content: t.text })),
      { role: "user" as const, content: text },
    ];

    setConvo((c) => [...c, { role: "user", text }]);
    setValue("");
    setTyping(true);
    setStreaming(true);

    let assistantStarted = false;
    /** Append streamed text into the (last) assistant bubble. */
    const pushDelta = (delta: string) => {
      setConvo((c) => {
        if (!assistantStarted) return c; // guarded below
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
        body: JSON.stringify({
          sessionId: sessionIdRef.current ?? undefined,
          messages: history,
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`chat request failed: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const handle = (evt: ChatEvent) => {
        if (evt.type === "session") {
          sessionIdRef.current = evt.sessionId;
          return;
        }
        if (evt.type === "text") {
          // First token: drop the typing dots and open the assistant bubble.
          if (!assistantStarted) {
            assistantStarted = true;
            setTyping(false);
            setConvo((c) => [...c, { role: "assistant", text: "" }]);
          }
          pushDelta(evt.value);
        }
        // "tool", "done", "error" need no transcript mutation here.
      };

      // Parse the SSE byte stream line-by-line (data: {json}\n\n).
      for (;;) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        buffer += decoder.decode(chunk, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const line = frame.trim();
          if (!line.startsWith("data:")) continue;
          const json = line.slice(5).trim();
          if (!json) continue;
          try {
            handle(JSON.parse(json) as ChatEvent);
          } catch {
            // Ignore malformed frames; keep streaming.
          }
        }
      }
    } catch {
      setTyping(false);
      setConvo((c) => [
        ...c,
        {
          role: "assistant",
          text: "Sorry — I hit a problem reaching the assistant. Please try again, or talk to a loan officer.",
        },
      ]);
    } finally {
      setTyping(false);
      setStreaming(false);
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
          {convo.map((m, i) =>
            m.role === "user" ? (
              <div
                key={i}
                className="max-w-[82%] self-end rounded-2xl rounded-br-[5px] bg-green-700 px-4 py-3 text-[15px] leading-normal text-white"
              >
                {m.text}
              </div>
            ) : (
              <div
                key={i}
                className="max-w-[82%] self-start whitespace-pre-wrap rounded-2xl rounded-bl-[5px] bg-paper-2 px-4 py-3 text-[15px] leading-normal text-ink"
              >
                {m.text}
              </div>
            ),
          )}
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
              disabled={streaming}
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
              disabled={streaming}
              className={cn(
                "flex size-[38px] shrink-0 items-center justify-center rounded-full transition-colors",
                value.trim() && !streaming
                  ? "bg-spring text-[#04130c]"
                  : "bg-paper-2 text-[#9aa39c]",
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
                disabled={streaming}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-white px-4 text-[14.5px] font-semibold text-ink transition-[border-color,background,transform] duration-150 hover:-translate-y-px hover:border-spring hover:bg-spring-soft disabled:opacity-60"
              >
                {PILL_ICONS[p]} {p}
              </button>
            ))}
          </div>
          {/* Recording / privacy disclosure + always-visible human handoff. */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-3.5 pt-1">
            <p className="text-[12px] leading-snug text-[#6b756d]">
              {assistantName} can make mistakes and may be recorded for quality
              &amp; compliance. Not a commitment to lend.
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
