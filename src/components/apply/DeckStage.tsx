"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Wraps the active wizard step and animates step changes with the hero deck's
 * motion: the incoming step springs forward while the previous step briefly
 * recedes/peeks behind. Linear + focused — only the active step is interactive;
 * the receding ghost is aria-hidden and pointer-events-none, and is unmounted
 * once the transition ends. `stepKey` identifies the active step (its index);
 * `direction` is +1 forward / -1 back.
 */
export function DeckStage({
  stepKey,
  direction,
  children,
}: {
  stepKey: number;
  direction: 1 | -1;
  children: React.ReactNode;
}) {
  const [current, setCurrent] = useState<{ key: number; node: React.ReactNode }>({ key: stepKey, node: children });
  const [ghost, setGhost] = useState<{ key: number; node: React.ReactNode } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (stepKey === current.key) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCurrent((c) => ({ key: c.key, node: children }));
      return;
    }
    setGhost(current);
    setCurrent({ key: stepKey, node: children });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setGhost(null), 520);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepKey, children]);

  useEffect(() => {
    const t = timer;
    return () => { if (t.current) clearTimeout(t.current); };
  }, []);

  const enter = direction === 1 ? "deck-enter-fwd" : "deck-enter-back";
  const exit = direction === 1 ? "deck-exit-fwd" : "deck-exit-back";

  return (
    <div className="relative w-full">
      {ghost && (
        <div key={`ghost-${ghost.key}`} className={`absolute inset-0 ${exit}`} aria-hidden>
          <div className="pointer-events-none">{ghost.node}</div>
        </div>
      )}
      <div key={`cur-${current.key}`} className={enter}>
        {current.node}
      </div>
    </div>
  );
}
