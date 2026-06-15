"use client";

import { useRef, useState } from "react";
import { Mark } from "@/components/ui/Mark";
import { ApplyChatPanel } from "@/components/apply/ask-ai/ApplyChatPanel";

/** Floating "Ask AI" button + single-thread chat panel for any marketing page.
 *  Reuses ApplyChatPanel (→ /api/v1/ai/chat). `starters` are the page-specific
 *  suggestion chips. */
export function AskAiLauncher({
  starters,
  assistantName,
  shortName,
  iconSrc,
}: {
  starters: string[];
  assistantName: string;
  shortName: string;
  iconSrc: string;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Ask ${assistantName}`}
        className="fixed bottom-6 right-6 z-40 flex h-14 items-center gap-2.5 rounded-full bg-green-800 py-0 pl-2.5 pr-5 text-[15px] font-bold text-white shadow-pop transition-transform duration-150 hover:-translate-y-0.5"
      >
        <Mark size={36} label={shortName} /> Ask AI
      </button>
      <ApplyChatPanel
        open={open}
        onClose={() => setOpen(false)}
        starters={starters}
        assistantName={assistantName}
        shortName={shortName}
        iconSrc={iconSrc}
        returnFocusRef={btnRef}
      />
    </>
  );
}
