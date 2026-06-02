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
import {
  AI_PILLS,
  AI_SCRIPT,
  DEFAULT_REPLY,
  type AiReply,
} from "@/content/ai-script";

const PILL_ICONS: Record<string, React.ReactNode> = {
  "Start my pre-approval": <ArrowRight className="size-[18px]" strokeWidth={1.8} />,
  "Lower my rate": <RefreshCw className="size-[18px]" strokeWidth={1.8} />,
  "Start saving": <PiggyBank className="size-[18px]" strokeWidth={1.8} />,
  "Get cash": <Banknote className="size-[18px]" strokeWidth={1.8} />,
};

const INTENTS = [
  { label: "Buy a home", href: "/apply/buy", icon: <Home className="size-[26px]" strokeWidth={1.8} /> },
  { label: "Refinance my mortgage", href: "/apply/refi", icon: <RefreshCw className="size-[26px]" strokeWidth={1.8} /> },
  { label: "Get cash from my home", href: "/apply/cash", icon: <Banknote className="size-[26px]" strokeWidth={1.8} /> },
];

/** Homepage hero card. Defaults to Classic (3 intent buttons); the AI-mode
 *  toggle reveals the assistant input + scripted chat. */
export function AiWidget() {
  const [aiMode, setAiMode] = useState(false);
  const [convo, setConvo] = useState<Array<{ user: string } | { ai: AiReply }>>(
    [],
  );
  const [typing, setTyping] = useState(false);
  const [value, setValue] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current)
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [convo, typing]);

  const ask = (key: string, customUser?: string) => {
    const entry = AI_SCRIPT[key];
    const userMsg = customUser ?? entry?.user ?? key;
    const reply = entry?.reply ?? DEFAULT_REPLY;
    setConvo((c) => [...c, { user: userMsg }]);
    setValue("");
    setTyping(true);
    window.setTimeout(() => {
      setTyping(false);
      setConvo((c) => [...c, { ai: reply }]);
    }, 1100);
  };

  const onSend = () => {
    if (value.trim()) ask("Start my pre-approval", value.trim());
  };

  return (
    <div className="mx-auto mt-7 w-full max-w-[760px] overflow-hidden rounded-xl bg-white text-ink shadow-hero">
      {aiMode && convo.length > 0 && (
        <div
          ref={scrollRef}
          className="flex max-h-[360px] flex-col gap-3.5 overflow-y-auto p-[18px] text-left"
        >
          {convo.map((m, i) =>
            "user" in m ? (
              <div
                key={i}
                className="max-w-[82%] self-end rounded-2xl rounded-br-[5px] bg-green-700 px-4 py-3 text-[15px] leading-normal text-white"
              >
                {m.user}
              </div>
            ) : (
              <div
                key={i}
                className="max-w-[82%] self-start rounded-2xl rounded-bl-[5px] bg-paper-2 px-4 py-3 text-[15px] leading-normal text-ink"
              >
                {m.ai.lead}
                {m.ai.bullets && (
                  <ul className="mt-2 list-disc pl-[18px]">
                    {m.ai.bullets.map((b) => (
                      <li key={b} className="my-1">
                        {b}
                      </li>
                    ))}
                  </ul>
                )}
                {m.ai.tail && <p className="mt-2">{m.ai.tail}</p>}
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
              <Mark size={30} />
            </span>
            <input
              className="min-w-0 flex-1 border-0 bg-transparent text-[18px] text-ink outline-none placeholder:text-[#9aa39c]"
              placeholder="Ask me anything, or tell me what you want to do"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSend()}
              aria-label="Ask MSFG AI"
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
              className={cn(
                "flex size-[38px] shrink-0 items-center justify-center rounded-full transition-colors",
                value.trim()
                  ? "bg-spring text-[#04130c]"
                  : "bg-paper-2 text-[#9aa39c]",
              )}
            >
              <ArrowUp className="size-[18px]" strokeWidth={2} />
            </button>
          </div>
          <div className="flex flex-wrap gap-2.5 px-4 pb-3.5">
            {AI_PILLS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => ask(p)}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-white px-4 text-[14.5px] font-semibold text-ink transition-[border-color,background,transform] duration-150 hover:-translate-y-px hover:border-spring hover:bg-spring-soft"
              >
                {PILL_ICONS[p]} {p}
              </button>
            ))}
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
