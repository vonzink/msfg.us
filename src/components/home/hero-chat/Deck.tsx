"use client";

import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { ThreadCard } from "./ThreadCard";
import { MAX_THREADS, type Thread } from "./threads";

/** Fan transform per design handoff: depth d from the active card, dir −1
 *  (before) / +1 (after). Active card carries the parallax CSS vars. */
function fanStyle(i: number, activePos: number): CSSProperties {
  const depth = Math.abs(i - activePos);
  if (depth === 0) {
    return {
      transform:
        "translateY(0) scale(1) rotate(0deg) perspective(1000px) rotateX(var(--tilt-x, 0deg)) rotateY(var(--tilt-y, 0deg))",
      zIndex: 30,
    };
  }
  const dir = i < activePos ? -1 : 1;
  return {
    transform: `translateY(${-(40 + (depth - 1) * 26)}px) translateX(${dir * depth * 5}px) scale(${1 - depth * 0.04}) rotate(${dir * (1.1 + depth * 0.45)}deg)`,
    zIndex: 22 - depth,
  };
}

/** matchMedia hook (mounted-gated to avoid hydration mismatch). */
function useMedia(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const apply = () => setMatches(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [query]);
  return matches;
}

/**
 * The bloomed deck: desktop = absolutely-positioned fan with parallax tilt
 * and spring re-fan; ≤980px = horizontal thread-tab row above one static
 * card. Footer: pips + live count, "Add a question" (< cap), LO link.
 */
export function Deck({
  threads,
  activeId,
  onActivate,
  onClose,
  onAdd,
  renderConvo,
}: {
  threads: Thread[];
  activeId: string | null;
  onActivate: (tid: string) => void;
  onClose: (tid: string) => void;
  onAdd: () => void;
  renderConvo: (t: Thread, composerRef: RefObject<HTMLInputElement | null>) => React.ReactNode;
}) {
  const narrow = useMedia("(max-width: 980px)");
  const reduced = useMedia("(prefers-reduced-motion: reduce)");
  const deckRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLInputElement>(null);
  const raf = useRef(0);

  const activePos = Math.max(
    0,
    threads.findIndex((t) => t.id === activeId),
  );
  const active = threads[activePos];

  // Focus the active card's composer whenever the front thread changes.
  useEffect(() => {
    composerRef.current?.focus();
  }, [activeId]);

  useEffect(() => {
    const r = raf;
    return () => cancelAnimationFrame(r.current);
  }, []);

  /** Parallax tilt via rAF + CSS vars — no React re-render per mousemove. */
  const onMove = (e: React.MouseEvent) => {
    if (reduced || narrow) return;
    const el = deckRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      el.style.setProperty("--tilt-x", `${py * -4}deg`);
      el.style.setProperty("--tilt-y", `${px * 5}deg`);
    });
  };
  const onLeave = () => {
    const el = deckRef.current;
    if (!el) return;
    el.style.setProperty("--tilt-x", "0deg");
    el.style.setProperty("--tilt-y", "0deg");
  };

  const footer = (
    <div className="mt-[18px] flex w-full flex-wrap items-center justify-center gap-[22px]">
      <span className="flex items-center gap-1.5">
        {threads.map((t) => (
          <span
            key={t.id}
            aria-hidden
            className={cn(
              "size-[7px] rounded-full transition-colors duration-300",
              t.id === activeId ? "bg-mint" : "bg-white/30",
            )}
          />
        ))}
        <span aria-live="polite" className="ml-1 text-[13px] font-medium text-on-dark-2">
          {threads.length}/{MAX_THREADS} threads
        </span>
      </span>
      {threads.length < MAX_THREADS && (
        <button
          type="button"
          onClick={onAdd}
          className="flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-2 text-[13.5px] font-semibold text-on-dark backdrop-blur-sm transition-colors hover:bg-white/20"
        >
          <Plus className="size-[16px]" strokeWidth={2.4} /> Add a question
        </button>
      )}
      <Link
        href="/loan-officers"
        className="text-[15px] font-semibold text-mint underline-offset-2 hover:underline"
      >
        Talk to a loan officer
      </Link>
    </div>
  );

  // ----- ≤980px: tab row + single static card --------------------------------
  if (narrow) {
    return (
      <div className="mx-auto mt-7 flex w-full flex-col items-center">
        <div className="flex w-full gap-2 overflow-x-auto pb-2.5" role="tablist" aria-label="Open questions">
          {threads.map((t) => (
            <button
              key={t.id}
              id={`hero-thread-tab-${t.id}`}
              type="button"
              role="tab"
              aria-selected={t.id === activeId}
              aria-controls="hero-thread-panel"
              onClick={() => onActivate(t.id)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-[13.5px] font-semibold transition-colors",
                t.id === activeId ? "bg-white text-ink" : "bg-white/10 text-on-dark",
              )}
            >
              <span
                aria-hidden
                className={cn("size-2 rounded-full", t.id === activeId ? "bg-mint" : "bg-white/40")}
              />
              {t.title}
            </button>
          ))}
        </div>
        {active && (
          <div
            role="tabpanel"
            id="hero-thread-panel"
            aria-labelledby={`hero-thread-tab-${active.id}`}
            className="w-full"
          >
            <ThreadCard
              thread={active}
              index={activePos}
              isActive
              canClose={threads.length > 1}
              onActivate={() => {}}
              onClose={() => onClose(active.id)}
              className="w-full [&>div:last-child]:max-h-[60vh]"
            >
              {renderConvo(active, composerRef)}
            </ThreadCard>
          </div>
        )}
        {footer}
      </div>
    );
  }

  // ----- Desktop: the fan -----------------------------------------------------
  return (
    <div className="relative z-30 mx-auto mt-7 flex w-full max-w-[720px] flex-col items-center">
      <div
        ref={deckRef}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        className="relative h-[810px] w-full"
      >
        {/* eslint-disable react-hooks/refs -- render-prop receives a forwarded ref (not a .current read) */}
        {threads.map((t, i) => {
          const isActive = t.id === activeId;
          return (
            <div
              key={t.id}
              style={fanStyle(i, activePos)}
              className={cn(
                "absolute inset-x-0 top-[70px] origin-bottom",
                !reduced && "transition-transform duration-[550ms] [transition-timing-function:cubic-bezier(0.18,0.9,0.2,1.05)]",
                !isActive && "cursor-pointer",
              )}
            >
              <ThreadCard
                thread={t}
                index={i}
                isActive={isActive}
                canClose={threads.length > 1}
                onActivate={() => onActivate(t.id)}
                onClose={() => onClose(t.id)}
                className={isActive ? "[&>div:last-child]:h-[580px]" : undefined}
              >
                {isActive && renderConvo(t, composerRef)}
              </ThreadCard>
            </div>
          );
        })}
        {/* eslint-enable react-hooks/refs */}
      </div>
      {footer}
    </div>
  );
}
