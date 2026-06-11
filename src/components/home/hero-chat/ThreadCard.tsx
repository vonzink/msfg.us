"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Thread } from "./threads";

/**
 * Deck card chrome: status dot, title, (inactive) first-message preview,
 * card number, and × close on the active card when >1 thread. The top row of
 * an INACTIVE card is a real button so threads are keyboard-operable.
 */
export function ThreadCard({
  thread,
  index,
  isActive,
  canClose,
  onActivate,
  onClose,
  children,
  className,
}: {
  thread: Thread;
  index: number;
  isActive: boolean;
  canClose: boolean;
  onActivate: () => void;
  onClose: () => void;
  children?: React.ReactNode;
  className?: string;
}) {
  const firstMsg = thread.msgs.find((m) => m.role === "user");
  const top = (
    <>
      <span
        className={cn("size-2 shrink-0 rounded-full", isActive ? "bg-mint" : "bg-[#c4cdc7]")}
        aria-hidden
      />
      <span className="shrink-0 whitespace-nowrap text-[15.5px] font-semibold text-ink">
        {thread.title}
      </span>
      {!isActive && firstMsg && (
        <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left text-[13.5px] text-muted">
          · {firstMsg.text}
        </span>
      )}
      <span className="ml-auto shrink-0 text-[13px] font-bold tracking-[0.04em] text-[#c0c9c3]">
        {String(index + 1).padStart(2, "0")}
      </span>
    </>
  );

  return (
    <div
      className={cn(
        "flex flex-col rounded-[24px] bg-white px-[18px] pb-4 pt-3.5 shadow-hero",
        className,
      )}
    >
      {isActive ? (
        <div className="flex items-center gap-2 border-b border-line pb-3">
          {top}
          {canClose && (
            <button
              type="button"
              aria-label={`Close thread: ${thread.title}`}
              onClick={onClose}
              className="ml-1 grid place-items-center rounded p-0.5 text-[#aab2ad] hover:text-ink"
            >
              <X className="size-[15px]" strokeWidth={2.2} />
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={onActivate}
          aria-label={`Switch to thread: ${thread.title}`}
          className="flex w-full cursor-pointer items-center gap-2 border-b border-line pb-3"
        >
          {top}
        </button>
      )}
      {isActive && <div className="min-h-0 flex-1 pt-3">{children}</div>}
    </div>
  );
}
