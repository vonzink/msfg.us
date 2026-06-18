"use client";

import { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/cn";
import { stateName } from "@/content/officers";

/** Lightweight officer shape passed from the server (no bios → smaller client
 *  bundle). Derived in apply/[intent]/page.tsx from the tenant roster. */
export type ApplyOfficer = {
  slug: string;
  name: string;
  title: string;
  nmls: string;
  states: string[];
  photo: string;
  /** Direct e-mail address shown on the finish-screen contact card. */
  email: string;
  /** E.164 or display phone number shown on the finish-screen contact card. */
  phone: string;
};

/** Sentinel stored when the user declines to pick a specific officer. */
export const NO_PREFERENCE = "no-preference";

/**
 * Loan-officer picker. Defaults to officers licensed in the property's state
 * (derived from the address step) with a "show all" fallback, plus a
 * "No preference" choice so the funnel never stalls. Tapping a tile stores the
 * officer slug (or the sentinel) and auto-advances, matching ChoiceStep.
 */
export function OfficerStep({
  officers,
  propertyState,
  sub,
  selected,
  onPick,
}: {
  officers: ApplyOfficer[];
  /** USPS state code of the subject property, when known. */
  propertyState?: string;
  sub?: string;
  /** Currently selected officer slug or NO_PREFERENCE. */
  selected?: string;
  /** Called on tap; parent stores the value and auto-advances. */
  onPick: (value: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const inState = propertyState
    ? officers.filter((o) => o.states.includes(propertyState))
    : [];
  // Filter to the property's state only when that yields matches.
  const filtered = inState.length > 0 && !showAll;
  const visible = filtered ? inState : officers;
  const hiddenCount = officers.length - inState.length;

  return (
    <>
      {filtered && propertyState && (
        <p className="-mt-1 mb-5 text-[15px] text-muted">
          Licensed in{" "}
          <span className="font-semibold text-ink">{stateName(propertyState)}</span>
        </p>
      )}

      <div className="flex flex-col gap-3.5">
        {visible.map((o) => {
          const on = selected === o.slug;
          return (
            <button
              key={o.slug}
              type="button"
              aria-pressed={on}
              onClick={() => onPick(o.slug)}
              className={cn(
                "flex min-h-[78px] items-center gap-4 rounded-lg border-[1.5px] px-[18px] py-3 text-left transition-[transform,border-color,background,box-shadow,color] duration-150",
                on
                  ? "border-green-600 bg-green-600 text-white [box-shadow:0_4px_0_#0a3a2a,var(--shadow-pop)]"
                  : "border-line bg-white text-ink shadow-3d hover:-translate-y-0.5 hover:border-green-600 hover:shadow-pop",
              )}
            >
              <span className="relative size-12 shrink-0 overflow-hidden rounded-full border border-line bg-paper-2">
                <Image src={o.photo} alt="" fill sizes="48px" className="object-cover object-top" />
              </span>
              <span className="min-w-0">
                <span className="block text-[17px] font-bold leading-tight">{o.name}</span>
                <span className={cn("mt-0.5 block text-[13px] font-semibold", on ? "text-white/85" : "text-green-600")}>
                  {o.title}
                </span>
                <span className={cn("block text-[12.5px]", on ? "text-white/75" : "text-muted")}>
                  NMLS #{o.nmls} · Licensed in {o.states.join(", ")}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {filtered && hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-4 inline-block text-[15px] font-bold text-green-600 underline"
        >
          Show all loan officers
        </button>
      )}

      <button
        type="button"
        aria-pressed={selected === NO_PREFERENCE}
        onClick={() => onPick(NO_PREFERENCE)}
        className={cn(
          "mt-5 flex min-h-[64px] w-full items-center rounded-lg border-[1.5px] px-[22px] text-left text-[16px] font-bold transition-[transform,border-color,background,box-shadow,color] duration-150",
          selected === NO_PREFERENCE
            ? "border-green-600 bg-green-600 text-white [box-shadow:0_4px_0_#0a3a2a,var(--shadow-pop)]"
            : "border-line bg-white text-ink shadow-3d hover:-translate-y-0.5 hover:border-green-600 hover:shadow-pop",
        )}
      >
        No preference — match me with the right loan officer
      </button>

      {sub && <div className="mt-6 text-[15px] text-muted">{sub}</div>}
    </>
  );
}
