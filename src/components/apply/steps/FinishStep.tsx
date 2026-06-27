"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ArrowRight, Phone, MessageSquare, Mail } from "lucide-react";
import { APP_URL } from "@/lib/auth/appLink";
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
  officer = null,
  phoneDisplay = "",
  phoneHref = "",
  emailDisplay = "",
  offRampChannels = [] as Channel[],
  offRampSla = "",
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
}) {
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
  const panelHeadingRef = useRef<HTMLHeadingElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

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
    setOpen((wasOpen) => {
      const next = !wasOpen;
      if (next) {
        track("offramp_open");
        // Focus the panel heading after it renders.
        requestAnimationFrame(() => panelHeadingRef.current?.focus());
      } else {
        requestAnimationFrame(() => triggerRef.current?.focus());
      }
      return next;
    });
  }

  function fireRequest(channel: Channel, opts?: { phone?: string; consentTcpa?: boolean }) {
    if (!leadId) return;
    requestContact(leadId, channel, opts).then((r) =>
      track(r.ok ? "contact_request_ok" : "contact_request_fail"),
    );
  }

  // Email (gate-exempt) + Call/Text when a phone is already on file fire immediately.
  function onChannel(channel: Channel) {
    track("channel_select", { channel });
    if (channel === "email") {
      fireRequest("email");
      setConfirmed("email");
      return;
    }
    // Call/Text. Phone-skipped recapture is handled in a later slice; here we
    // assume contact.phone is present (the only path wired in this slice).
    fireRequest(channel);
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
                    onClick={() => onChannel("call")}
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
                    onClick={() => onChannel("text")}
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
                    onClick={() => onChannel("email")}
                    aria-label={officerFirst ? `Email ${officerFirst}` : "Email a loan officer"}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-lg border-[1.5px] border-line bg-white text-[15px] font-bold text-ink shadow-3d transition-colors duration-150 hover:bg-paper-2"
                  >
                    <Mail className="size-4 text-green-600" strokeWidth={2.2} aria-hidden="true" />
                    Email
                  </a>
                )}
              </div>

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
