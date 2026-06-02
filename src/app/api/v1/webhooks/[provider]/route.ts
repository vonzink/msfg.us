/**
 * POST /api/v1/webhooks/:provider — generic inbound webhook sink (Phase 3
 * scaffold). Flow: read raw body → verify signature → dedupe via the event
 * log → dispatch to the provider handler → stamp processedAt.
 *
 * Contract: respond 200 fast for any KNOWN provider (so senders don't retry
 * needlessly), 401 on a bad signature, 404 for unknown providers. Handlers are
 * currently no-ops; the persistence + dedupe plumbing is what's live now.
 */
import { NextResponse } from "next/server";
import { verifyWebhook } from "@/server/webhooks/verify";
import {
  recordWebhookEvent,
  markWebhookProcessed,
  deriveWebhookKey,
} from "@/server/webhooks/eventLog";
import { getWebhookHandler } from "@/server/webhooks/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Common header names providers use to carry a signature. */
function readSignature(req: Request): string | null {
  return (
    req.headers.get("x-wh-signature") ??
    req.headers.get("x-signature") ??
    req.headers.get("x-hub-signature-256") ??
    null
  );
}

/** Idempotency key from a provider header, else derived from the body hash. */
function readIdempotencyKey(
  req: Request,
  provider: string,
  rawBody: string,
): string {
  return (
    req.headers.get("x-idempotency-key") ??
    req.headers.get("x-webhook-id") ??
    deriveWebhookKey(provider, rawBody)
  );
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ provider: string }> },
) {
  const { provider } = await ctx.params;

  const handler = getWebhookHandler(provider);
  if (!handler) {
    return NextResponse.json(
      { ok: false, error: "Unknown provider" },
      { status: 404 },
    );
  }

  const rawBody = await req.text();
  const signature = readSignature(req);

  // Per-provider secret comes from env, e.g. GHL_WEBHOOK_SECRET. None wired
  // yet; verifyWebhook stays permissive off-production.
  const signatureOk = verifyWebhook({ provider, rawBody, signature });
  if (!signatureOk) {
    return NextResponse.json(
      { ok: false, error: "Invalid signature" },
      { status: 401 },
    );
  }

  let payload: unknown = null;
  try {
    payload = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    payload = { _raw: rawBody };
  }
  // Pull a string `type` field if the provider sent one; otherwise null.
  let eventType: string | null = null;
  if (payload && typeof payload === "object") {
    const t = (payload as Record<string, unknown>).type;
    if (typeof t === "string") eventType = t;
  }

  const idempotencyKey = readIdempotencyKey(req, provider, rawBody);

  try {
    const { event, isNew } = await recordWebhookEvent({
      provider,
      eventType,
      signatureOk,
      idempotencyKey,
      payload,
    });

    // Only run side effects for a first-seen delivery.
    if (isNew) {
      await handler({ provider, eventType, payload });
      await markWebhookProcessed(event.id);
    }

    return NextResponse.json({ ok: true, deduped: !isNew });
  } catch (err) {
    console.error(`[/api/v1/webhooks/${provider}] failed:`, err);
    // Still 200 so the provider doesn't hammer retries on our DB blip; ops
    // sees the log. (Adjust to 500 if you prefer provider-side retries.)
    return NextResponse.json({ ok: true, recorded: false });
  }
}
