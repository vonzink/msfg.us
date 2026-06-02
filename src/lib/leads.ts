import type { Intent } from "@/content/flows";

/** Contact captured by the apply-wizard `form` step. */
export type LeadContact = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
};

export type LeadPayload = {
  intent: Intent;
  contact: LeadContact;
  /** The collected step answers, keyed by step index. */
  answers: Record<number, string>;
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
): Promise<{ ok: boolean }> {
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
    const data: unknown = await res.json().catch(() => null);
    return { ok: Boolean(data && (data as { ok?: boolean }).ok) };
  } catch (err) {
    console.error("[lead] submit error:", err);
    return { ok: false };
  }
}
