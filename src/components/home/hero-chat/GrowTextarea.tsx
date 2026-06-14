"use client";

import { useEffect, useRef, type RefObject } from "react";
import { cn } from "@/lib/cn";

/**
 * Auto-growing, wrapping textarea for the hero chat composers. Replaces the
 * single-line `<input>` so a long question wraps and stays fully visible as
 * the user types. Grows with content up to `max-h` (then scrolls). Enter
 * submits; Shift+Enter inserts a newline.
 */
export function GrowTextarea({
  value,
  onChange,
  onSubmit,
  placeholder,
  ariaLabel,
  className,
  autoFocus,
  inputRef,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  autoFocus?: boolean;
  /** Optional external ref (the deck focuses the active composer). */
  inputRef?: RefObject<HTMLTextAreaElement | null>;
}) {
  const innerRef = useRef<HTMLTextAreaElement>(null);
  const ref = inputRef ?? innerRef;

  // Resize to fit content (capped by max-height via the class → then scrolls).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value, ref]);

  return (
    <textarea
      ref={ref}
      rows={1}
      autoFocus={autoFocus}
      value={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          onSubmit();
        }
      }}
      className={cn(
        "block w-full resize-none border-0 bg-transparent outline-none [overflow-wrap:anywhere] placeholder:text-[#9aa39c]",
        className,
      )}
    />
  );
}
