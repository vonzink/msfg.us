/**
 * Webhook handler registry.
 *
 * Maps a provider slug → handler. `ghl` is live (CRM → site two-way sync);
 * register other providers here as they come online — the route is unchanged.
 *
 * The handler is loaded via a lazy dynamic `import()` so this module (and the
 * route that imports it) stays free of a transitive pull on the DB client /
 * env until an event for that provider actually arrives.
 *
 * ── Adding a new provider ──────────────────────────────────────────────────
 * 1. Write a handler `(WebhookHandlerInput) => Promise<WebhookHandlerResult>`
 *    (lazy-import its deps, like ghlHandler/genericHandler do).
 * 2. Add one entry to `webhookRegistry` below. That's it — the route at
 *    POST /api/v1/webhooks/:provider handles raw-body read, signature verify,
 *    idempotent event logging, dispatch, and processedAt stamping uniformly.
 * 3. Signature verification: providers that sign with a shared-secret HMAC use
 *    the generic path (verify.ts → verifyWebhook). The `hmac` example below
 *    verifies HMAC-SHA256 of the raw body against env GENERIC_WEBHOOK_SECRET;
 *    with no secret set it stays permissive off-production and is rejected in
 *    production (so it's safe by default). GHL is special-cased for its
 *    asymmetric marketplace signatures. To require verification for a new
 *    provider, give it a secret/scheme and branch it in the route's
 *    `verifyForProvider`, mirroring the `hmac`/`ghl` cases.
 */

export interface WebhookHandlerInput {
  provider: string;
  eventType: string | null;
  payload: unknown;
}

export interface WebhookHandlerResult {
  handled: boolean;
  /** Optional provider event id, persisted for traceability. */
  externalId?: string | null;
}

export type WebhookHandler = (
  input: WebhookHandlerInput,
) => Promise<WebhookHandlerResult>;

/** GHL inbound: find the matching Lead and mirror the CRM status back. */
const ghlHandler: WebhookHandler = async (input) => {
  const { handleGhlWebhook } = await import("@/server/webhooks/ghlHandler");
  return handleGhlWebhook(input);
};

/**
 * Generic HMAC provider (example). Verified via the generic HMAC path against
 * env GENERIC_WEBHOOK_SECRET; the handler is a no-op that just acknowledges the
 * deduped, signature-checked delivery. Shows that a new provider is one
 * registry entry + a handler.
 */
const genericHandler: WebhookHandler = async (input) => {
  const { handleGenericWebhook } = await import(
    "@/server/webhooks/genericHandler"
  );
  return handleGenericWebhook(input);
};

/**
 * Known providers. Listing a provider here marks it as "recognized" so the
 * route can 200 it quickly; unknown providers are rejected by the route.
 */
export const webhookRegistry: Record<string, WebhookHandler> = {
  ghl: ghlHandler,
  hmac: genericHandler,
};

/** Look up a handler; undefined means the provider is unknown. */
export function getWebhookHandler(provider: string): WebhookHandler | undefined {
  return webhookRegistry[provider];
}
