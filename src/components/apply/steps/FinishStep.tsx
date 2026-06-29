"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ArrowRight, Phone, MessageSquare, Mail, Loader2 } from "lucide-react";
import { APP_URL } from "@/lib/auth/appLink";
import { useAuth } from "@/lib/auth/useAuth";
import { AccountPanel } from "./AccountPanel";
import { isHandoffTokenStale } from "./handoffStale";
import { telHref, smsHref } from "./offRampLink";
import { track } from "@/lib/analytics";
import { requestContact } from "@/lib/leads";
import type { Intent } from "@/content/flows";
import type { LeadContact } from "@/lib/leads";

type Channel = "call" | "text" | "email";

type OffRampOfficer = {
  slug: string;
  name: string;
  nmls: string;
  photo: string;
  email: string;
  phone: string;
} | null;

/**
 * Finish screen. A rendered screen (not the old auto-redirect): the hand-off
 * token is minted on mount as a PRE-WARM; navigation happens on the Continue
 * CLICK (TTL-aware re-mint). When Cognito is configured and the borrower is
 * signed out, Continue is gated behind an inline branded AccountPanel (create
 * account / sign in) so they're authenticated before the /continue hand-off —
 * once they authenticate, the hand-off fires automatically. A quiet
 * reveal-on-demand off-ramp lets them reach the chosen loan officer instead.
 *
 * Auth gating only applies when `auth.configured` (Cognito env present): local /
 * non-Cognito envs keep the passwordless Continue. In PROD `configured` is true,
 * so the panel renders and REQUIRES the pool's ALLOW_USER_PASSWORD_AUTH +
 * self-service sign-up to be enabled before it works — turn those on before the
 * first live deploy (deploy prereq), or gate activation behind a config flag.
 */
export function FinishStep({
  contact,
  leadId,
  shortName,
  officer = null,
  phoneDisplay = "",
  phoneHref = "",
  emailDisplay = "",
  offRampChannels = [] as Channel[],
  offRampSla = "",
  consentTcpa = "",
}: {
  intent?: Intent;
  contact: LeadContact | null;
  leadId: string | null;
  shortName: string;
  calendarHref?: string;
  officer?: OffRampOfficer;
  /** Tenant house line (used when no officer was chosen). */
  phoneDisplay?: string;
  phoneHref?: string;
  /** Tenant house email (used for the Email channel when no officer was chosen). */
  emailDisplay?: string;
  /** Off-ramp channels enabled for this tenant (config). */
  offRampChannels?: Channel[];
  /** SLA callback copy, e.g. "within ~15 minutes". */
  offRampSla?: string;
  /** Exact TCPA consent string from buildConsentTcpa(config). Never paraphrase. */
  consentTcpa?: string;
}) {
  const auth = useAuth();
  // True only between an inline AccountPanel sign-in and the auto-continue it
  // triggers — so a borrower who was ALREADY signed in on mount is NOT
  // auto-redirected (they still see the rendered screen + Continue button).
  const justAuthed = useRef(false);

  const fired = useRef(false);
  const mintedAtRef = useRef<number | null>(null);
  const reminting = useRef(false);
  const [token, setToken] = useState<string | null>(null);
  const [warmFailed, setWarmFailed] = useState(false);
  const [pending, setPending] = useState(false);
  const [fallback, setFallback] = useState(false);

  // --- Off-ramp (reveal-on-demand) state ---
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState<Channel | null>(null);
  // Phone-recapture sub-form (only when contact.phone is empty + channel is call/text).
  const [recapture, setRecapture] = useState<Channel | null>(null);
  const [recapturePhone, setRecapturePhone] = useState("");
  const [recaptureConsent, setRecaptureConsent] = useState(false);
  const phoneOnFile = (contact?.phone ?? "").trim() !== "";
  const recaptureValid = recapturePhone.trim().length >= 7 && recaptureConsent;
  const panelHeadingRef = useRef<HTMLHeadingElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Gate Continue behind inline auth only when Cognito is wired AND the borrower
  // is signed out (and we have funnel contact for the email pre-fill + lock).
  const needsAuth = auth.configured && !auth.authenticated && !!contact;

  const officerFirst = officer?.name.split(" ")[0] ?? null;
  // Number used for Call/Text: the officer's, else the tenant house line.
  const callHref = officer ? telHref(officer.phone) : phoneHref || telHref(phoneDisplay);
  const smsLink = officer ? smsHref(officer.phone) : smsHref(phoneDisplay);
  // Email target: the officer's address, else the tenant house email. Never a phone string.
  const emailAddress = officer?.email || emailDisplay || "";
  const mailHref = emailAddress
    ? `mailto:${emailAddress}?subject=${encodeURIComponent("My mortgage application")}`
    : null;

  function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next) {
      // Closed → open: fire once, focus the panel heading after it renders.
      track("offramp_open");
      requestAnimationFrame(() => panelHeadingRef.current?.focus());
    } else {
      requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }

  function fireRequest(channel: Channel, opts?: { phone?: string; consentTcpa?: boolean }) {
    if (!leadId) return;
    requestContact(leadId, channel, opts).then((r) =>
      track(r.ok ? "contact_request_ok" : "contact_request_fail"),
    );
  }

  // Email (gate-exempt) + Call/Text when a phone is already on file fire immediately.
  function onChannel(e: React.MouseEvent<HTMLAnchorElement>, channel: Channel) {
    track("channel_select", { channel });
    if (channel === "email") {
      fireRequest("email");
      setConfirmed("email");
      return;
    }
    // Call/Text with a phone already on file → fire immediately (href opens).
    if (phoneOnFile) {
      fireRequest(channel);
      setConfirmed(channel);
      return;
    }
    // Phone was skipped → reveal the consented-recapture sub-form. Do NOT fire
    // the LO-callback request yet. For Text, also stop the native sms: from
    // opening before consent (Call's tel: to the officer/house MAY open per spec).
    if (channel === "text") e.preventDefault();
    setRecapture(channel);
    track("offramp_phone_prompt");
  }

  function onRecaptureSubmit() {
    const channel = recapture;
    if (!channel || !recaptureValid) return;
    track("offramp_phone_submit");
    const phone = recapturePhone.trim();
    fireRequest(channel, { phone, consentTcpa: true });
    if (channel === "text") {
      const link = smsHref(phone);
      if (link) window.location.href = link;
    }
    setRecapture(null);
    setConfirmed(channel);
  }

  function confirmationLine(): string {
    if (!confirmed) return "";
    const who = officerFirst ?? "A loan officer";
    if (confirmed === "email") return `${who} will email you back ${offRampSla}.`;
    if (confirmed === "text") return `${who} will text you ${offRampSla} — keep an eye on your phone.`;
    return `${who} will call you ${offRampSla}.`;
  }

  const showCall = offRampChannels.includes("call") && callHref !== null;
  const showText = offRampChannels.includes("text") && smsLink !== null;
  const showEmail = offRampChannels.includes("email") && mailHref !== null;

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

  // After an inline AccountPanel sign-in flips auth → authenticated, continue
  // automatically (the borrower already committed via "… & continue"). Guarded
  // by justAuthed so an already-signed-in borrower is never auto-redirected.
  useEffect(() => {
    if (auth.authenticated && justAuthed.current) {
      justAuthed.current = false;
      void onContinue();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.authenticated]);

  return (
    <>
      <h1 className="mb-2 text-pretty text-[clamp(26px,3.6vw,38px)] font-extrabold leading-[1.08] tracking-[-0.03em] [text-wrap:balance]">
        You&rsquo;re all set — finish your application
      </h1>
      <p className="mb-6 text-[16px] text-muted">
        {needsAuth
          ? `Create your account to finish in the ${shortName} app.`
          : `Pick up right where you left off in the ${shortName} app.`}
      </p>

      {auth.loading ? (
        <div
          className="flex min-h-[66px] items-center justify-center text-muted"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="size-6 animate-spin" aria-hidden="true" />
          <span className="sr-only">Loading…</span>
        </div>
      ) : needsAuth ? (
        <AccountPanel
          initialEmail={contact?.email ?? ""}
          initialFirstName={contact?.firstName}
          initialLastName={contact?.lastName}
          onAuthed={() => {
            justAuthed.current = true;
            auth.refresh();
          }}
        />
      ) : fallback ? (
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

      {warmFailed && !fallback && !needsAuth && !auth.loading && (
        <p className="mt-3 text-center text-[13px] text-muted">
          Taking a moment longer than usual — tap Continue to retry.
        </p>
      )}

      {(showCall || showText || showEmail) && (
        <div className="mt-6">
          <button
            ref={triggerRef}
            type="button"
            onClick={toggleOpen}
            aria-expanded={open}
            aria-controls="offramp-panel"
            className="text-[14px] font-semibold text-green-600 underline underline-offset-2"
          >
            {officerFirst
              ? `Prefer to talk to ${officerFirst} first?`
              : "Prefer to talk to a loan officer first?"}
          </button>

          {open && (
            <div
              id="offramp-panel"
              className="mt-4 rounded-lg border border-line bg-paper-2 p-5 text-left"
            >
              <div className="flex items-center gap-3.5">
                {officer && officer.photo ? (
                  <span className="relative size-12 shrink-0 overflow-hidden rounded-full border border-line bg-white">
                    <Image src={officer.photo} alt="" fill sizes="48px" className="object-cover object-top" />
                  </span>
                ) : null}
                <div className="min-w-0">
                  <h2
                    ref={panelHeadingRef}
                    tabIndex={-1}
                    className="text-[16px] font-bold leading-tight text-ink outline-none"
                  >
                    {officer ? officer.name : "Talk to a loan officer"}
                  </h2>
                  <p className="text-[13px] text-muted">
                    {officer ? `NMLS #${officer.nmls}` : `Call us at ${phoneDisplay}`}
                  </p>
                </div>
              </div>

              <p className="mt-4 text-[14px] text-muted">
                {officerFirst ? `${officerFirst} will reach out ` : "A loan officer will reach out "}
                {offRampSla}.
              </p>

              <div className="mt-4 flex flex-col gap-2.5">
                {showCall && callHref && (
                  <a
                    href={callHref}
                    onClick={(e) => onChannel(e, "call")}
                    aria-label={officerFirst ? `Call ${officerFirst}` : "Call a loan officer"}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-lg border-[1.5px] border-line bg-white text-[15px] font-bold text-ink shadow-3d transition-colors duration-150 hover:bg-paper-2"
                  >
                    <Phone className="size-4 text-green-600" strokeWidth={2.2} aria-hidden="true" />
                    Call
                  </a>
                )}
                {showText && smsLink && (
                  <a
                    href={smsLink}
                    onClick={(e) => onChannel(e, "text")}
                    aria-label={officerFirst ? `Text ${officerFirst}` : "Text a loan officer"}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-lg border-[1.5px] border-line bg-white text-[15px] font-bold text-ink shadow-3d transition-colors duration-150 hover:bg-paper-2"
                  >
                    <MessageSquare className="size-4 text-green-600" strokeWidth={2.2} aria-hidden="true" />
                    Text
                  </a>
                )}
                {showEmail && mailHref && (
                  <a
                    href={mailHref}
                    onClick={(e) => onChannel(e, "email")}
                    aria-label={officerFirst ? `Email ${officerFirst}` : "Email a loan officer"}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-lg border-[1.5px] border-line bg-white text-[15px] font-bold text-ink shadow-3d transition-colors duration-150 hover:bg-paper-2"
                  >
                    <Mail className="size-4 text-green-600" strokeWidth={2.2} aria-hidden="true" />
                    Email
                  </a>
                )}
              </div>

              {recapture && (
                <div className="mt-4 rounded-lg border border-line bg-white p-4">
                  <label htmlFor="recapture-phone" className="sr-only">
                    Your phone number
                  </label>
                  <input
                    id="recapture-phone"
                    type="tel"
                    inputMode="tel"
                    value={recapturePhone}
                    onChange={(e) => setRecapturePhone(e.target.value)}
                    placeholder="Your phone number"
                    aria-describedby="recapture-consent"
                    className="h-[52px] w-full rounded-lg border-[1.5px] border-line bg-white px-[18px] text-[16px] font-semibold text-ink shadow-3d outline-none transition-colors duration-150 placeholder:font-medium placeholder:text-[#9aa39c] focus:border-2 focus:border-green-600"
                  />
                  <label className="mt-3 flex items-start gap-2.5 text-[12.5px] leading-snug text-muted">
                    <input
                      type="checkbox"
                      checked={recaptureConsent}
                      onChange={(e) => setRecaptureConsent(e.target.checked)}
                      className="mt-0.5 size-4 shrink-0 accent-green-600"
                    />
                    <span id="recapture-consent">{consentTcpa}</span>
                  </label>
                  <button
                    type="button"
                    onClick={onRecaptureSubmit}
                    disabled={!recaptureValid}
                    className="mt-3 flex h-12 w-full items-center justify-center rounded-lg bg-green-600 text-[15px] font-bold text-white [box-shadow:0_3px_0_#0a3a2a,var(--shadow-3d)] transition-[transform,background,box-shadow] duration-150 hover:-translate-y-0.5 hover:bg-green-700 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                  >
                    Confirm
                  </button>
                </div>
              )}

              <p className="mt-4 text-[14px] font-semibold text-green-700" aria-live="polite">
                {confirmationLine()}
              </p>
            </div>
          )}
        </div>
      )}
    </>
  );
}
