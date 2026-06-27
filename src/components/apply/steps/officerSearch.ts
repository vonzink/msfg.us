import type { ApplyOfficer } from "./OfficerStep";

/**
 * Case-insensitive substring filter on officer name. An empty or
 * whitespace-only query returns the input list unchanged (so the picker falls
 * back to the in-state default view). Pure + node-testable — no DOM.
 */
export function filterOfficersByName(
  officers: ApplyOfficer[],
  query: string,
): ApplyOfficer[] {
  const q = query.trim().toLowerCase();
  if (!q) return officers;
  return officers.filter((o) => o.name.toLowerCase().includes(q));
}
