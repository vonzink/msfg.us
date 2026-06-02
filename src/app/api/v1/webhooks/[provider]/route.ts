/**
 * POST /api/v1/webhooks/:provider — inbound webhook sink. Flow: read the RAW
 * body → verify signature → dedupe via the event log → dispatch to the
 * provider handler → stamp processedAt.
 *
 * Contract:
 *   • 404 — unknown provider.
 *   • 401 — known provider, signature present but INVALID.
 *   • 200 — accepted (handled, deduped, skipped, or recorded-after-DB-blip).
 *
 * GHL (`provider === "ghl"`) is live two-way sync, verified via
 * `verifyGhlWebhook` (HMAC shared-secret OR RSA/Ed25519 public-key, mode chosen
 * by env). When GHL inbound is DISABLED (no verification configured) the
 * delivery is acknowledged 200 but NOT processed — so the site is safe with no
 * GHL credentials. Other providers use the generic HMAC path.
 */
import { NextResponse } from "next/server";
import { verifyWebhook, verifyGhlWebhook } from "@/server/webhooks/verify";
import { ghlInboundConfigured, serverEnv } from "@/lib/env";
import {
  recordWebhookEvent,
  markWebhookProcessed,
  deriveWebhookKey,
} from "@/server/webhooks/eventLog";
import { getWebhookHandler } from "@/server/webhooks/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Common header names providers use to carry a signature (generic path). */
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

/** Result of the per-provider verification step. */
interface VerifyOutcome {
  /** Signature verified (or permissive dev path). */
  ok: boolean;
  /** Provider recognized but inbound is disabled — accept (200) but skip. */
  disabled: boolean;
}

/** Verify the inbound request for `provider`, branching GHL onto its modes. */
function verifyForProvider(
  provider: string,
  req: Request,
  rawBody: string,
): VerifyOutcome {
  if (provider === "ghl") {
    // GHL inbound disabled (no verification configured) → accept but skip.
    if (!ghlInboundConfigured()) return { ok: false, disabled: true };

    const result = verifyGhlWebhook(rawBody, {
      ghlSignature: req.headers.get("x-ghl-signature"),
      whSignature: req.headers.get("x-wh-signature"),
      hmacSignature: readSignature(req),
    });
    return { ok: result.ok, disabled: false };
  }

  // Generic providers: HMAC-SHA256 of the raw body against a shared secret.
  // The `hmac` example provider uses GENERIC_WEBHOOK_SECRET; with no secret set
  // verifyWebhook stays permissive off-production and rejects in production.
  const secret =
    provider === "hmac" ? serverEnv.GENERIC_WEBHOOK_SECRET : undefined;
  const ok = verifyWebhook({
    provider,
    rawBody,
    signature: readSignature(req),
    secret,
  });
  return { ok, disabled: false };
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

  // Read the RAW body once — required for any signature scheme.
  const rawBody = await req.text();

  const { ok: signatureOk, disabled } = verifyForProvider(
    provider,
    req,
    rawBody,
  );

  // Inbound disabled for this provider: acknowledge so the sender stops
  // retrying, but run no side effects and persist nothing.
  if (disabled) {
    return NextResponse.json({ ok: true, skipped: "inbound disabled" });
  }

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
      const result = await handler({ provider, eventType, payload });
      await markWebhookProcessed(event.id, result.externalId ?? null);
    }

    return NextResponse.json({ ok: true, deduped: !isNew });
  } catch (err) {
    console.error(`[/api/v1/webhooks/${provider}] failed:`, err);
    // Still 200 so the provider doesn't hammer retries on our DB blip; ops
    // sees the log. (Adjust to 500 if you prefer provider-side retries.)
    return NextResponse.json({ ok: true, recorded: false });
  }
}
