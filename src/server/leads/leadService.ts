/**
 * Lead capture service — Postgres is the system-of-record; GHL is a
 * best-effort mirror. Contract:
 *   1. Upsert the Lead by idempotencyKey (never double-create).
 *   2. If not yet synced, dispatch to the CRM (contact → opportunity).
 *   3. Record the sync outcome on the row. GHL failures are SWALLOWED here —
 *      capture must never throw on the user's behalf because the lead is
 *      already durably saved.
 *
 * `dispatchToGhl` is exported separately so the retry cron can re-run it
 * against rows stuck in PENDING/FAILED.
 */
import type { Lead, Prisma } from "@prisma/client";
import { getTenantDb } from "@/lib/db";
import { OFFICERS } from "@/content/officers";
import type { LeadInput } from "@/validation/lead";
import type { CrmClient } from "@/server/integrations/types";
import { ghlClient } from "@/server/integrations/ghl/ghlClient";
import {
  leadToContactInput,
  leadToOpportunityInput,
} from "@/server/integrations/ghl/mappers";

/** Map the client's lowercase intent to the Prisma enum value. */
function toIntentEnum(intent: LeadInput["intent"]): Lead["intent"] {
  switch (intent) {
    case "buy":
      return "BUY";
    case "refi":
      return "REFI";
    case "cash":
      return "CASH";
  }
}

export interface CaptureResult {
  leadId: string;
  syncStatus: Lead["syncStatus"];
}

/**
 * Push a lead to the CRM and persist the outcome. Safe to call repeatedly;
 * returns the updated row. Never throws on CRM failure — it records FAILED.
 */
export async function dispatchToGhl(
  lead: Lead,
  crm: CrmClient = ghlClient,
): Promise<Lead> {
  const db = await getTenantDb();

  // The scoped client BANS `update` (its unique where can't be tenant-guarded),
  // so we updateMany (tenant-scoped where) then re-read the row to return it.
  // The row is one we just wrote inside this tenant, so the re-read is non-null.
  async function patchLead(data: Prisma.LeadUpdateManyMutationInput): Promise<Lead> {
    await db.lead.updateMany({ where: { id: lead.id }, data });
    const updated = await db.lead.findFirst({ where: { id: lead.id } });
    return updated ?? lead;
  }

  try {
    const contact = await crm.upsertContact(leadToContactInput(lead));

    // Not configured → nothing to sync; mark SKIPPED so the cron ignores it.
    if (contact.skipped) {
      return patchLead({ syncStatus: "SKIPPED" });
    }

    if (!contact.id) {
      throw new Error("GHL upsertContact returned no contact id");
    }

    const opportunity = await crm.createOpportunity(
      leadToOpportunityInput(lead, contact.id),
    );

    return patchLead({
      ghlContactId: contact.id,
      ghlOpportunityId: opportunity.id ?? null,
      syncStatus: "SYNCED",
      syncError: null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return patchLead({
      syncStatus: "FAILED",
      syncAttempts: { increment: 1 },
      syncError: message.slice(0, 1000),
    });
  }
}

/**
 * Capture a lead idempotently, then (for new/unsynced rows) dispatch to GHL.
 * GHL outcome is reflected in the returned syncStatus but never blocks/fails
 * the capture itself.
 */
export async function captureLead(
  input: LeadInput,
  crm: CrmClient = ghlClient,
): Promise<CaptureResult> {
  const db = await getTenantDb();
  const consentAt = input.consentTcpa ? new Date() : null;

  // Idempotent: if a row with this key exists, reuse it (no second create,
  // no duplicate CRM push). `existing` distinguishes the two paths. The scoping
  // extension adds tenantId to the where, so this resolves the per-tenant
  // composite unique (tenantId, idempotencyKey); findFirst (not findUnique)
  // because the scoped where is an AND filter, not a bare unique selector.
  const existing = await db.lead.findFirst({
    where: { idempotencyKey: input.idempotencyKey },
  });

  // Returning-borrower recognition (best-effort; never blocks). The route may
  // pass the signed-in email (sessionEmail) when a Cognito session is present.
  const priorLead = await db.lead.findFirst({
    where: { email: input.contact.email, NOT: { idempotencyKey: input.idempotencyKey } },
    select: { id: true },
  });
  const { resolveReturning } = await import("./returning");
  const recognition = resolveReturning({
    sessionEmailMatches:
      Boolean(input.sessionEmail) &&
      input.sessionEmail!.toLowerCase() === input.contact.email.toLowerCase(),
    priorLeadExists: Boolean(priorLead),
    ghlContactExists: false, // GHL existence lookup deferred (no find-by-email yet)
  });

  const mergedAnswers = {
    ...(input.answers as Record<string, unknown>),
    ...(input.fields ? { fields: input.fields } : {}),
    returning: recognition.returning,
    returningReason: recognition.reason,
  };

  // tenantId is injected by the scoping extension at runtime; type the payload
  // as the create input minus tenantId (full field-checking) and cast at the
  // boundary so Prisma's static "tenantId required" is satisfied.
  const data: Omit<Prisma.LeadCreateInput, "tenantId"> = {
    firstName: input.contact.firstName,
    lastName: input.contact.lastName,
    email: input.contact.email,
    phone: input.contact.phone,
    intent: toIntentEnum(input.intent),
    source: input.source,
    location: input.location ?? null,
    answers: mergedAnswers as object,
    cognitoSub: input.cognitoSub ?? null,
    consentTcpa: input.consentTcpa,
    consentAt,
    idempotencyKey: input.idempotencyKey,
    syncStatus: "PENDING",
  };

  let lead =
    existing ??
    (await db.lead.create({ data: data as Prisma.LeadCreateInput }));

  // Dispatch only when there's something to do: a brand-new lead, or an
  // existing one that hasn't successfully synced yet. Already-SYNCED/SKIPPED
  // rows are returned untouched (full idempotency).
  if (lead.syncStatus === "PENDING" || lead.syncStatus === "FAILED") {
    lead = await dispatchToGhl(lead, crm);
  }

  return { leadId: lead.id, syncStatus: lead.syncStatus };
}

/** Read a single lead by id, tenant-scoped. null when not found. */
export async function getLeadById(id: string): Promise<Lead | null> {
  const db = await getTenantDb();
  return db.lead.findFirst({ where: { id } });
}

/** Persisted shape at lead.answers.fields.contactPreference. */
type ContactPreference = {
  channels: ("call" | "text" | "email")[];
  latest: "call" | "text" | "email";
  requestedAt: string;
  phone?: string;
  consentTcpa?: boolean;
  consentRequestedAt?: string;
};

/** Resolve the officer the borrower chose, server-side, from the persisted
 *  slug at answers.fields.loanOfficer. Returns only {name,slug} (sufficient for
 *  the GHL tag); never trust a client-sent officer identity. */
function resolveOfficerFromAnswers(
  answers: unknown,
): { name: string; slug: string } | null {
  const slug = (answers as { fields?: Record<string, unknown> })?.fields?.loanOfficer;
  if (typeof slug !== "string" || !slug) return null;
  const o = OFFICERS.find((x) => x.slug === slug);
  return o ? { name: o.name, slug: o.slug } : null;
}

/**
 * Record an off-ramp contact request on the lead, tenant-scoped and idempotent
 * on the channel set. Postgres is the system-of-record; this is the durable
 * write. The route fires the best-effort GHL tag afterward (only when the
 * channel is newly added).
 *
 * SINGLE READ: we call findFirst once, then updateMany — the returned officer is
 * resolved from that same read. There is intentionally no re-read after the write.
 *
 * READ-MODIFY-WRITE of the FULL answers blob: the scoped client bans `.update()`
 * and `updateMany` REPLACES the JSON column (not a deep merge), so we must
 * reconstruct the entire answers object — preserving every existing
 * answers.fields key (loanOfficer, address, …) so the /continue hand-off is not
 * clobbered. TOCTOU note: the read→write window is unguarded; acceptable for v1
 * (single funnel session, low contention).
 */
export async function recordContactRequest(
  leadId: string,
  input: { channel: "call" | "text" | "email"; phone?: string; consentTcpa?: boolean },
): Promise<
  | { ok: true; channelWasNew: boolean; officer: { name: string; slug: string } | null }
  | { ok: false; reason: "not_found" | "consent_required" }
> {
  const db = await getTenantDb();
  const lead = await db.lead.findFirst({ where: { id: leadId } });
  if (!lead) return { ok: false, reason: "not_found" };

  const recapturedPhone = input.phone && input.phone.trim() !== "" ? input.phone.trim() : undefined;

  // Belt-and-suspenders: a recaptured call/text number requires affirmative
  // consent (the route also enforces this with a 422 before calling us).
  if (recapturedPhone && (input.channel === "call" || input.channel === "text") && input.consentTcpa !== true) {
    return { ok: false, reason: "consent_required" };
  }

  const answers = (lead.answers ?? {}) as Record<string, unknown>;
  const fields = (answers.fields ?? {}) as Record<string, unknown>;
  const prior = (fields.contactPreference ?? null) as ContactPreference | null;

  const priorChannels = prior?.channels ?? [];
  const channelWasNew = !priorChannels.includes(input.channel);
  const channels = channelWasNew ? [...priorChannels, input.channel] : priorChannels;
  const nowIso = new Date().toISOString();

  const nextPref: ContactPreference = {
    channels,
    latest: input.channel,
    requestedAt: nowIso,
    ...(prior?.phone ? { phone: prior.phone } : {}),
    ...(prior?.consentTcpa ? { consentTcpa: prior.consentTcpa } : {}),
    ...(prior?.consentRequestedAt ? { consentRequestedAt: prior.consentRequestedAt } : {}),
    // A newly recaptured number + consent overrides any prior.
    ...(recapturedPhone
      ? { phone: recapturedPhone, consentTcpa: true, consentRequestedAt: nowIso }
      : {}),
  };

  const nextAnswers = {
    ...answers,
    fields: { ...fields, contactPreference: nextPref },
  };

  await db.lead.updateMany({ where: { id: leadId }, data: { answers: nextAnswers as object } });

  return {
    ok: true,
    channelWasNew,
    officer: resolveOfficerFromAnswers(lead.answers),
  };
}

/**
 * Best-effort, tag-only GHL sync for an off-ramp contact request. Re-upserts the
 * contact with an accumulating "Requested:<channel>" tag (and "officer:<slug>"
 * when the lead chose one). Mirrors dispatchToGhl's swallow contract: NEVER
 * throws. ghlClient.upsertContact short-circuits to a no-op when GHL is not
 * configured, so this is safe in every environment. No PII is logged.
 */
export async function syncContactRequestTag(
  lead: Lead,
  channel: "call" | "text" | "email",
): Promise<void> {
  try {
    const officer = resolveOfficerFromAnswers(lead.answers);
    await ghlClient.upsertContact(
      leadToContactInput(lead, {
        requestedChannel: channel,
        ...(officer ? { officerSlug: officer.slug } : {}),
      }),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[contact-request] GHL tag sync failed:", message.slice(0, 200));
  }
}
