"use client";

import { useId, useMemo, useState } from "react";
import { MapPin } from "lucide-react";
import { OfficerCard } from "@/components/officers/OfficerCard";
import {
  OFFICERS,
  officerLanguages,
  officerSpecialties,
  type Officer,
} from "@/content/officers";
import { SITE } from "@/content/site";
import { cn } from "@/lib/cn";

const ALL = "all";

/** Filter-chip <select> styled as a pill (ported from `.of-chip`). */
function FilterChip({
  label,
  value,
  onChange,
  options,
  icon,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Display label + underlying value pairs. The leading "all" option is added by the caller. */
  options: { value: string; label: string }[];
  icon?: React.ReactNode;
}) {
  const id = useId();
  return (
    <div className="inline-flex h-[42px] items-center gap-2 rounded-full border-[1.5px] border-line bg-white px-4 text-[14px] font-semibold text-ink shadow-3d focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-spring-3">
      {icon}
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="cursor-pointer border-0 bg-transparent font-semibold text-ink outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Loan officer directory (Client Component) — the only interactive piece on
 * the page. Renders three filter-chip selects (state / language / specialty)
 * that filter the OFFICERS list live, then a responsive 3→2→1 card grid.
 */
export function OfficerDirectory() {
  const [stateFilter, setStateFilter] = useState(ALL);
  const [languageFilter, setLanguageFilter] = useState(ALL);
  const [specialtyFilter, setSpecialtyFilter] = useState(ALL);

  // Option lists derived from real data so chips never offer empty results
  // for languages/specialties. State list comes from SITE (licensed states).
  const stateOptions = useMemo(
    () => [
      { value: ALL, label: "All states" },
      ...SITE.states.map((s) => ({ value: s.code, label: s.name })),
    ],
    [],
  );
  const languageOptions = useMemo(
    () => [
      { value: ALL, label: "Any language" },
      ...officerLanguages().map((l) => ({ value: l, label: l })),
    ],
    [],
  );
  const specialtyOptions = useMemo(
    () => [
      { value: ALL, label: "Any specialty" },
      ...officerSpecialties().map((s) => ({ value: s, label: s })),
    ],
    [],
  );

  const filtered = useMemo<Officer[]>(
    () =>
      OFFICERS.filter((o) => {
        if (stateFilter !== ALL && o.state !== stateFilter) return false;
        if (languageFilter !== ALL && !o.languages.includes(languageFilter))
          return false;
        if (specialtyFilter !== ALL && !o.specialties.includes(specialtyFilter))
          return false;
        return true;
      }),
    [stateFilter, languageFilter, specialtyFilter],
  );

  return (
    <>
      <div className="mb-10 flex flex-wrap justify-center gap-2.5">
        <FilterChip
          label="Filter by state"
          value={stateFilter}
          onChange={setStateFilter}
          options={stateOptions}
          icon={<MapPin aria-hidden className="h-3.5 w-3.5 text-muted" />}
        />
        <FilterChip
          label="Filter by language"
          value={languageFilter}
          onChange={setLanguageFilter}
          options={languageOptions}
        />
        <FilterChip
          label="Filter by specialty"
          value={specialtyFilter}
          onChange={setSpecialtyFilter}
          options={specialtyOptions}
        />
      </div>

      {filtered.length > 0 ? (
        <div
          className={cn(
            "grid grid-cols-3 gap-[22px]",
            "max-[900px]:grid-cols-2 max-[600px]:grid-cols-1",
          )}
        >
          {filtered.map((officer) => (
            <OfficerCard key={officer.nmls} officer={officer} />
          ))}
        </div>
      ) : (
        <p
          role="status"
          className="py-12 text-center text-[16px] text-muted"
        >
          No loan officers match those filters yet. Try widening your search.
        </p>
      )}
    </>
  );
}
