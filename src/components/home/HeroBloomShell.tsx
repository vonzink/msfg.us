"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { HeroChat } from "@/components/home/hero-chat/HeroChat";

/**
 * Client shell connecting the chat's bloom state to the headline collapse.
 * The headline arrives server-rendered as a ReactNode; we only toggle the
 * `.is-bloomed` class (CSS transition — see globals.css `.hero-fade`).
 */
export function HeroBloomShell({
  headline,
  assistantName,
  shortName,
  iconSrc,
}: {
  headline: React.ReactNode;
  assistantName: string;
  shortName: string;
  iconSrc: string;
}) {
  const [bloomed, setBloomed] = useState(false);
  return (
    <>
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
