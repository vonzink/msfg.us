"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/cn";
import { stateName } from "@/content/officers";
import { filterOfficersByName } from "./officerSearch";

/** Lightweight officer shape passed from the server (no bios → smaller client
 *  bundle). Derived in apply/[intent]/page.tsx from the tenant roster. */
export type ApplyOfficer = {
  slug: string;
  name: string;
  title: string;
  nmls: string;
  states: string[];
  photo: string;
  email: string;
  phone: string;
};

/** Sentinel stored when the user declines to pick a specific officer. */
export const NO_PREFERENCE = "no-preference";

/**
 * Loan-officer picker. Defaults to officers licensed in the property's state
 * (derived from the address step), with a case-insensitive name search that,
 * when non-empty, searches the FULL roster (so a borrower can always reach an
 * out-of-state officer by name). A "No preference" choice keeps the funnel from
 * ever stalling. Tapping a tile stores the officer slug (or the sentinel) and
 * auto-advances, matching ChoiceStep.
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
  const [query, setQuery] = useState("");
  const q = query.trim();

  // In-state subset (the default view). Only applied when it yields matches.
  const inState = propertyState
    ? officers.filter((o) => o.states.includes(propertyState))
    : [];
  // Default (no search): show in-state when available, else everyone.
  // Searching: ignore the state filter and search the full roster by name.
  const base = q ? officers : inState.length > 0 ? inState : officers;
  const visible = useMemo(() => filterOfficersByName(base, q), [base, q]);

  const showInStateNote = !q && inState.length > 0 && propertyState;

  return (
    <>
      <div className="mb-5">
        <label htmlFor="officer-search" className="sr-only">
          Search loan officers by name
        </label>
        <div className="relative">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            id="officer-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name…"
            className="h-[52px] w-full rounded-full border border-line bg-white pl-12 pr-5 text-[16px] text-ink outline-none focus-visible:border-green-600 focus-visible:ring-2 focus-visible:ring-spring-soft"
          />
        </div>
      </div>

      {showInStateNote && (
        <p className="-mt-1 mb-5 text-[15px] text-muted">
          Licensed in{" "}
          <span className="font-semibold text-ink">{stateName(propertyState)}</span>
        </p>
      )}

      {visible.length === 0 ? (
        <p
          aria-live="polite"
          className="py-10 text-center text-[16px] text-muted"
        >
          No loan officers match &ldquo;{q}&rdquo;.
        </p>
      ) : (
        <div className="grid grid-cols-4 gap-3 max-[980px]:grid-cols-2">
          {visible.map((o) => {
            const on = selected === o.slug;
            return (
              <button
                key={o.slug}
                type="button"
                aria-pressed={on}
                aria-label={`${o.name}, ${o.title}, NMLS #${o.nmls}, licensed in ${o.states.join(", ")}`}
                onClick={() => onPick(o.slug)}
                className={cn(
                  "flex flex-col items-center gap-2.5 rounded-lg border-[1.5px] px-3 py-4 text-center transition-[transform,border-color,background,box-shadow,color] duration-150",
                  on
                    ? "border-green-600 bg-green-600 text-white [box-shadow:0_4px_0_#0a3a2a,var(--shadow-pop)]"
                    : "border-line bg-white text-ink shadow-3d hover:-translate-y-0.5 hover:border-green-600 hover:shadow-pop",
                )}
              >
                <span className="relative size-16 shrink-0 overflow-hidden rounded-full border border-line bg-paper-2">
                  <Image src={o.photo} alt="" fill sizes="64px" className="object-cover object-top" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[15px] font-bold leading-tight break-words hyphens-auto">{o.name}</span>
                  <span className={cn("mt-0.5 block text-[12.5px] font-semibold", on ? "text-white/85" : "text-green-600")}>
                    {o.title}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
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
