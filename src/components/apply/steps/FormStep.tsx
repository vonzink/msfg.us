"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/cn";
import type { LeadContact } from "@/lib/leads";

type FieldDef = {
  key: keyof LeadContact;
  label: string;
  type: "text" | "email" | "tel";
  autoComplete: string;
  inputMode?: "email" | "tel";
};

const FIELDS: FieldDef[] = [
  { key: "firstName", label: "First name", type: "text", autoComplete: "given-name" },
  { key: "lastName", label: "Last name", type: "text", autoComplete: "family-name" },
  { key: "email", label: "Email", type: "email", autoComplete: "email", inputMode: "email" },
  { key: "phone", label: "Phone number", type: "tel", autoComplete: "tel", inputMode: "tel" },
];

export function FormStep({
  onDone,
  consentTcpa,
}: {
  /** Called with the collected contact once all 4 fields are filled. */
  onDone: (contact: LeadContact) => void;
  /** TCPA consent microcopy (tenant-specific). */
  consentTcpa: string;
}) {
  const baseId = useId();
  const [f, setF] = useState<LeadContact>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
  });

  const ok = Boolean(
    f.firstName.trim() && f.lastName.trim() && f.email.trim() && f.phone.trim(),
  );

  const submit = () => {
    if (ok) onDone(f);
  };

  return (
    <>
      {FIELDS.map((field) => {
        const id = `${baseId}-${field.key}`;
        return (
          <div key={field.key} className="relative mb-3.5 text-left">
            <label htmlFor={id} className="sr-only">
              {field.label}
            </label>
            <input
              id={id}
              type={field.type}
              autoComplete={field.autoComplete}
              inputMode={field.inputMode}
              placeholder={field.label}
              value={f[field.key]}
              onChange={(e) =>
                setF((s) => ({ ...s, [field.key]: e.target.value }))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
              className="h-[68px] w-full rounded-lg border-[1.5px] border-line bg-white px-[18px] text-[18px] font-semibold text-ink shadow-3d outline-none transition-colors duration-150 placeholder:font-medium placeholder:text-[#9aa39c] focus:border-2 focus:border-green-600"
            />
          </div>
        );
      })}

      <button
        type="button"
        onClick={submit}
        disabled={!ok}
        aria-disabled={!ok}
        className={cn(
          "mt-2 h-[66px] w-full rounded-lg text-[18px] font-bold text-white transition-[transform,background,box-shadow] duration-150",
          ok
            ? "bg-green-600 [box-shadow:0_3px_0_#0a3a2a,var(--shadow-3d)] hover:-translate-y-0.5 hover:bg-green-700 hover:[box-shadow:0_5px_0_#0a3a2a,var(--shadow-pop)] active:translate-y-px"
            : "cursor-default bg-[#cfd6cd]",
        )}
      >
        Next
      </button>

      <p className="mt-[18px] text-left text-xs leading-relaxed text-muted">
        {consentTcpa}
      </p>
    </>
  );
}
