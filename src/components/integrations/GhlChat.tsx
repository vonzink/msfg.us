"use client";

/**
 * GhlChat — loads the LeadConnector (GoHighLevel) web chat widget site-wide.
 * This is the LIVE-AGENT / CRM chat, distinct from the homepage AI assistant
 * (self-serve); the two coexist.
 *
 * Gated on `NEXT_PUBLIC_GHL_CHAT_WIDGET_ID`: renders nothing when unconfigured,
 * so the site runs with no GHL credentials. The loader script
 * (`loader.js` + `data-resources-url` + `data-widget-id`) is injected lazily
 * (`strategy="lazyOnload"`) so it never blocks first paint or hydration.
 *
 * Hosts/attributes verified against the LeadConnector embed snippet
 * (widgets.leadconnectorhq.com/loader.js). Public config only — no secrets.
 */
import Script from "next/script";

const DEFAULT_LOADER_SRC = "https://widgets.leadconnectorhq.com/loader.js";
const DEFAULT_RESOURCES_URL =
  "https://widgets.leadconnectorhq.com/chat-widget/loader.js";

export function GhlChat() {
  const widgetId = process.env.NEXT_PUBLIC_GHL_CHAT_WIDGET_ID;
  if (!widgetId || widgetId.trim() === "") return null;

  const resourcesUrl =
    process.env.NEXT_PUBLIC_GHL_CHAT_RESOURCES_URL || DEFAULT_RESOURCES_URL;
  const loaderSrc =
    process.env.NEXT_PUBLIC_GHL_CHAT_LOADER_SRC || DEFAULT_LOADER_SRC;
  // Optional: the chat widget can also be scoped to a location id.
  const locationId = process.env.NEXT_PUBLIC_GHL_LOCATION_ID;

  return (
    <Script
      id="ghl-chat-widget"
      src={loaderSrc}
      strategy="lazyOnload"
      data-resources-url={resourcesUrl}
      data-widget-id={widgetId}
      {...(locationId ? { "data-location-id": locationId } : {})}
    />
  );
}
