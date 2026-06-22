"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, CalendarDays } from "lucide-react";
import { APP_URL } from "@/lib/auth/appLink";
import type { Intent } from "@/content/flows";
import type { LeadContact } from "@/lib/leads";

/**
 * Two-door finish: "Continue in the app" (passwordless hand-off via /continue?t=<token>)
 * and "Talk to a loan officer" (GHL calendar). Account recognition happens at the app,
 * never mid-funnel.
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
  calendarHref: string;
  /** Officer the user chose in the preceding step, if any (null = no preference). */
  officer?: { slug: string; name: string } | null;
}) {
  const fired = useRef(false);
  const [handoff, setHandoff] = useState<"idle" | "sending" | "done">("idle");
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    if (fired.current || !contact || !leadId) return;
    fired.current = true;
    setHandoff("sending");
    const controller = new AbortController();
    fetch("/api/v1/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: controller.signal,
      body: JSON.stringify({ leadId }),
    }).then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.handoffToken) setToken(String(d.handoffToken)); })
      .catch(() => {})
      .finally(() => setHandoff("done"));
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact, leadId]);

  const continueHref = token
    ? `${APP_URL}/continue?t=${encodeURIComponent(token)}`
    : APP_URL;
  const continueLabel = `Continue in the ${shortName} app`;
  // When an officer was chosen, route to their directory card; otherwise the
  // generic booking calendar (or the directory as a last resort).
  const officerFirst = officer?.name.split(" ")[0];
  const bookHref = officer ? `/loan-officers#${officer.slug}` : calendarHref || "/loan-officers";
  const bookLabel = officer ? `Connect with ${officerFirst}` : "Talk to a loan officer";

  return (
    <>
      {officer && (
        <div className="-mt-1 mb-6 space-y-1 text-[16px] text-muted">
          <p>
            You&apos;ll be working with <span className="font-semibold text-ink">{officer.name}</span>.
          </p>
        </div>
      )}

      <a
        href={continueHref}
        className="flex h-[66px] w-full items-center justify-center gap-2.5 rounded-lg bg-green-600 text-[18px] font-bold text-white [box-shadow:0_3px_0_#0a3a2a,var(--shadow-3d)] transition-[transform,background,box-shadow] duration-150 hover:-translate-y-0.5 hover:bg-green-700 hover:[box-shadow:0_5px_0_#0a3a2a,var(--shadow-pop)] active:translate-y-px"
      >
        {continueLabel}
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

      <div className="mt-4 min-h-[18px] text-[13px] text-muted" aria-live="polite">
        {handoff === "sending" && "Saving your application…"}
      </div>
    </>
  );
}
