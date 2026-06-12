"use client";

import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { HeroChat } from "@/components/home/hero-chat/HeroChat";

/**
 * Client shell connecting the chat's bloom state to the hero collapse.
 * The headline AND the stats row arrive server-rendered as ReactNodes; we
 * toggle the `.is-bloomed` class on both (CSS transition — see globals.css
 * `.hero-fade`) so the deck gets the vertical room. The logo mark lives here
 * too: it grows 25% (132px → 165px) while bloomed. On first bloom we scroll
 * the logo to just under the sticky nav so the whole story — logo, deck,
 * "Start an application" — sits in one viewport instead of the browser
 * snapping to the focused composer at the bottom.
 */
export function HeroBloomShell({
  headline,
  stats,
  logoSrc,
  logoAlt,
  assistantName,
  shortName,
  iconSrc,
}: {
  headline: React.ReactNode;
  stats: React.ReactNode;
  logoSrc: string;
  logoAlt: string;
  assistantName: string;
  shortName: string;
  iconSrc: string;
}) {
  const [bloomed, setBloomed] = useState(false);
  const logoRef = useRef<HTMLImageElement>(null);

  const onBloom = useCallback((next: boolean) => {
    setBloomed(next);
    if (next) {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      // Bring the whole hero into frame (smooth-scrolls alongside the collapse).
      logoRef.current?.scrollIntoView({
        behavior: reduced ? "auto" : "smooth",
        block: "start",
      });
    }
  }, []);

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={logoRef}
        src={logoSrc}
        alt={logoAlt}
        className={cn(
          "logo-breath mb-2 w-auto scroll-mt-[80px] transition-[height] duration-500 ease-out",
          bloomed ? "h-[165px]" : "h-[132px]",
        )}
      />
      <div
        className={cn("hero-fade flex w-full flex-col items-center", bloomed && "is-bloomed")}
        aria-hidden={bloomed}
      >
        {headline}
      </div>
      <HeroChat
        assistantName={assistantName}
        shortName={shortName}
        iconSrc={iconSrc}
        onBloom={onBloom}
      />
      <div
        className={cn("hero-fade flex w-full flex-col items-center", bloomed && "is-bloomed")}
        aria-hidden={bloomed}
      >
        {stats}
      </div>
    </>
  );
}
