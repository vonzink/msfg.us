"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Banknote, Home, RefreshCw } from "lucide-react";
import { cn } from "@/lib/cn";

type Intent = {
  tab: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
};

const INTENTS: Intent[] = [
  { tab: "Buy a home", label: "Buy a home", href: "/apply/buy", icon: Home },
  { tab: "Refinance", label: "Refinance my mortgage", href: "/apply/refi", icon: RefreshCw },
  { tab: "Get cash", label: "Get cash from my home", href: "/apply/cash", icon: Banknote },
];

/**
 * Folder-tab picker for the apply intents (the hero card's non-AI mode):
 * three tabs along the top; the selected intent renders as an outlined row
 * below — icon chip, full label, go button — fully clickable through to its
 * apply route. WAI-ARIA tablist semantics: roving tabindex + arrow keys.
 */
export function IntentTabs() {
  const [active, setActive] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const intent = INTENTS[active];
  const ActiveIcon = intent.icon;

  const onKeyDown = (e: React.KeyboardEvent) => {
    const last = INTENTS.length - 1;
    let next: number | null = null;
    if (e.key === "ArrowRight") next = active === last ? 0 : active + 1;
    else if (e.key === "ArrowLeft") next = active === 0 ? last : active - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    if (next !== null) {
      e.preventDefault();
      setActive(next);
      tabRefs.current[next]?.focus();
    }
  };

  return (
    <div className="p-2">
      <div
        role="tablist"
        aria-label="What do you want to do?"
        onKeyDown={onKeyDown}
        className="flex items-end gap-1.5 pl-4"
      >
        {INTENTS.map((it, i) => {
          const Icon = it.icon;
          const selected = i === active;
          return (
            <button
              key={it.tab}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`intent-tab-${i}`}
              aria-selected={selected}
              aria-controls="intent-panel"
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(i)}
              className={cn(
                "relative inline-flex items-center gap-1.5 whitespace-nowrap rounded-t-[10px] border-[1.5px] border-b-0 px-3.5 pb-2 pt-2 text-[13.5px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-spring max-[600px]:gap-1 max-[600px]:px-2.5 max-[600px]:text-[12.5px]",
                selected
                  ? "z-[2] -mb-[1.5px] border-spring bg-white pb-[9.5px] text-ink"
                  : "border-transparent bg-paper-2 text-muted hover:bg-line hover:text-ink",
              )}
            >
              <Icon className="size-[15px] shrink-0 max-[480px]:hidden" strokeWidth={2} />
              {it.tab}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id="intent-panel"
        aria-labelledby={`intent-tab-${active}`}
        className="relative z-[1]"
      >
        <Link
          href={intent.href}
          className="group flex items-center gap-3.5 rounded-xl border-[1.5px] border-spring bg-white p-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-spring"
        >
          <span className="flex size-[38px] shrink-0 items-center justify-center rounded-full bg-spring-soft text-green-700">
            <ActiveIcon className="size-[19px]" strokeWidth={1.8} />
          </span>
          <span className="flex-1 text-left text-[17px] font-bold tracking-[-0.01em] text-ink max-[600px]:text-[16px]">
            {intent.label}
          </span>
          <span className="flex size-[38px] shrink-0 items-center justify-center rounded-full bg-spring text-[#04130c] transition-colors group-hover:bg-spring-3">
            <ArrowRight className="size-[18px]" strokeWidth={2} />
          </span>
        </Link>
      </div>
    </div>
  );
}
