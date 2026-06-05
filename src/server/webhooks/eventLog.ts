/**
 * Idempotent webhook event log (Phase 3 scaffold).
 *
 * Records each inbound delivery as a WebhookEvent, deduped on idempotencyKey
 * so retried deliveries don't double-process. `recordWebhookEvent` returns
 * the row plus whether it was newly created (`isNew`); callers should only
 * run side effects when `isNew` is true.
 */
import crypto from "node:crypto";
import type { Prisma, WebhookEvent } from "@prisma/client";
import { getTenantDb } from "@/lib/db";

export interface RecordWebhookInput {
  provider: string;
  eventType?: string | null;
  externalId?: string | null;
  signatureOk: boolean;
  idempotencyKey: string;
  payload: unknown;
}

export interface RecordWebhookResult {
  event: WebhookEvent;
  isNew: boolean;
}

/**
 * Derive a stable idempotency key from the raw body when the provider didn't
 * supply one (sha256 of provider + body).
 */
export function deriveWebhookKey(provider: string, rawBody: string): string {
  return crypto
    .createHash("sha256")
    .update(`${provider}:${rawBody}`, "utf8")
    .digest("hex");
}

/** Insert the event if new; otherwise return the existing one (isNew=false). */
export async function recordWebhookEvent(
  input: RecordWebhookInput,
): Promise<RecordWebhookResult> {
  const db = await getTenantDb();

  // findFirst (not findUnique): the scoping extension adds tenantId to the
  // where, so the selector is an AND filter rather than a bare unique key.
  // idempotencyKey remains globally unique, so this still returns the one row.
  const existing = await db.webhookEvent.findFirst({
    where: { idempotencyKey: input.idempotencyKey },
  });
  if (existing) return { event: existing, isNew: false };

  // tenantId is injected by the scoping extension at runtime; type the payload
  // minus tenantId (full field-checking) and cast at the create boundary.
  const data: Omit<Prisma.WebhookEventCreateInput, "tenantId"> = {
    provider: input.provider,
    eventType: input.eventType ?? null,
    externalId: input.externalId ?? null,
    signatureOk: input.signatureOk,
    idempotencyKey: input.idempotencyKey,
    payload: (input.payload ?? {}) as object,
  };
  const event = await db.webhookEvent.create({
    data: data as Prisma.WebhookEventCreateInput,
  });
  return { event, isNew: true };
}

/**
 * Stamp processedAt once a (new) event has been handled. Optionally backfills
 * the provider-side `externalId` the handler resolved (e.g. the GHL
 * opportunity/contact id), for traceability.
 */
export async function markWebhookProcessed(
  id: string,
  externalId?: string | null,
): Promise<void> {
  const db = await getTenantDb();
  // Scoped client BANS `update` (its unique where can't be tenant-guarded);
  // updateMany carries a tenant-scoped where and we don't need the row back.
  await db.webhookEvent.updateMany({
    where: { id },
    data: {
      processedAt: new Date(),
      ...(externalId ? { externalId } : {}),
    },
  });
}
