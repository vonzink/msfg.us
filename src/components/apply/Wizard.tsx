"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Phone } from "lucide-react";
import { Mark } from "@/components/ui/Mark";
import { FLOW, type Intent } from "@/content/flows";
import { submitLead, type LeadContact, type AnswerValue, type StructuredAddress, type CurrencyAmount } from "@/lib/leads";
import { buildLeadFields, isCurrencyAmount } from "@/lib/applyFields";
import { DeckStage } from "./DeckStage";
import { ChoiceStep, type TestimonialDisplay } from "./steps/ChoiceStep";
import { BinaryStep } from "./steps/BinaryStep";
import { PlaceStep } from "./steps/PlaceStep";
import { ContactStep } from "./steps/ContactStep";
import { FinishStep } from "./steps/FinishStep";
import { MultiStep } from "./steps/MultiStep";
import { CurrencyStep } from "./steps/CurrencyStep";
import { AddressStep, TBD_ADDRESS } from "./steps/AddressStep";
import { OfficerStep, NO_PREFERENCE, type ApplyOfficer } from "./steps/OfficerStep";
import { ApplyChatPanel } from "./ask-ai/ApplyChatPanel";
import { APPLY_CHAT_STARTERS } from "@/content/applyChatStarters";

const AUTO_ADVANCE_MS = 260;

/** Format a place/address answer to a single location string for the lead. */
function toLocation(v: AnswerValue | undefined): string | undefined {
  if (typeof v === "string") return v || undefined;
  if (v && typeof v === "object" && "line1" in v) {
    const a = v as StructuredAddress;
    return [a.line1, a.city, a.state, a.zip].filter(Boolean).join(", ") || undefined;
  }
  return undefined;
}

export function Wizard({
  intent,
  phoneHref,
  phoneDisplay,
  consentTcpa,
  assistantName,
  shortName,
  iconSrc,
  testimonial,
  calendarHref,
  officers,
}: {
  intent: Intent;
  phoneHref: string;
  phoneDisplay: string;
  consentTcpa: string;
  assistantName: string;
  shortName: string;
  iconSrc: string;
  testimonial?: TestimonialDisplay;
  calendarHref: string;
  officers: ApplyOfficer[];
}) {
  const router = useRouter();
  const steps = FLOW[intent];

  const [idx, setIdx] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const [answers, setAnswers] = useState<Record<number, AnswerValue>>({});
  const [contact, setContact] = useState<LeadContact | null>(null);
  const [leadId, setLeadId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("lead");
  });
  const [chatOpen, setChatOpen] = useState(false);
  const [seedQuestion, setSeedQuestion] = useState<string | undefined>(undefined);
  const openAskAi = useCallback((question?: string) => {
    setSeedQuestion(question);
    setChatOpen(true);
  }, []);
  const askBtnRef = useRef<HTMLButtonElement>(null);

  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const t = advanceTimer;
    return () => { if (t.current) clearTimeout(t.current); };
  }, []);

  const step = steps[idx];
  const currencyAns = isCurrencyAmount(answers[idx]) ? (answers[idx] as CurrencyAmount) : null;
  const currencyUnit = (s: { unit?: "$" | "%" }) => currencyAns?.unit ?? s.unit ?? "%";
  const total = steps.length;
  const pct = Math.round(((idx + 1) / (total + 1)) * 100);

  const next = useCallback(() => { setDir(1); setIdx((i) => Math.min(total - 1, i + 1)); }, [total]);
  const back = useCallback(() => {
    if (idx === 0) { router.push("/"); return; }
    setDir(-1);
    setIdx((i) => i - 1);
  }, [idx, router]);

  const pickAuto = useCallback((value: AnswerValue) => {
    setAnswers((a) => ({ ...a, [idx]: value }));
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    advanceTimer.current = setTimeout(next, AUTO_ADVANCE_MS);
  }, [idx, next]);

  const setAnswer = useCallback((value: AnswerValue) => setAnswers((a) => ({ ...a, [idx]: value })), [idx]);

  const onContactDone = useCallback((formContact: LeadContact) => {
    const placeIdx = steps.findIndex((s) => s.type === "place" || s.type === "address");
    const location = toLocation(placeIdx >= 0 ? answers[placeIdx] : undefined);
    setContact(formContact);
    const fields = buildLeadFields(steps, answers);
    void submitLead({ intent, contact: formContact, answers, fields, location }).then((res) => {
      if (res.leadId) setLeadId(res.leadId);
    });
    next();
  }, [answers, intent, next, steps]);

  const placeIdx = steps.findIndex((s) => s.type === "place" || s.type === "address");

  // Subject-property state (from the address step) drives the officer filter.
  const addrAnswer = placeIdx >= 0 ? answers[placeIdx] : undefined;
  const propertyState =
    addrAnswer && typeof addrAnswer === "object" && "state" in addrAnswer
      ? (addrAnswer as StructuredAddress).state || undefined
      : undefined;
  // Officer chosen in the officer step (slug) → {slug,name} for the finish step.
  const officerIdx = steps.findIndex((s) => s.type === "officer");
  const officerSlug =
    officerIdx >= 0 && typeof answers[officerIdx] === "string" ? (answers[officerIdx] as string) : undefined;
  const chosenOfficer =
    officerSlug && officerSlug !== NO_PREFERENCE ? officers.find((o) => o.slug === officerSlug) ?? null : null;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 bg-paper">
        <div className="wrap">
          <div className="flex h-[70px] items-center gap-4">
            <button type="button" onClick={back} aria-label="Back" className="flex h-11 items-center gap-1 rounded-full border border-line bg-white pl-2.5 pr-4 text-[15px] font-bold text-ink transition-colors duration-150 hover:bg-paper-2">
              <ChevronLeft className="size-5" strokeWidth={2} />
              Back
            </button>
            <a href={phoneHref} className="ml-auto flex items-center gap-2.5 text-[16px] font-bold text-ink">
              <span className="flex size-9 items-center justify-center rounded-full bg-spring-soft text-green-600">
                <Phone className="size-[18px]" strokeWidth={1.8} />
              </span>
              Call anytime {phoneDisplay}
            </a>
          </div>
          <div className="h-1 overflow-hidden rounded-[4px] bg-line" role="progressbar" aria-label="Application progress" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-[4px] bg-green-600 transition-[width] duration-[400ms] ease-[cubic-bezier(0.4,0,0.2,1)]" style={{ width: `${pct}%` }} />
          </div>
          <div className="pt-2 text-[13px] font-semibold text-muted">{pct}%</div>
        </div>
      </header>

      <div className="flex flex-1 items-start justify-center px-5 pb-[120px] pt-[7vh]">
        <DeckStage stepKey={idx} direction={dir}>
          <div className="mx-auto w-full max-w-[560px] text-center">
            <h1 className="mb-2 text-pretty text-[clamp(30px,4.4vw,46px)] font-extrabold leading-[1.06] tracking-[-0.03em] [text-wrap:balance]">
              {step.q}
            </h1>

            {step.type === "choice" && (
              <ChoiceStep options={step.opts} sub={step.sub} review={step.review} testimonial={testimonial} selected={typeof answers[idx] === "string" ? (answers[idx] as string) : undefined} onPick={pickAuto} />
            )}
            {step.type === "multi" && (
              <MultiStep options={step.opts} sub={step.sub} selected={Array.isArray(answers[idx]) ? (answers[idx] as string[]) : []} onChange={setAnswer} onNext={next} />
            )}
            {step.type === "binary" && (
              <BinaryStep
                help={step.help}
                usatoday={step.usatoday}
                selected={typeof answers[idx] === "string" ? (answers[idx] as string) : undefined}
                onPick={pickAuto}
                onAskAi={step.help ? () => openAskAi(step.askPrompt ?? step.help) : undefined}
              />
            )}
            {step.type === "place" && (
              <PlaceStep fieldLabel={step.fieldLabel} placeholder={step.placeholder} value={typeof answers[idx] === "string" ? (answers[idx] as string) : ""} onChange={setAnswer} onNext={next} />
            )}
            {step.type === "address" && (
              <AddressStep
                value={(answers[idx] as StructuredAddress) ?? null}
                onChange={setAnswer}
                onNext={next}
                help={step.help}
                onAskAi={step.help ? () => openAskAi(step.askPrompt ?? step.help) : undefined}
                onTbd={() => { setAnswer(TBD_ADDRESS); next(); }}
              />
            )}
            {step.type === "currency" && step.toggle && (
              <CurrencyStep
                field={step.field}
                placeholder={step.placeholder}
                optional={step.optional}
                unit={currencyUnit(step)}
                toggle
                value={currencyAns?.value ?? null}
                onChange={(n) => setAnswer({ value: n, unit: currencyUnit(step) })}
                onUnitChange={(u) => setAnswer({ value: null, unit: u })}
                onNext={next}
                onSkip={() => { setAnswer(null); next(); }}
              />
            )}
            {step.type === "currency" && !step.toggle && (
              <CurrencyStep
                field={step.field}
                placeholder={step.placeholder}
                optional={step.optional}
                unit={step.unit}
                value={typeof answers[idx] === "number" ? (answers[idx] as number) : null}
                onChange={setAnswer}
                onNext={next}
                onSkip={() => { setAnswer(null); next(); }}
              />
            )}
            {step.type === "form" && (
              <ContactStep onDone={onContactDone} consentTcpa={consentTcpa} />
            )}
            {step.type === "officer" && (
              <OfficerStep
                officers={officers}
                propertyState={propertyState}
                sub={step.sub}
                selected={typeof answers[idx] === "string" ? (answers[idx] as string) : undefined}
                onPick={pickAuto}
              />
            )}
            {(step.type === "finish" || step.type === "account") && (
              <FinishStep intent={intent} contact={contact} leadId={leadId} shortName={shortName} calendarHref={calendarHref} officer={chosenOfficer} />
            )}
          </div>
        </DeckStage>
      </div>

      <button
        ref={askBtnRef}
        type="button"
        onClick={() => openAskAi()}
        aria-haspopup="dialog"
        aria-expanded={chatOpen}
        aria-label={`Ask ${assistantName}`}
        className="fixed bottom-6 right-6 z-40 flex h-14 items-center gap-2.5 rounded-full bg-green-800 py-0 pl-2.5 pr-5 text-[15px] font-bold text-white shadow-pop transition-transform duration-150 hover:-translate-y-0.5"
      >
        <Mark size={36} label={shortName} /> Ask AI
      </button>

      <ApplyChatPanel
        open={chatOpen}
        onClose={() => { setChatOpen(false); setSeedQuestion(undefined); }}
        starters={APPLY_CHAT_STARTERS[intent]}
        assistantName={assistantName}
        shortName={shortName}
        iconSrc={iconSrc}
        stepQuestion={step.q}
        seedQuestion={seedQuestion}
        returnFocusRef={askBtnRef}
      />
    </div>
  );
}
