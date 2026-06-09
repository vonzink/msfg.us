"use client";

import { useId, useMemo, useState } from "react";
import { MapPin } from "lucide-react";
import { OfficerCard } from "@/components/officers/OfficerCard";
import { officerStates, type Officer } from "@/content/officers";
import { cn } from "@/lib/cn";

const ALL = "all";

/**
 * Loan officer directory (Client Component) — the only interactive piece on the
 * page. A single state filter narrows the officer list live (an officer matches
 * when licensed in the selected state), then a responsive 3→2→1 card grid
 * renders them. `items-start` keeps neighbors compact when one card grows to
 * reveal its bio.
 */
export function OfficerDirectory({ officers }: { officers: Officer[] }) {
  const [stateFilter, setStateFilter] = useState(ALL);
  const selectId = useId();

  const stateOptions = useMemo(
    () => [
      { value: ALL, label: "All states" },
      ...officerStates().map((s) => ({ value: s.code, label: s.name })),
    ],
    [],
  );

  const filtered = useMemo<Officer[]>(
    () =>
      stateFilter === ALL
        ? officers
        : officers.filter((o) => o.states.includes(stateFilter)),
    [stateFilter, officers],
  );

  return (
    <>
      <div className="mb-10 flex flex-wrap items-center justify-center gap-3">
        <div className="inline-flex h-[42px] items-center gap-2 rounded-full border-[1.5px] border-line bg-white px-4 text-[14px] font-semibold text-ink shadow-3d focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-spring-3">
          <MapPin aria-hidden className="h-3.5 w-3.5 text-muted" />
          <label htmlFor={selectId} className="sr-only">
            Filter by state
          </label>
          <select
            id={selectId}
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
            className="cursor-pointer border-0 bg-transparent font-semibold text-ink outline-none"
          >
            {stateOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <span role="status" className="text-[13px] font-semibold text-muted">
          {filtered.length} loan officer{filtered.length === 1 ? "" : "s"}
        </span>
      </div>

      {filtered.length > 0 ? (
        <div
          className={cn(
            "grid grid-cols-3 items-start gap-[22px]",
            "max-[900px]:grid-cols-2 max-[600px]:grid-cols-1",
          )}
        >
          {filtered.map((officer) => (
            <OfficerCard key={officer.nmls} officer={officer} />
          ))}
        </div>
      ) : (
        <p role="status" className="py-12 text-center text-[16px] text-muted">
          No loan officers licensed in that state yet. Try “All states.”
        </p>
      )}
    </>
  );
}
