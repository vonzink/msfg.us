/**
 * Webhook handler registry.
 *
 * Maps a provider slug → handler. `ghl` is live (CRM → site two-way sync);
 * register other providers here as they come online — the route is unchanged.
 *
 * The handler is loaded via a lazy dynamic `import()` so this module (and the
 * route that imports it) stays free of a transitive pull on the DB client /
 * env until an event for that provider actually arrives.
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
 * Known providers. Listing a provider here marks it as "recognized" so the
 * route can 200 it quickly; unknown providers are rejected by the route.
 */
export const webhookRegistry: Record<string, WebhookHandler> = {
  ghl: ghlHandler,
};

/** Look up a handler; undefined means the provider is unknown. */
export function getWebhookHandler(provider: string): WebhookHandler | undefined {
  return webhookRegistry[provider];
}
