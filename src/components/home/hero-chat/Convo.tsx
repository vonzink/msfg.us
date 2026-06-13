"use client";

import { useEffect, useRef, type RefObject } from "react";
import Link from "next/link";
import { ArrowUp, Mic } from "lucide-react";
import { cn } from "@/lib/cn";
import { ChatMarkdown } from "@/components/ai/ChatMarkdown";
import { SourcesPanel } from "./SourcesPanel";
import { GrowTextarea } from "./GrowTextarea";
import type { Thread } from "./threads";

/**
 * The active card's conversation: scrolling message list, streaming dots +
 * mint caret, composer pill, and the recording/compliance disclosure.
 * Empty threads show the "fresh thread" prompt instead of a list.
 */
export function Convo({
  thread,
  iconSrc,
  shortName,
  assistantName,
  onDraft,
  onSend,
  composerRef,
}: {
  thread: Thread;
  iconSrc: string;
  shortName: string;
  assistantName: string;
  onDraft: (v: string) => void;
  onSend: () => void;
  composerRef?: RefObject<HTMLTextAreaElement | null>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [thread.msgs]);

  const lastMsg = thread.msgs[thread.msgs.length - 1];
  const thinking = thread.busy && (!lastMsg || lastMsg.role === "user");

  return (
    <div className="flex h-full min-h-0 flex-col">
      {thread.msgs.length === 0 ? (
        <div className="flex flex-1 flex-col justify-end gap-2 pb-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={iconSrc} alt={shortName} className="size-[34px] rounded-md object-cover object-left" />
          <p className="text-[14.5px] font-medium text-muted">
            Fresh thread — ask anything about this scenario.
          </p>
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="chat-scroll flex min-h-0 flex-1 flex-col gap-3 px-1 pb-2 pt-1 text-left"
        >
          {thread.msgs.map((m) => {
            if (m.role === "user") {
              return (
                <div
                  key={m.id}
                  className="max-w-[86%] self-end whitespace-pre-wrap [overflow-wrap:anywhere] rounded-2xl rounded-br-[5px] bg-green-700 px-3.5 py-2.5 text-[15px] leading-[1.42] text-white"
                >
                  {m.text}
                </div>
              );
            }
            if (m.role === "assistant") {
              return (
                <div key={m.id} className="flex items-start gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={iconSrc}
                    alt=""
                    aria-hidden
                    className="mt-1 size-5 shrink-0 rounded object-cover object-left"
                  />
                  <div className="max-w-[90%] [overflow-wrap:anywhere] rounded-2xl rounded-tl-[5px] bg-paper-2 px-3.5 py-2.5">
                    {m.text === "" && !m.done ? (
                      <span className="inline-flex gap-1">
                        <span className="typing-dot" />
                        <span className="typing-dot" />
                        <span className="typing-dot" />
                      </span>
                    ) : (
                      <>
                        <ChatMarkdown>{m.text}</ChatMarkdown>
                        {!m.done && <span className="stream-caret" aria-hidden />}
                      </>
                    )}
                    {m.sources && <SourcesPanel sources={m.sources} />}
                  </div>
                </div>
              );
            }
            return (
              <div
                key={m.id}
                className="max-w-[86%] self-start rounded-2xl rounded-tl-[5px] bg-paper-2 px-3.5 py-2.5 text-[15px] leading-normal text-ink"
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
          })}
          {thinking && (
            <div className="self-start rounded-2xl rounded-tl-[5px] bg-paper-2 px-3.5 py-2.5">
              <span className="inline-flex gap-1">
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
              </span>
            </div>
          )}
        </div>
      )}

      <form
        className="flex items-end gap-1.5 rounded-[15px] border border-line bg-white py-[7px] pl-3.5 pr-[5px]"
        onSubmit={(e) => {
          e.preventDefault();
          onSend();
        }}
      >
        <GrowTextarea
          inputRef={composerRef}
          value={thread.draft}
          onChange={onDraft}
          onSubmit={onSend}
          placeholder="Continue this thread…"
          ariaLabel={`Message ${assistantName} in ${thread.title}`}
          className="max-h-[30vh] flex-1 self-center overflow-y-auto text-[15px] leading-snug text-ink"
        />
        <button
          type="button"
          aria-label="Voice input"
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-[#6b756d] transition-colors hover:bg-paper-2"
        >
          <Mic className="size-[17px]" strokeWidth={1.8} />
        </button>
        <button
          type="submit"
          aria-label="Send"
          disabled={thread.busy}
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full transition-colors",
            thread.draft.trim() && !thread.busy
              ? "bg-green-700 text-white"
              : "bg-paper-2 text-[#9aa39c]",
          )}
        >
          <ArrowUp className="size-4" strokeWidth={2.2} />
        </button>
      </form>
      <p className="mt-1.5 text-[11px] leading-snug text-[#9aa39c]">
        {assistantName}
        {" can make mistakes and may be recorded for quality & compliance. Not a commitment to lend."}
      </p>
    </div>
  );
}
