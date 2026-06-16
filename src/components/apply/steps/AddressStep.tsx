"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { StructuredAddress } from "@/lib/leads";
import type { AddressSuggestion } from "@/server/integrations/address/types";

/** Marker stored when the buyer doesn't have a property address yet. */
export const TBD_ADDRESS: StructuredAddress = {
  line1: "Address to be determined",
  city: "",
  state: "",
  zip: "",
};

/**
 * Property-address step. Queries our /api/v1/address/suggest proxy (Google
 * Places behind the scenes); selecting a suggestion fetches /details and fills
 * a StructuredAddress. Apt/Unit and ZIP are editable secondary fields. If the
 * proxy reports `configured:false` (no key), it silently becomes a validated
 * free-text street field — the funnel never breaks.
 */
export function AddressStep({
  value,
  onChange,
  onNext,
  help,
  onAskAi,
  onTbd,
}: {
  value: StructuredAddress | null;
  onChange: (a: StructuredAddress | null) => void;
  onNext: () => void;
  help?: string;
  onAskAi?: () => void;
  onTbd?: () => void;
}) {
  const id = useId();
  const [query, setQuery] = useState(value?.line1 ?? "");
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [configured, setConfigured] = useState(true);
  // eslint-disable-next-line react-hooks/purity -- seeding a ref once with a random session token is intentional and safe
  const tokenRef = useRef<string>(Math.random().toString(36).slice(2));
  const line2 = value?.line2 ?? "";
  const zip = value?.zip ?? "";

  // Debounced autocomplete.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing stale suggestions synchronously on short input is intentional
    if (query.trim().length < 3) { setSuggestions([]); return; }
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/v1/address/suggest?q=${encodeURIComponent(query)}&t=${tokenRef.current}`);
        const data = await res.json();
        setConfigured(data.configured !== false);
        setSuggestions(data.suggestions ?? []);
        setOpen(true);
      } catch { /* keep typing; fallback handles it */ }
    }, 220);
    return () => clearTimeout(handle);
  }, [query]);

  const choose = async (s: AddressSuggestion) => {
    setOpen(false);
    setQuery(s.label);
    try {
      const res = await fetch(`/api/v1/address/details?id=${encodeURIComponent(s.id)}&t=${tokenRef.current}`);
      const data = await res.json();
      if (data.address) onChange({ ...data.address, line2, zip: data.address.zip || zip });
    } catch { /* leave as typed */ }
    // eslint-disable-next-line react-hooks/purity -- rotating session token after each selection is intentional
    tokenRef.current = Math.random().toString(36).slice(2);
  };

  const syncManual = (next: Partial<StructuredAddress>) =>
    onChange({
      line1: next.line1 ?? value?.line1 ?? query,
      line2: next.line2 ?? line2,
      city: next.city ?? value?.city ?? "",
      state: next.state ?? value?.state ?? "",
      zip: next.zip ?? zip,
      placeId: value?.placeId,
    });

  const ready = Boolean((value?.line1 ?? query).trim() && (value?.zip ?? zip).trim());

  return (
    <>
      {help && onAskAi && (
        <button
          type="button"
          onClick={onAskAi}
          className="mb-3 inline-block text-[15px] font-bold text-green-600 underline"
        >
          {help}
        </button>
      )}

      <div className="relative mb-3.5 text-left">
        <label htmlFor={id} className="pointer-events-none absolute left-[18px] top-3 z-10 text-[12.5px] font-semibold text-muted">
          Address
        </label>
        <input
          id={id}
          autoFocus
          autoComplete="off"
          value={query}
          onChange={(e) => { setQuery(e.target.value); syncManual({ line1: e.target.value }); }}
          onKeyDown={(e) => { if (e.key === "Enter" && ready) onNext(); }}
          className="h-[68px] w-full rounded-lg border-[1.5px] border-line bg-white px-[18px] pb-2 pt-[22px] text-[18px] font-semibold text-ink shadow-3d outline-none transition-colors duration-150 placeholder:font-medium placeholder:text-[#9aa39c] focus:border-2 focus:border-green-600"
        />
        {open && configured && suggestions.length > 0 && (
          <ul className="absolute left-0 right-0 top-[72px] z-20 overflow-hidden rounded-lg border border-line bg-white shadow-pop">
            {suggestions.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => choose(s)}
                  className="block w-full px-[18px] py-3 text-left text-[15px] text-ink hover:bg-paper-2"
                >
                  {s.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mb-3.5 grid grid-cols-2 gap-3.5">
        <input
          aria-label="Apt / Unit (optional)"
          placeholder="Apt / Unit"
          value={line2}
          onChange={(e) => syncManual({ line2: e.target.value })}
          className="h-[60px] w-full rounded-lg border-[1.5px] border-line bg-white px-[18px] text-[16px] font-semibold text-ink shadow-3d outline-none focus:border-2 focus:border-green-600"
        />
        <input
          aria-label="ZIP code"
          inputMode="numeric"
          placeholder="ZIP code"
          value={zip}
          onChange={(e) => syncManual({ zip: e.target.value.replace(/[^0-9]/g, "").slice(0, 5) })}
          className="h-[60px] w-full rounded-lg border-[1.5px] border-line bg-white px-[18px] text-[16px] font-semibold text-ink shadow-3d outline-none focus:border-2 focus:border-green-600"
        />
      </div>

      <button
        type="button"
        onClick={onNext}
        disabled={!ready}
        aria-disabled={!ready}
        className={
          ready
            ? "mt-2 h-[66px] w-full rounded-lg bg-green-600 text-[18px] font-bold text-white [box-shadow:0_3px_0_#0a3a2a,var(--shadow-3d)] transition-[transform,background,box-shadow] duration-150 hover:-translate-y-0.5 hover:bg-green-700 hover:[box-shadow:0_5px_0_#0a3a2a,var(--shadow-pop)] active:translate-y-px"
            : "mt-2 h-[66px] w-full cursor-default rounded-lg bg-[#cfd6cd] text-[18px] font-bold text-white"
        }
      >
        Next
      </button>

      {onTbd && (
        <button
          type="button"
          onClick={onTbd}
          className="mt-3.5 inline-block text-[15px] font-bold text-green-600 hover:underline"
        >
          I don&rsquo;t have an address yet
        </button>
      )}
    </>
  );
}
