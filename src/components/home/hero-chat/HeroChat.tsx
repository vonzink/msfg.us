"use client";

import { useEffect, useState } from "react";
import { Convo } from "./Convo";
import { Deck } from "./Deck";
import { RestingCard } from "./RestingCard";
import { useThreads } from "./useThreads";

/**
 * Hero chat orchestrator. Resting (no threads): the familiar single card
 * (AI mode on → big input; off → IntentTabs). First question blooms into the
 * fanned deck of up to 5 threads and reports the bloom up so the hero shell
 * can collapse the headline. There is no toggle while bloomed (user decision).
 */
export function HeroChat({
  assistantName,
  shortName,
  iconSrc,
  onBloom,
}: {
  assistantName: string;
  shortName: string;
  iconSrc: string;
  onBloom: (bloomed: boolean) => void;
}) {
  const T = useThreads();
  const [aiMode, setAiMode] = useState(true);

  useEffect(() => {
    onBloom(T.bloomed);
  }, [T.bloomed, onBloom]);

  if (!T.bloomed) {
    return (
      <RestingCard
        assistantName={assistantName}
        shortName={shortName}
        iconSrc={iconSrc}
        aiMode={aiMode}
        onAiMode={setAiMode}
        onLaunch={T.launch}
      />
    );
  }

  return (
    <Deck
      threads={T.threads}
      activeId={T.activeId}
      onActivate={T.setActiveId}
      onClose={T.close}
      onAdd={T.add}
      renderConvo={(t, composerRef) => (
        <Convo
          thread={t}
          iconSrc={iconSrc}
          shortName={shortName}
          assistantName={assistantName}
          composerRef={composerRef}
          onDraft={(v) => T.setDraft(t.id, v)}
          onSend={() => T.sendIn(t.id)}
        />
      )}
    />
  );
}
