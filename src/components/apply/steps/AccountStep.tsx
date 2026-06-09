"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CheckCircle2, ArrowRight, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth/useAuth";
import { APP_URL } from "@/lib/auth/appLink";
import type { Intent } from "@/content/flows";
import type { LeadContact } from "@/lib/leads";

/**
 * Final "account" step.
 *
 * Two modes, chosen at runtime by whether Cognito SSO is configured (reported
 * by `GET /api/v1/auth/me` → `configured`):
 *
 *  • CONFIGURED → real auth. If signed out, offer "Create account / Sign in"
 *    which routes to `/auth/login?returnTo=/apply/<intent>` (Hosted UI). If
 *    already signed in, show the signed-in email, fire the best-effort LOS
 *    hand-off, and surface a "Continue in the <brand> app" deep link (shared
 *    Cognito session → silent SSO at the tenant app, e.g. app.msfgco.com).
 *
 *  • NOT CONFIGURED → the original UI mock is preserved verbatim, so the site
 *    builds/runs and the apply flow is unbroken with no auth set up.
 */
export function AccountStep({
  intent,
  contact,
  answers,
  location,
  leadId,
  shortName,
}: {
  intent: Intent;
  contact: LeadContact | null;
  answers: Record<number, string>;
  location?: string;
  leadId: string | null;
  /** Tenant brand short name — names the companion app in the LOS deep link. */
  shortName: string;
}) {
  const auth = useAuth();

  // While the session probe is in flight, show a neutral spinner so we never
  // flash the wrong UI (mock vs. real).
  if (auth.loading) {
    return (
      <div
        className="flex min-h-[160px] items-center justify-center text-muted"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="size-6 animate-spin" aria-hidden="true" />
        <span className="sr-only">Checking your sign-in status…</span>
      </div>
    );
  }

  if (!auth.configured) {
    return <AccountMock />;
  }

  if (auth.authenticated) {
    return (
      <SignedIn
        email={auth.user?.email}
        intent={intent}
        contact={contact}
        answers={answers}
        location={location}
        leadId={leadId}
        shortName={shortName}
      />
    );
  }

  return <SignInPrompt intent={intent} />;
}

/** Configured + signed-out: route to the Cognito Hosted UI. */
function SignInPrompt({ intent }: { intent: Intent }) {
  // returnTo is a same-origin relative path (validated again server-side).
  const returnTo = `/apply/${intent}`;
  const loginHref = `/auth/login?returnTo=${encodeURIComponent(returnTo)}`;

  return (
    <>
      <p className="-mt-0.5 mb-7 text-[16px] text-muted">
        Create your secure account (or sign in) to save your progress and finish
        your application.
      </p>

      <a
        href={loginHref}
        className="mt-2 flex h-[66px] w-full items-center justify-center rounded-lg bg-green-600 text-[18px] font-bold text-white transition-[transform,background,box-shadow] duration-150 [box-shadow:0_3px_0_#0a3a2a,var(--shadow-3d)] hover:-translate-y-0.5 hover:bg-green-700 hover:[box-shadow:0_5px_0_#0a3a2a,var(--shadow-pop)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-spring-3 active:translate-y-px"
      >
        Create account or sign in
      </a>

      <p className="mt-4 text-[13px] leading-relaxed text-muted">
        You&apos;ll sign in with Mountain State Financial Group&apos;s secure
        login. Your information is encrypted in transit.
      </p>
    </>
  );
}

/**
 * Configured + signed-in: confirm identity, fire the LOS hand-off once, then
 * show the deep link into the tenant app. The hand-off is best-effort — the CTA
 * appears regardless of its outcome (the shared Cognito session is what lets
 * the app pick the user up).
 */
function SignedIn({
  email,
  intent,
  contact,
  answers,
  location,
  leadId,
  shortName,
}: {
  email?: string;
  intent: Intent;
  contact: LeadContact | null;
  answers: Record<number, string>;
  location?: string;
  leadId: string | null;
  shortName: string;
}) {
  // Initial status is derived (no synchronous setState in the effect): "done"
  // when there's nothing to hand off, "sending" while the POST is in flight.
  const [handoff, setHandoff] = useState<"idle" | "sending" | "done">(
    contact ? "sending" : "done",
  );
  const fired = useRef(false);

  useEffect(() => {
    // Fire exactly once on mount. Requires the captured contact (the form step
    // always runs before this step). Failures are swallowed — never block.
    if (fired.current) return;
    fired.current = true;
    if (!contact) return; // already "done" from the initial state

    const controller = new AbortController();
    fetch("/api/v1/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
      body: JSON.stringify({
        intent,
        contact,
        answers,
        location,
        leadId: leadId ?? undefined,
      }),
    })
      .catch(() => {
        /* best-effort; the CTA still appears */
      })
      .finally(() => setHandoff("done"));

    return () => controller.abort();
  }, [contact, intent, answers, location, leadId]);

  return (
    <>
      <div className="mb-5 flex items-center justify-center gap-2.5 text-green-700">
        <CheckCircle2 className="size-7" strokeWidth={2} aria-hidden="true" />
        <span className="text-[17px] font-bold">You&apos;re signed in</span>
      </div>

      {email && (
        <p className="-mt-1 mb-6 text-[16px] text-muted">
          Signed in as <span className="font-semibold text-ink">{email}</span>
        </p>
      )}

      <p className="mb-7 text-[16px] text-muted">
        Your details are saved. Continue in the {shortName} app to upload
        documents and track your application — you&apos;re already signed in
        there.
      </p>

      <a
        href={APP_URL}
        className="mt-2 flex h-[66px] w-full items-center justify-center gap-2.5 rounded-lg bg-green-600 text-[18px] font-bold text-white transition-[transform,background,box-shadow] duration-150 [box-shadow:0_3px_0_#0a3a2a,var(--shadow-3d)] hover:-translate-y-0.5 hover:bg-green-700 hover:[box-shadow:0_5px_0_#0a3a2a,var(--shadow-pop)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-spring-3 active:translate-y-px"
      >
        Continue in the {shortName} app
        <ArrowRight className="size-5" strokeWidth={2.2} aria-hidden="true" />
      </a>

      <div className="mt-4 min-h-[18px] text-[13px] text-muted" aria-live="polite">
        {handoff === "sending" && "Saving your application…"}
      </div>

      <a
        href="/auth/logout"
        className="mt-1 inline-block text-[14px] font-semibold text-green-600 hover:underline"
      >
        Not you? Sign out
      </a>
    </>
  );
}

/**
 * The ORIGINAL account-step mock — preserved verbatim for the no-auth-config
 * path so the site builds/runs and the flow is unbroken without Cognito.
 */
function AccountMock() {
  const emailId = useId();
  const pwId = useId();

  return (
    <>
      <p className="-mt-0.5 mb-7 text-[16px] text-muted">
        You can log in using your password or a secure access link.
      </p>

      <div className="relative mb-3.5 text-left">
        <label
          htmlFor={emailId}
          className="pointer-events-none absolute left-[18px] top-3 text-[12.5px] font-semibold text-muted"
        >
          Email
        </label>
        <input
          id={emailId}
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="you@email.com"
          className="h-[68px] w-full rounded-lg border-[1.5px] border-line bg-white px-[18px] pb-2 pt-[22px] text-[18px] font-semibold text-ink shadow-3d outline-none transition-colors duration-150 placeholder:font-medium placeholder:text-[#9aa39c] focus:border-2 focus:border-green-600"
        />
      </div>

      <div className="relative mb-3.5 text-left">
        <label
          htmlFor={pwId}
          className="pointer-events-none absolute left-[18px] top-3 text-[12.5px] font-semibold text-muted"
        >
          Password
        </label>
        <input
          id={pwId}
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          className="h-[68px] w-full rounded-lg border-[1.5px] border-line bg-white px-[18px] pb-2 pt-[22px] text-[18px] font-semibold text-ink shadow-3d outline-none transition-colors duration-150 placeholder:font-medium placeholder:text-[#9aa39c] focus:border-2 focus:border-green-600"
        />
      </div>

      <a
        href="#"
        className="mb-3.5 mt-1.5 block text-left text-[15px] font-bold text-green-600"
      >
        I forgot my password
      </a>

      <button
        type="button"
        className="mt-2 h-[66px] w-full rounded-lg bg-green-600 text-[18px] font-bold text-white transition-[transform,background,box-shadow] duration-150 [box-shadow:0_3px_0_#0a3a2a,var(--shadow-3d)] hover:-translate-y-0.5 hover:bg-green-700 hover:[box-shadow:0_5px_0_#0a3a2a,var(--shadow-pop)] active:translate-y-px"
      >
        Sign in with my password
      </button>

      <div className="my-[18px] flex items-center gap-3.5 text-[13px] text-muted before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">
        or
      </div>

      <button
        type="button"
        className="h-16 w-full rounded-lg border-[1.5px] border-line bg-white text-[16px] font-bold text-ink shadow-3d transition-colors duration-150 hover:bg-paper-2"
      >
        Send me a secure log in link
      </button>
    </>
  );
}
