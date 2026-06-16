"use client";

import { useEffect, useRef, type RefObject } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Convo } from "@/components/home/hero-chat/Convo";
import { stepHelpPrompt } from "@/content/applyChatStarters";
import { useApplyChat } from "./useApplyChat";

/** In-application Ask-AI panel: right drawer on desktop (≥981px), full-screen
 *  sheet on mobile. Single-thread chat against the same RAG brain as the hero.
 *  Mounted persistently by the Wizard so the conversation survives step
 *  navigation and close/reopen. */
export function ApplyChatPanel({
  open,
  onClose,
  starters,
  assistantName,
  shortName,
  iconSrc,
  stepQuestion,
  seedQuestion,
  returnFocusRef,
}: {
  open: boolean;
  onClose: () => void;
  starters: string[];
  assistantName: string;
  shortName: string;
  iconSrc: string;
  stepQuestion?: string;
  seedQuestion?: string;
  returnFocusRef?: RefObject<HTMLButtonElement | null>;
}) {
  const chat = useApplyChat();
  const panelRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  // Escape closes; Tab cycles focus within the dialog (lightweight focus trap).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "Tab" && panelRef.current) {
        const f = panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, [tabindex]:not([tabindex="-1"])',
        );
        if (f.length === 0) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Focus the composer on open; return focus to the trigger button on close.
  useEffect(() => {
    if (open) composerRef.current?.focus();
    else returnFocusRef?.current?.focus();
  }, [open, returnFocusRef]);

  // Auto-send a seed question when the panel opens from a help link (empty thread only).
  const sentSeed = useRef(false);
  useEffect(() => {
    if (!open) {
      sentSeed.current = false;
      return;
    }
    if (seedQuestion && !sentSeed.current && chat.thread.msgs.length === 0) {
      sentSeed.current = true;
      chat.send(seedQuestion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire on open/seed change; chat.send is stable, the empty-thread + sentSeed guards prevent re-sends
  }, [open, seedQuestion]);

  const chipClass =
    "rounded-full border border-line bg-white px-3 py-1.5 text-[13.5px] font-semibold text-green-700 transition-colors hover:bg-paper-2";

  const emptyState = (
    <div className="flex flex-1 flex-col justify-end gap-3 pb-2">
      <p className="text-[14.5px] font-medium text-muted">
        Hi! Ask {assistantName} anything about your application or mortgages — your answers stay private.
      </p>
      <div className="flex flex-wrap gap-2">
        {starters.map((s) => (
          <button key={s} type="button" onClick={() => chat.send(s)} className={chipClass}>
            {s}
          </button>
        ))}
        {stepQuestion && (
          <button type="button" onClick={() => chat.send(stepHelpPrompt(stepQuestion))} className={chipClass}>
            Help me with this step
          </button>
        )}
      </div>
    </div>
  );

  return (
    <>
      <div
        aria-hidden
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-40 bg-ink/30 transition-opacity duration-200 motion-reduce:transition-none",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        inert={!open}
        aria-label={`Ask ${assistantName}`}
        className={cn(
          "fixed z-50 flex flex-col bg-paper shadow-pop transition-transform duration-200 ease-out motion-reduce:transition-none",
          "inset-0 min-[981px]:inset-y-0 min-[981px]:left-auto min-[981px]:right-0 min-[981px]:w-[380px]",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        <header className="flex items-center gap-2.5 border-b border-line px-4 py-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={iconSrc} alt="" aria-hidden className="size-7 rounded object-cover object-left" />
          <span className="text-[15px] font-bold text-ink">Ask {assistantName}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto flex size-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-paper-2"
          >
            <X className="size-5" strokeWidth={1.8} />
          </button>
        </header>
        <div className="flex min-h-0 flex-1 flex-col px-4 py-3">
          <Convo
            thread={chat.thread}
            iconSrc={iconSrc}
            shortName={shortName}
            assistantName={assistantName}
            composerRef={composerRef}
            onDraft={chat.setDraft}
            onSend={() => chat.send(chat.thread.draft)}
            emptyState={emptyState}
          />
        </div>
      </div>
    </>
  );
}
