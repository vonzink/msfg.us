"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { APP_URL } from "@/lib/auth/appLink";
import { isHandoffTokenStale } from "./handoffStale";
import { track } from "@/lib/analytics";
import type { Intent } from "@/content/flows";
import type { LeadContact } from "@/lib/leads";

type OffRampOfficer = {
  slug: string;
  name: string;
  nmls: string;
  photo: string;
  email: string;
  phone: string;
} | null;

/**
 * Finish screen (Part 2 of the funnel pivot). Re-introduces a rendered screen
 * (partially reversing 90188bb): the hand-off token is minted on mount as a
 * PRE-WARM, but navigation happens on the Continue CLICK (TTL-aware re-mint),
 * not on mount. A quiet reveal-on-demand off-ramp (added in a later slice) lets
 * the borrower reach the chosen loan officer without leaving the screen.
 */
export function FinishStep({
  contact,
  leadId,
  shortName,
}: {
  intent?: Intent;
  contact: LeadContact | null;
  leadId: string | null;
  shortName: string;
  calendarHref?: string;
  officer?: OffRampOfficer;
}) {
  const fired = useRef(false);
  const mintedAtRef = useRef<number | null>(null);
  const reminting = useRef(false);
  const [token, setToken] = useState<string | null>(null);
  const [warmFailed, setWarmFailed] = useState(false);
  const [pending, setPending] = useState(false);
  const [fallback, setFallback] = useState(false);

  // PRE-WARM: mint the hand-off token once on mount (no navigation here).
  useEffect(() => {
    if (fired.current || !contact || !leadId) return;
    fired.current = true;
    const controller = new AbortController();
    fetch("/api/v1/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: controller.signal,
      body: JSON.stringify({ leadId }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.handoffToken) {
          mintedAtRef.current = Date.now();
          setToken(String(d.handoffToken));
        } else {
          setWarmFailed(true);
        }
      })
      .catch(() => setWarmFailed(true));
    return () => controller.abort();
  }, [contact, leadId]);

  // finish_view: rendered finish screen mounted.
  useEffect(() => {
    track("finish_view");
  }, []);

  function navigateWith(t: string) {
    window.location.href = `${APP_URL}/continue?t=${encodeURIComponent(t)}`;
  }

  async function remint(): Promise<string | null> {
    if (!leadId) return null;
    const res = await fetch("/api/v1/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ leadId }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    return res?.handoffToken ? String(res.handoffToken) : null;
  }

  async function onContinue() {
    const warmed = token !== null;
    const stale = isHandoffTokenStale(mintedAtRef.current, Date.now());

    if (token && !stale) {
      track("continue_click", { warmed: true, remintRequired: false });
      navigateWith(token);
      return;
    }

    // Stale or never-warmed → click-time re-mint with a pending/disabled state.
    track("continue_click", { warmed, remintRequired: true });
    if (reminting.current) return;
    reminting.current = true;
    setPending(true);
    const fresh = await remint();
    reminting.current = false;
    if (fresh) {
      mintedAtRef.current = Date.now();
      navigateWith(fresh);
      return;
    }
    // Both warm and click-time mint failed → stay on screen, show fallback.
    setPending(false);
    setFallback(true);
    track("continue_fallback_shown");
  }

  return (
    <>
      <h1 className="mb-2 text-pretty text-[clamp(26px,3.6vw,38px)] font-extrabold leading-[1.08] tracking-[-0.03em] [text-wrap:balance]">
        You&rsquo;re all set — finish your application
      </h1>
      <p className="mb-6 text-[16px] text-muted">
        Pick up right where you left off in the {shortName} app.
      </p>

      {fallback ? (
        <a
          href={APP_URL}
          className="flex h-[66px] w-full items-center justify-center gap-2.5 rounded-lg bg-green-600 text-[18px] font-bold text-white [box-shadow:0_3px_0_#0a3a2a,var(--shadow-3d)] transition-[transform,background,box-shadow] duration-150 hover:-translate-y-0.5 hover:bg-green-700 hover:[box-shadow:0_5px_0_#0a3a2a,var(--shadow-pop)] active:translate-y-px"
        >
          Continue in the {shortName} app
          <ArrowRight className="size-5" strokeWidth={2.2} aria-hidden="true" />
        </a>
      ) : (
        <button
          type="button"
          onClick={onContinue}
          disabled={pending}
          className="flex h-[66px] w-full items-center justify-center gap-2.5 rounded-lg bg-green-600 text-[18px] font-bold text-white [box-shadow:0_3px_0_#0a3a2a,var(--shadow-3d)] transition-[transform,background,box-shadow] duration-150 hover:-translate-y-0.5 hover:bg-green-700 hover:[box-shadow:0_5px_0_#0a3a2a,var(--shadow-pop)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-70"
        >
          {pending ? "Setting up…" : "Continue your application"}
          {!pending && <ArrowRight className="size-5" strokeWidth={2.2} aria-hidden="true" />}
        </button>
      )}

      <p className="sr-only" aria-live="polite">
        {pending ? "Setting up your application, one moment." : ""}
      </p>

      {warmFailed && !fallback && (
        <p className="mt-3 text-center text-[13px] text-muted">
          Taking a moment longer than usual — tap Continue to retry.
        </p>
      )}
    </>
  );
}
