"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, CalendarDays } from "lucide-react";
import { APP_URL } from "@/lib/auth/appLink";
import type { Intent } from "@/content/flows";
import type { LeadContact } from "@/lib/leads";

/**
 * Finish: mint the hand-off token and send the borrower STRAIGHT to the app's
 * /continue (account) page — no intermediate "You're all set / what's next" screen
 * (owner request 2026-06-25). Passwordless sign-in + account recognition happen on
 * /continue, where the email pre-fills and "email me a code" is the default.
 *
 * Only if the token mint fails do we render a manual fallback (continue + talk to an
 * officer) so the borrower is never stranded.
 */
export function FinishStep({
  contact,
  leadId,
  shortName,
  calendarHref,
  officer,
}: {
  intent?: Intent;
  contact: LeadContact | null;
  leadId: string | null;
  shortName: string;
  calendarHref?: string;
  /** Officer chosen in the preceding step, if any (used only on the failure fallback). */
  officer?: { slug: string; name: string; nmls: string; photo: string; email: string; phone: string } | null;
}) {
  const fired = useRef(false);
  const [token, setToken] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  // Mint the hand-off token once (loan is born at /continue, post-auth).
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
        if (d?.handoffToken) setToken(String(d.handoffToken));
        else setFailed(true);
      })
      .catch(() => setFailed(true));
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact, leadId]);

  // Auto-advance to the app's account page the moment the token is ready.
  useEffect(() => {
    if (token) {
      window.location.href = `${APP_URL}/continue?t=${encodeURIComponent(token)}`;
    }
  }, [token]);

  // Fallback — shown ONLY if the hand-off token couldn't be minted.
  if (failed) {
    const officerFirst = officer?.name.split(" ")[0];
    const bookHref = officer ? `/loan-officers#${officer.slug}` : calendarHref || "/loan-officers";
    const bookLabel = officer ? `Connect with ${officerFirst}` : "Talk to a loan officer";
    return (
      <>
        <p className="mb-5 text-[16px] text-muted">
          Your application is saved. Continue in the {shortName} app to finish.
        </p>
        <a
          href={APP_URL}
          className="flex h-[66px] w-full items-center justify-center gap-2.5 rounded-lg bg-green-600 text-[18px] font-bold text-white [box-shadow:0_3px_0_#0a3a2a,var(--shadow-3d)] transition-[transform,background,box-shadow] duration-150 hover:-translate-y-0.5 hover:bg-green-700 hover:[box-shadow:0_5px_0_#0a3a2a,var(--shadow-pop)] active:translate-y-px"
        >
          Continue in the {shortName} app
          <ArrowRight className="size-5" strokeWidth={2.2} aria-hidden="true" />
        </a>
        <div className="my-[18px] flex items-center gap-3.5 text-[13px] text-muted before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">
          or
        </div>
        <a
          href={bookHref}
          className="flex h-16 w-full items-center justify-center gap-2.5 rounded-lg border-[1.5px] border-line bg-white text-[16px] font-bold text-ink shadow-3d transition-colors duration-150 hover:bg-paper-2"
        >
          <CalendarDays className="size-5 text-green-600" strokeWidth={2} aria-hidden="true" />
          {bookLabel}
        </a>
      </>
    );
  }

  // Happy path: minting + redirecting (no "what's next" screen).
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center" aria-live="polite">
      <p className="text-[18px] font-semibold text-ink">Taking you to your application&hellip;</p>
      <p className="mt-2 text-[14px] text-muted">One moment while we set things up.</p>
    </div>
  );
}
