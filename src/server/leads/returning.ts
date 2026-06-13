/** Signals gathered server-side for returning-borrower recognition. */
export type ReturningSignals = {
  /** An authenticated session whose email equals the lead email. */
  sessionEmailMatches: boolean;
  /** A prior tenant Lead exists with the same email. */
  priorLeadExists: boolean;
  /** A GHL contact already exists for the email (when GHL is configured). */
  ghlContactExists: boolean;
};

export type ReturningResult = {
  returning: boolean;
  reason: "session" | "prior-lead" | "ghl" | null;
};

/** Resolve recognition from signals, in priority order. Pure. */
export function resolveReturning(s: ReturningSignals): ReturningResult {
  if (s.sessionEmailMatches) return { returning: true, reason: "session" };
  if (s.priorLeadExists) return { returning: true, reason: "prior-lead" };
  if (s.ghlContactExists) return { returning: true, reason: "ghl" };
  return { returning: false, reason: null };
}
