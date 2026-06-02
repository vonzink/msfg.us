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
import type { Lead } from "@prisma/client";
import { getDb } from "@/lib/db";
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
  const db = getDb();
  try {
    const contact = await crm.upsertContact(leadToContactInput(lead));

    // Not configured → nothing to sync; mark SKIPPED so the cron ignores it.
    if (contact.skipped) {
      return db.lead.update({
        where: { id: lead.id },
        data: { syncStatus: "SKIPPED" },
      });
    }

    if (!contact.id) {
      throw new Error("GHL upsertContact returned no contact id");
    }

    const opportunity = await crm.createOpportunity(
      leadToOpportunityInput(lead, contact.id),
    );

    return db.lead.update({
      where: { id: lead.id },
      data: {
        ghlContactId: contact.id,
        ghlOpportunityId: opportunity.id ?? null,
        syncStatus: "SYNCED",
        syncError: null,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return db.lead.update({
      where: { id: lead.id },
      data: {
        syncStatus: "FAILED",
        syncAttempts: { increment: 1 },
        syncError: message.slice(0, 1000),
      },
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
  const db = getDb();
  const consentAt = input.consentTcpa ? new Date() : null;

  // Idempotent: if a row with this key exists, reuse it (no second create,
  // no duplicate CRM push). `existing` distinguishes the two paths.
  const existing = await db.lead.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });

  let lead =
    existing ??
    (await db.lead.create({
      data: {
        firstName: input.contact.firstName,
        lastName: input.contact.lastName,
        email: input.contact.email,
        phone: input.contact.phone,
        intent: toIntentEnum(input.intent),
        source: input.source,
        location: input.location ?? null,
        answers: input.answers as object,
        consentTcpa: input.consentTcpa,
        consentAt,
        idempotencyKey: input.idempotencyKey,
        syncStatus: "PENDING",
      },
    }));

  // Dispatch only when there's something to do: a brand-new lead, or an
  // existing one that hasn't successfully synced yet. Already-SYNCED/SKIPPED
  // rows are returned untouched (full idempotency).
  if (lead.syncStatus === "PENDING" || lead.syncStatus === "FAILED") {
    lead = await dispatchToGhl(lead, crm);
  }

  return { leadId: lead.id, syncStatus: lead.syncStatus };
}
