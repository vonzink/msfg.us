/**
 * Inbound GHL webhook handler — the CRM → site half of two-way sync.
 *
 * Maps a verified GHL event (contact update, opportunity / pipeline-stage
 * change, etc.) onto the matching {@link Lead} and mirrors the CRM status back
 * onto the row (`crmStatus` / `crmStageId`, plus `ghlContactId` /
 * `ghlOpportunityId` if the webhook taught us an id we didn't have). Lead
 * lookup is best-effort and ordered most- to least-specific:
 *   1. by `ghlOpportunityId`  (opportunity events)
 *   2. by `ghlContactId`      (contact events)
 *   3. by `email`             (fallback when we never stored a GHL id)
 *
 * Idempotency is handled upstream by the event log (deliveries are deduped on
 * idempotencyKey before this runs), so the handler just needs to be safe to
 * apply once. A miss (no matching lead) is not an error — GHL pushes events for
 * contacts that never originated on the website.
 */
import type { Lead, Prisma } from "@prisma/client";
import { getTenantDb } from "@/lib/db";
import { parseGhlWebhook } from "@/server/integrations/ghl/mappers";
import { getOpportunity } from "@/server/integrations/ghl/ghlClient";
import type {
  WebhookHandlerInput,
  WebhookHandlerResult,
} from "@/server/webhooks/registry";

/** Find the Lead this event refers to, most-specific match first. */
async function findLead(opts: {
  opportunityId?: string;
  contactId?: string;
  email?: string;
}): Promise<Lead | null> {
  const db = await getTenantDb();

  if (opts.opportunityId) {
    const byOpp = await db.lead.findFirst({
      where: { ghlOpportunityId: opts.opportunityId },
    });
    if (byOpp) return byOpp;
  }
  if (opts.contactId) {
    const byContact = await db.lead.findFirst({
      where: { ghlContactId: opts.contactId },
    });
    if (byContact) return byContact;
  }
  if (opts.email) {
    const byEmail = await db.lead.findFirst({
      where: { email: opts.email },
      orderBy: { createdAt: "desc" },
    });
    if (byEmail) return byEmail;
  }
  return null;
}

/**
 * Process one inbound GHL webhook. Returns `handled: true` only when a lead was
 * found and updated; misses return `handled: false` (still a 200 upstream).
 */
export async function handleGhlWebhook(
  input: WebhookHandlerInput,
): Promise<WebhookHandlerResult> {
  const db = await getTenantDb();
  const event = parseGhlWebhook(input.eventType, input.payload);

  // If an opportunity event arrived thin (id only), hydrate status/stage/
  // contactId from the API. Best-effort: returns null when GHL is unconfigured
  // or the read fails, and we fall back to whatever the payload carried.
  let { status, pipelineStageId, contactId } = event;
  if (
    event.opportunityId &&
    (!status || !pipelineStageId || !contactId)
  ) {
    const opp = await getOpportunity(event.opportunityId);
    if (opp) {
      status = status ?? opp.status;
      pipelineStageId = pipelineStageId ?? opp.pipelineStageId;
      contactId = contactId ?? opp.contactId;
    }
  }

  const lead = await findLead({
    opportunityId: event.opportunityId,
    contactId,
    email: event.email,
  });

  if (!lead) {
    // Unknown contact/opportunity (e.g. created directly in GHL). Acknowledge.
    return { handled: false, externalId: event.opportunityId ?? contactId ?? null };
  }

  // Backfill ids the webhook taught us, and mirror the CRM status. The scoped
  // client BANS `update` (its unique where can't be tenant-guarded); updateMany
  // carries a tenant-scoped where and we don't need the row back here.
  const data: Prisma.LeadUpdateManyMutationInput = {};
  if (status !== undefined) data.crmStatus = status;
  if (pipelineStageId !== undefined) data.crmStageId = pipelineStageId;
  if (event.opportunityId && !lead.ghlOpportunityId) {
    data.ghlOpportunityId = event.opportunityId;
  }
  if (contactId && !lead.ghlContactId) {
    data.ghlContactId = contactId;
  }

  if (Object.keys(data).length > 0) {
    await db.lead.updateMany({ where: { id: lead.id }, data });
  }

  return {
    handled: true,
    externalId: event.opportunityId ?? contactId ?? null,
  };
}
