import { track as vercelTrack } from "@vercel/analytics";

/** Snake_case event names for the apply finish-step funnel. Adding an event here
 *  is the only way to fire it — `track()` rejects unknown names at compile time. */
export type AnalyticsEvent =
  | "finish_view"
  | "continue_click"
  | "continue_fallback_shown"
  | "offramp_open"
  | "offramp_phone_prompt"
  | "offramp_phone_submit"
  | "channel_select"
  | "contact_request_ok"
  | "contact_request_fail";

/**
 * Typed, client-only wrapper around Vercel Analytics `track()`. No-op on the
 * server (and harmlessly no-op outside Vercel/dev, where the underlying SDK is
 * already inert). Never throws — analytics must never break the funnel.
 */
export function track(
  event: AnalyticsEvent,
  props?: Record<string, string | number | boolean>,
): void {
  if (typeof window === "undefined") return;
  try {
    vercelTrack(event, props);
  } catch {
    // Swallow — telemetry must never interrupt the user.
  }
}
