"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Phone } from "lucide-react";
import { Mark } from "@/components/ui/Mark";
import { FLOW, type Intent } from "@/content/flows";
import { submitLead, type LeadContact } from "@/lib/leads";
import { ChoiceStep } from "./steps/ChoiceStep";
import { BinaryStep } from "./steps/BinaryStep";
import { PlaceStep } from "./steps/PlaceStep";
import { FormStep } from "./steps/FormStep";
import { AccountStep } from "./steps/AccountStep";

/** Auto-advance delay after a choice/binary selection (prototype: 260ms). */
const AUTO_ADVANCE_MS = 260;

export function Wizard({
  intent,
  phoneHref,
  phoneDisplay,
  consentTcpa,
}: {
  intent: Intent;
  phoneHref: string;
  phoneDisplay: string;
  consentTcpa: string;
}) {
  const router = useRouter();
  const steps = FLOW[intent];

  const [idx, setIdx] = useState(0);
  /** Collected answers, keyed by step index (mirrors prototype `sel`). */
  const [answers, setAnswers] = useState<Record<number, string>>({});
  /** Contact captured by the `form` step (needed for the LOS hand-off). */
  const [contact, setContact] = useState<LeadContact | null>(null);
  /** Lead id returned by the capture call (best-effort; may stay null). */
  const [leadId, setLeadId] = useState<string | null>(null);

  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear any pending auto-advance timer on unmount.
  useEffect(
    () => () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
    },
    [],
  );

  const step = steps[idx];
  const total = steps.length;
  const pct = Math.round(((idx + 1) / (total + 1)) * 100);

  const next = useCallback(() => {
    setIdx((i) => Math.min(total - 1, i + 1));
  }, [total]);

  const back = useCallback(() => {
    if (idx === 0) {
      router.push("/");
      return;
    }
    setIdx((i) => i - 1);
  }, [idx, router]);

  /** Store a selection for the current step, then auto-advance. */
  const pick = useCallback(
    (value: string) => {
      setAnswers((a) => ({ ...a, [idx]: value }));
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
      advanceTimer.current = setTimeout(next, AUTO_ADVANCE_MS);
    },
    [idx, next],
  );

  /** Controlled value for a `place` step. */
  const setPlace = useCallback(
    (value: string) => setAnswers((a) => ({ ...a, [idx]: value })),
    [idx],
  );

  /**
   * `form` completion: fire the lead (fire-and-forget — never blocks) and
   * advance to the `account` step regardless of success/failure.
   */
  const onFormDone = useCallback(
    (formContact: LeadContact) => {
      // Find the first `place` answer in the collected steps, if any.
      const placeIdx = steps.findIndex((s) => s.type === "place");
      const location = placeIdx >= 0 ? answers[placeIdx] : undefined;

      setContact(formContact);

      // Fire-and-forget lead capture. Capture the returned id (when it lands)
      // so the account step can cross-reference it in the LOS hand-off, but
      // NEVER block advancing on it.
      void submitLead({
        intent,
        contact: formContact,
        answers,
        location: location || undefined,
      }).then((res) => {
        if (res.leadId) setLeadId(res.leadId);
      });

      next();
    },
    [answers, intent, next, steps],
  );

  // Resolve the location answer once for the account step's hand-off.
  const placeIdx = steps.findIndex((s) => s.type === "place");
  const location = placeIdx >= 0 ? answers[placeIdx] : undefined;

  return (
    <div className="flex min-h-screen flex-col">
      {/* Sticky cream top bar + progress */}
      <header className="sticky top-0 z-20 bg-paper">
        <div className="wrap">
          <div className="flex h-[70px] items-center gap-4">
            <button
              type="button"
              onClick={back}
              aria-label="Back"
              className="flex size-11 items-center justify-center rounded-full border border-line bg-white text-ink transition-colors duration-150 hover:bg-paper-2"
            >
              <ChevronLeft className="size-5" strokeWidth={1.8} />
            </button>
            <a
              href={phoneHref}
              className="ml-auto flex items-center gap-2.5 text-[16px] font-bold text-ink"
            >
              <span className="flex size-9 items-center justify-center rounded-full bg-spring-soft text-green-600">
                <Phone className="size-[18px]" strokeWidth={1.8} />
              </span>
              Call anytime {phoneDisplay}
            </a>
          </div>

          <div
            className="h-1 overflow-hidden rounded-[4px] bg-line"
            role="progressbar"
            aria-label="Application progress"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-[4px] bg-green-600 transition-[width] duration-[400ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="pt-2 text-[13px] font-semibold text-muted">{pct}%</div>
        </div>
      </header>

      {/* Step stage */}
      <div className="flex flex-1 items-start justify-center px-5 pb-[120px] pt-[7vh]">
        <div key={idx} className="step-in w-full max-w-[560px] text-center">
          <h1 className="mb-2 text-pretty text-[clamp(30px,4.4vw,46px)] font-extrabold leading-[1.06] tracking-[-0.03em] [text-wrap:balance]">
            {step.q}
          </h1>

          {step.type === "choice" && (
            <ChoiceStep
              options={step.opts}
              sub={step.sub}
              review={step.review}
              selected={answers[idx]}
              onPick={pick}
            />
          )}

          {step.type === "binary" && (
            <BinaryStep
              help={step.help}
              usatoday={step.usatoday}
              selected={answers[idx]}
              onPick={pick}
            />
          )}

          {step.type === "place" && (
            <PlaceStep
              field={step.field}
              placeholder={step.placeholder}
              value={answers[idx] ?? ""}
              onChange={setPlace}
              onNext={next}
            />
          )}

          {step.type === "form" && (
            <FormStep onDone={onFormDone} consentTcpa={consentTcpa} />
          )}

          {step.type === "account" && (
            <AccountStep
              intent={intent}
              contact={contact}
              answers={answers}
              location={location || undefined}
              leadId={leadId}
            />
          )}
        </div>
      </div>

      {/* Floating "Ask AI" — Phase 2 wires the assistant. */}
      <button
        type="button"
        aria-label="Ask MSFG AI"
        className="fixed bottom-6 right-6 z-40 flex h-14 items-center gap-2.5 rounded-full bg-green-800 py-0 pl-2.5 pr-5 text-[15px] font-bold text-white shadow-pop transition-transform duration-150 hover:-translate-y-0.5"
      >
        <Mark size={36} /> Ask AI
      </button>
    </div>
  );
}
