"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Banknote, Home, RefreshCw } from "lucide-react";
import { cn } from "@/lib/cn";

type Intent = { label: string; href: string; icon: React.ReactNode };

const INTENTS: Intent[] = [
  { label: "Buy a home", href: "/apply/buy", icon: <Home className="size-[26px]" strokeWidth={1.8} /> },
  { label: "Refinance my mortgage", href: "/apply/refi", icon: <RefreshCw className="size-[26px]" strokeWidth={1.8} /> },
  { label: "Get cash from my home", href: "/apply/cash", icon: <Banknote className="size-[26px]" strokeWidth={1.8} /> },
];

const CARD_H = 64; // px — matches the original h-16 CTA height
const INTERVAL_MS = 2800;

function IntentCard({ intent, tabIndex }: { intent: Intent; tabIndex?: number }) {
  return (
    <Link
      href={intent.href}
      tabIndex={tabIndex}
      className="press-3d flex h-16 items-center gap-3.5 rounded-lg bg-spring px-6 text-[18px] font-bold tracking-[-0.01em] text-[#04130c] hover:bg-spring-3"
    >
      <span className="flex w-[26px] justify-center">{intent.icon}</span>
      {intent.label}
    </Link>
  );
}

/**
 * "Price is Right" slot-reel for the apply intents: the three CTAs roll
 * vertically through a single slot, auto-advancing (~2.8s), each fully clickable.
 * Pauses on hover/focus; position dots let users jump. Falls back to a static
 * stack of all three when the user prefers reduced motion (a11y).
 */
export function IntentReel() {
  const [active, setActive] = useState(0);
  const [reduced, setReduced] = useState(false);
  const pausedRef = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => {
      if (!pausedRef.current) setActive((i) => (i + 1) % INTENTS.length);
    }, INTERVAL_MS);
    return () => clearInterval(id);
  }, [reduced]);

  // Reduced motion → static stack of all three (no animation).
  if (reduced) {
    return (
      <div className="flex flex-col gap-3 p-2">
        {INTENTS.map((it) => (
          <IntentCard key={it.label} intent={it} />
        ))}
      </div>
    );
  }

  return (
    <div className="p-2">
      <div
        className="relative overflow-hidden rounded-lg"
        style={{ height: CARD_H }}
        onMouseEnter={() => {
          pausedRef.current = true;
        }}
        onMouseLeave={() => {
          pausedRef.current = false;
        }}
        onFocusCapture={() => {
          pausedRef.current = true;
        }}
        onBlurCapture={() => {
          pausedRef.current = false;
        }}
      >
        <div
          className="transition-transform duration-500 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)]"
          style={{ transform: `translateY(-${active * CARD_H}px)` }}
        >
          {INTENTS.map((it, i) => (
            <div key={it.label} style={{ height: CARD_H }} aria-hidden={i !== active}>
              <IntentCard intent={it} tabIndex={i === active ? undefined : -1} />
            </div>
          ))}
        </div>
      </div>

      {/* Position dots (also let users jump to an intent). */}
      <div className="mt-2.5 flex items-center justify-center gap-2">
        {INTENTS.map((it, i) => (
          <button
            key={it.label}
            type="button"
            aria-label={`Show: ${it.label}`}
            aria-current={i === active}
            onClick={() => setActive(i)}
            className={cn(
              "h-2 rounded-full transition-all duration-300",
              i === active ? "w-6 bg-spring" : "w-2 bg-line hover:bg-[#c5cdc2]",
            )}
          />
        ))}
      </div>
    </div>
  );
}
