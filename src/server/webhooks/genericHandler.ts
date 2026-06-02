/**
 * Generic webhook handler — a no-op example for the `hmac` provider.
 *
 * Demonstrates the minimal contract a new provider needs: the route already
 * reads the raw body, verifies the signature (here: HMAC-SHA256 of the raw body
 * against GENERIC_WEBHOOK_SECRET — see verify.ts/verifyWebhook + the route's
 * generic branch), dedupes via the event log, and dispatches here. This handler
 * just acknowledges the (already-persisted, signature-checked) delivery; real
 * providers replace the body with their side effects.
 */
import type {
  WebhookHandlerInput,
  WebhookHandlerResult,
} from "@/server/webhooks/registry";

/**
 * Acknowledge a generic HMAC webhook. The event is already recorded + deduped
 * upstream; we return handled:true so it's stamped processedAt. Pull a provider
 * event id off the payload if present, for traceability.
 */
export async function handleGenericWebhook(
  input: WebhookHandlerInput,
): Promise<WebhookHandlerResult> {
  let externalId: string | null = null;
  if (input.payload && typeof input.payload === "object") {
    const id = (input.payload as Record<string, unknown>).id;
    if (typeof id === "string") externalId = id;
  }
  // No side effects — this is the example/no-op handler.
  return { handled: true, externalId };
}
