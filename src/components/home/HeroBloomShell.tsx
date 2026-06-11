"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { HeroChat } from "@/components/home/hero-chat/HeroChat";

/**
 * Client shell connecting the chat's bloom state to the headline collapse.
 * The headline arrives server-rendered as a ReactNode; we only toggle the
 * `.is-bloomed` class (CSS transition — see globals.css `.hero-fade`).
 * The logo mark lives here too: it grows 25% (132px → 165px) while bloomed.
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
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logoSrc}
        alt={logoAlt}
        className={cn(
          "logo-breath mb-4 w-auto transition-[height] duration-500 ease-out",
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
        onBloom={setBloomed}
      />
    </>
  );
}
