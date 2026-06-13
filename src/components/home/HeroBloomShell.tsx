"use client";

import { useCallback, useState } from "react";
import { cn } from "@/lib/cn";
import { HeroChat } from "@/components/home/hero-chat/HeroChat";

/**
 * Client shell connecting the chat's bloom state to the hero collapse.
 * The logo mark AND the headline arrive/collapse together: both carry
 * `.hero-fade` and gain `.is-bloomed` on the first question, so the chat deck
 * grows up over the space they vacated and the bloomed page is essentially
 * just the chat (with the active card's own header on top). On bloom we scroll
 * to the top so the now-tall deck sits right under the nav.
 */
export function HeroBloomShell({
  headline,
  logoSrc,
  logoAlt,
  assistantName,
  shortName,
  iconSrc,
}: {
  headline: React.ReactNode;
  logoSrc: string;
  logoAlt: string;
  assistantName: string;
  shortName: string;
  iconSrc: string;
}) {
  const [bloomed, setBloomed] = useState(false);

  const onBloom = useCallback((next: boolean) => {
    setBloomed(next);
    if (next) {
      // The logo + headline collapse and the deck mounts tall; pin the page to
      // the top so the card's header sits right under the nav. Run after the
      // bloom layout commits (double rAF) and scroll instantly — a smooth
      // scroll fights the collapse transition and lands partway.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" })),
      );
    }
  }, []);

  return (
    <>
      <div
        className={cn("hero-fade flex flex-col items-center", bloomed && "is-bloomed")}
        aria-hidden={bloomed}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoSrc} alt={logoAlt} className="logo-breath mb-2 h-[116px] w-auto" />
      </div>
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
    </>
  );
}
