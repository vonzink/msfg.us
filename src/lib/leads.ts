import type { Intent } from "@/content/flows";

/** Contact captured by the apply-wizard `form` step. */
export type LeadContact = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
};

/** A structured property address captured by the `address` step. */
export type StructuredAddress = {
  line1: string;
  /** Apt / unit / suite. */
  line2?: string;
  city: string;
  state: string;
  zip: string;
  /** Provider place id (Google), when an autocomplete suggestion was chosen. */
  placeId?: string;
};

/** A currency answer that records the entered value AND the unit the applicant
 *  chose (e.g. down payment as 20% or $85,000). */
export type CurrencyAmount = { value: number | null; unit: "$" | "%" };

/** Any value a wizard step can store. Index-keyed in the wizard; the named
 *  normalizer (`buildLeadFields`) turns these into meaningful lead fields. */
export type AnswerValue = string | string[] | number | StructuredAddress | CurrencyAmount | null;

export type LeadPayload = {
  intent: Intent;
  contact: LeadContact;
  /** Raw step answers, keyed by step index. */
  answers: Record<number, AnswerValue>;
  /** Named, normalized fields (built by buildLeadFields) for CRM/LOS/LO use. */
  fields?: Record<string, AnswerValue>;
  /** The `place` answer string, if one was captured. */
  location?: string;
  consentTcpa: true;
  idempotencyKey: string;
  source: "apply-wizard";
};

/**
 * Fire-and-forget lead submission to the API (route built separately).
 *
 * Postgres is the system-of-record, so we NEVER block the user on this call:
 * the wizard advances regardless of the result. Errors are swallowed/logged.
 * The endpoint may not exist yet during development — that is intentional.
 */
export async function submitLead(
  input: Omit<LeadPayload, "consentTcpa" | "idempotencyKey" | "source">,
): Promise<{ ok: boolean; leadId?: string }> {
  const body: LeadPayload = {
    ...input,
    consentTcpa: true,
    idempotencyKey: crypto.randomUUID(),
    source: "apply-wizard",
  };

  try {
    const res = await fetch("/api/v1/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error("[lead] submit failed:", res.status);
      return { ok: false };
    }
    const data = (await res.json().catch(() => null)) as
      | { ok?: boolean; leadId?: string }
      | null;
    return { ok: Boolean(data?.ok), leadId: data?.leadId };
  } catch (err) {
    console.error("[lead] submit error:", err);
    return { ok: false };
  }
}

/**
 * Fire-and-forget off-ramp contact request. Asks the borrower's chosen officer
 * (or the house line) to reach out via the picked channel. Modeled on
 * {@link submitLead}: generates its own idempotencyKey, swallows/logs all
 * errors (no PII), and returns { ok } — it must NEVER block the Continue flow.
 *
 * For call/text with a recaptured number, the caller MUST pass
 * { phone, consentTcpa: true }; the server returns 422 otherwise.
 */
export async function requestContact(
  leadId: string,
  channel: "call" | "text" | "email",
  opts?: { phone?: string; consentTcpa?: boolean },
): Promise<{ ok: boolean }> {
  const body = {
    channel,
    ...(opts?.phone ? { phone: opts.phone } : {}),
    ...(opts?.consentTcpa ? { consentTcpa: opts.consentTcpa } : {}),
    idempotencyKey: crypto.randomUUID(),
  };

  try {
    const res = await fetch(`/api/v1/leads/${encodeURIComponent(leadId)}/contact-request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error("[contact-request] failed:", res.status);
      return { ok: false };
    }
    const data = (await res.json().catch(() => null)) as { ok?: boolean } | null;
    return { ok: Boolean(data?.ok) };
  } catch (err) {
    console.error("[contact-request] error:", err instanceof Error ? err.message : String(err));
    return { ok: false };
  }
}
