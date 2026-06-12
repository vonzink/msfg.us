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
          <p className="mx-auto mt-4 max-w-[560px] text-center text-[12px] leading-[1.45] text-[#9aa39c]">
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
