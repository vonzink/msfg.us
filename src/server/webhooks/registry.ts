/**
 * Webhook handler registry (Phase 3 scaffold).
 *
 * Maps a provider slug → handler. Currently every provider is a no-op that
 * acknowledges receipt without side effects (`handled: false`). Add real
 * handlers here as integrations come online; the route stays unchanged.
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

/** No-op handler: acknowledges the event but does nothing with it yet. */
const noopHandler: WebhookHandler = async () => ({ handled: false });

/**
 * Known providers. Listing a provider here marks it as "recognized" so the
 * route can 200 it quickly; unknown providers are rejected by the route.
 */
export const webhookRegistry: Record<string, WebhookHandler> = {
  ghl: noopHandler,
};

/** Look up a handler; undefined means the provider is unknown. */
export function getWebhookHandler(provider: string): WebhookHandler | undefined {
  return webhookRegistry[provider];
}
