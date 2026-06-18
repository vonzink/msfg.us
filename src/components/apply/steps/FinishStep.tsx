"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, CalendarDays, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth/useAuth";
import { APP_URL } from "@/lib/auth/appLink";
import { AccountPanel } from "./AccountPanel";
import { OfficerContactCard } from "./OfficerContactCard";
import type { Intent } from "@/content/flows";
import type { LeadContact } from "@/lib/leads";

/**
 * Two-door finish. Door 1 — continue the application: a signed-in borrower
 * triggers the LOS hand-off and deep-links into the app; a new / anonymous
 * borrower gets the inline branded AccountPanel (create account or sign in)
 * right here — no redirect to the AWS Hosted UI. Door 2 — reach the chosen
 * loan officer directly (Call / Text / Email), or book time when none was
 * picked. Account recognition happens here, never mid-funnel.
 */
export function FinishStep({
  contact,
  leadId,
  shortName,
  calendarHref,
  officer,
}: {
  intent: Intent;
  contact: LeadContact | null;
  leadId: string | null;
  shortName: string;
  calendarHref: string;
  /** Officer the user chose in the preceding step, if any (null = no preference). */
  officer?: {
    slug: string;
    name: string;
    nmls: string;
    photo: string;
    email: string;
    phone: string;
  } | null;
}) {
  const auth = useAuth();
  const fired = useRef(false);
  const [handoff, setHandoff] = useState<"idle" | "sending" | "done">("idle");
  const [appId, setAppId] = useState<string | null>(null);

  useEffect(() => {
    if (fired.current || auth.loading || !auth.configured || !auth.authenticated || !contact) return;
    fired.current = true;
    setHandoff("sending");
    const controller = new AbortController();
    fetch("/api/v1/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
      body: JSON.stringify({ leadId: leadId ?? undefined }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.applicationId) setAppId(String(d.applicationId));
      })
      .catch(() => {})
      .finally(() => setHandoff("done"));
    return () => controller.abort();
    // Fire exactly once when auth resolves to authenticated — including after
    // an inline sign-in via AccountPanel → auth.refresh(). Body is just
    // { leadId }; the server rebuilds the application from the persisted lead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.loading, auth.configured, auth.authenticated, contact]);

  // Show the inline branded auth panel only when auth is wired AND the user is
  // signed out AND we have funnel contact (the panel pre-fills + locks email).
  const showAccountPanel = auth.configured && !auth.authenticated && !!contact;

  const continueHref = appId ? `${APP_URL}/applications/${appId}` : APP_URL;
  const continueLabel = `Continue in the ${shortName} app`;

  if (auth.loading) {
    return (
      <div className="flex min-h-[160px] items-center justify-center text-muted" role="status" aria-live="polite">
        <Loader2 className="size-6 animate-spin" aria-hidden="true" />
        <span className="sr-only">Loading…</span>
      </div>
    );
  }

  return (
    <>
      {(officer || (auth.authenticated && auth.user?.email)) && (
        <div className="-mt-1 mb-6 space-y-1 text-[16px] text-muted">
          {officer && (
            <p>
              You&apos;ll be working with <span className="font-semibold text-ink">{officer.name}</span>.
            </p>
          )}
          {auth.authenticated && auth.user?.email && (
            <p>
              Welcome back, <span className="font-semibold text-ink">{auth.user.email}</span> — pick up right where you
              left off.
            </p>
          )}
        </div>
      )}

      {showAccountPanel ? (
        <AccountPanel
          initialEmail={contact?.email ?? ""}
          initialFirstName={contact?.firstName}
          initialLastName={contact?.lastName}
          onAuthed={() => auth.refresh()}
        />
      ) : (
        <a
          href={continueHref}
          className="flex h-[66px] w-full items-center justify-center gap-2.5 rounded-lg bg-green-600 text-[18px] font-bold text-white [box-shadow:0_3px_0_#0a3a2a,var(--shadow-3d)] transition-[transform,background,box-shadow] duration-150 hover:-translate-y-0.5 hover:bg-green-700 hover:[box-shadow:0_5px_0_#0a3a2a,var(--shadow-pop)] active:translate-y-px"
        >
          {continueLabel}
          <ArrowRight className="size-5" strokeWidth={2.2} aria-hidden="true" />
        </a>
      )}

      <div className="my-[18px] flex items-center gap-3.5 text-[13px] text-muted before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">
        or
      </div>

      {officer ? (
        <OfficerContactCard officer={officer} />
      ) : (
        <a
          href={calendarHref || "/loan-officers"}
          className="flex h-16 w-full items-center justify-center gap-2.5 rounded-lg border-[1.5px] border-line bg-white text-[16px] font-bold text-ink shadow-3d transition-colors duration-150 hover:bg-paper-2"
        >
          <CalendarDays className="size-5 text-green-600" strokeWidth={2} aria-hidden="true" />
          Talk to a loan officer
        </a>
      )}

      <div className="mt-4 min-h-[18px] text-[13px] text-muted" aria-live="polite">
        {handoff === "sending" && "Saving your application…"}
      </div>
    </>
  );
}
