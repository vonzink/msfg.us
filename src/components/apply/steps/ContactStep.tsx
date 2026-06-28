"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/cn";
import { formatPhone } from "@/lib/applyFields";
import type { LeadContact } from "@/lib/leads";

/**
 * Contact captured in two panes for conversion (Better pattern): name+email,
 * then phone+TCPA personalized "Hi {firstName}!". `onDone` fires with the full
 * contact when the phone pane is submitted — that is when the lead fires.
 */
export function ContactStep({
  onDone,
  consentTcpa,
}: {
  onDone: (contact: LeadContact) => void;
  consentTcpa: string;
}) {
  const baseId = useId();
  const [pane, setPane] = useState<0 | 1>(0);
  const [f, setF] = useState<LeadContact>({ firstName: "", lastName: "", email: "", phone: "" });

  const pane0ok = Boolean(f.firstName.trim() && f.lastName.trim() && f.email.trim());
  const pane1ok = Boolean(f.phone.trim());

  const field = (
    key: keyof LeadContact,
    label: string,
    type: string,
    autoComplete: string,
    inputMode?: "email" | "tel",
  ) => {
    const fid = `${baseId}-${key}`;
    return (
      <div className="relative mb-3.5 text-left">
        <label htmlFor={fid} className="sr-only">{label}</label>
        <input
          id={fid}
          type={type}
          autoComplete={autoComplete}
          inputMode={inputMode}
          placeholder={label}
          value={f[key]}
          autoFocus={key === "firstName" || key === "phone"}
          onChange={(e) => {
            const v = key === "phone" ? formatPhone(e.target.value) : e.target.value;
            setF((s) => ({ ...s, [key]: v }));
          }}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            if (pane === 0 && pane0ok) setPane(1);
            else if (pane === 1 && pane1ok) onDone(f);
          }}
          className="h-[68px] w-full rounded-lg border-[1.5px] border-line bg-white px-[18px] text-[18px] font-semibold text-ink shadow-3d outline-none transition-colors duration-150 placeholder:font-medium placeholder:text-[#9aa39c] focus:border-2 focus:border-green-600"
        />
      </div>
    );
  };

  const cta = (label: string, ok: boolean, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      disabled={!ok}
      aria-disabled={!ok}
      className={cn(
        "mt-2 h-[66px] w-full rounded-lg text-[18px] font-bold text-white transition-[transform,background,box-shadow] duration-150",
        ok
          ? "bg-green-600 [box-shadow:0_3px_0_#0a3a2a,var(--shadow-3d)] hover:-translate-y-0.5 hover:bg-green-700 hover:[box-shadow:0_5px_0_#0a3a2a,var(--shadow-pop)] active:translate-y-px"
          : "cursor-default bg-[#cfd6cd]",
      )}
    >
      {label}
    </button>
  );

  if (pane === 0) {
    return (
      <>
        {field("firstName", "First name", "text", "given-name")}
        {field("lastName", "Last name", "text", "family-name")}
        {field("email", "Email", "email", "email", "email")}
        {cta("Next", pane0ok, () => pane0ok && setPane(1))}
      </>
    );
  }

  return (
    <>
      <p className="-mt-1 mb-6 text-[18px] font-bold text-ink">Hi {f.firstName}! What&apos;s your phone number?</p>
      {field("phone", "Phone number", "tel", "tel", "tel")}
      {cta("Next", pane1ok, () => pane1ok && onDone(f))}
      <button
        type="button"
        onClick={() => onDone(f)}
        className="mx-auto mt-4 block rounded-sm text-[15px] font-semibold text-muted underline underline-offset-2 transition-colors hover:text-ink"
      >
        Skip for now
      </button>
      <p className="mt-[18px] text-left text-xs leading-relaxed text-muted">{consentTcpa}</p>
    </>
  );
}
