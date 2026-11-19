"use client";

/**
 * GhlChat — loads the LeadConnector (GoHighLevel) web chat widget site-wide,
 * apart from the paths listed below.
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
 *
 * Not on the paths in `NO_THIRD_PARTY_CHAT_PATHS`. A page listed there tells
 * the visitor that what they type is not saved or sent anywhere, and a
 * third-party script with access to the page cannot be shown to honour that.
 * There the component renders nothing, so a visitor who opens the page
 * directly never loads the script. A visitor who arrives by a link from
 * another page may already have it running, and a script cannot be unloaded,
 * so the page is reloaded once and comes back without it.
 */
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";

const DEFAULT_LOADER_SRC = "https://widgets.leadconnectorhq.com/loader.js";
const DEFAULT_RESOURCES_URL =
  "https://widgets.leadconnectorhq.com/chat-widget/loader.js";

const SCRIPT_ID = "ghl-chat-widget";
const WIDGET_HOST = "widgets.leadconnectorhq.com";

/**
 * Paths where no third-party chat widget may run, because the page says the
 * visitor's numbers stay in the browser. Exact paths, without a trailing slash.
 */
export const NO_THIRD_PARTY_CHAT_PATHS: readonly string[] = ["/calculators/budget"];

/** True when `pathname` is one of `NO_THIRD_PARTY_CHAT_PATHS`: an exact match, ignoring a trailing slash. */
export function isNoThirdPartyChatPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return NO_THIRD_PARTY_CHAT_PATHS.includes(pathname.replace(/\/+$/, ""));
}

/** True when the loader, or anything else loaded from the widget's host, is in the document. */
function chatWidgetInDocument(): boolean {
  return document.querySelector(`#${SCRIPT_ID}, [src*="${WIDGET_HOST}"]`) !== null;
}

export function GhlChat() {
  const pathname = usePathname();
  const excluded = isNoThirdPartyChatPath(pathname);
  /** The path this document showed before the current one; null on the page it was opened on. */
  const previousPath = useRef<string | null>(null);

  useEffect(() => {
    const cameFrom = previousPath.current;
    previousPath.current = pathname;
    // Only an arrival from another page of this same document can have brought the script along.
    // The page a document opens on is skipped, and that is the page a reload gives, so one
    // reload can never lead to another.
    if (!excluded || cameFrom === null || isNoThirdPartyChatPath(cameFrom)) return;

    let reloaded = false;
    const reloadIfLoaded = () => {
      if (reloaded || !chatWidgetInDocument()) return;
      reloaded = true;
      window.location.reload();
    };
    reloadIfLoaded();
    if (reloaded) return;
    // next/script adds a lazyOnload script to the body when the browser is idle and does not
    // call that off when the component goes away, so the loader can still land after the arrival.
    const observer = new MutationObserver(() => {
      reloadIfLoaded();
      if (reloaded) observer.disconnect();
    });
    observer.observe(document.body, { childList: true });
    return () => observer.disconnect();
  }, [pathname, excluded]);

  const widgetId = process.env.NEXT_PUBLIC_GHL_CHAT_WIDGET_ID;
  if (!widgetId || widgetId.trim() === "") return null;
  if (excluded) return null;

  const resourcesUrl =
    process.env.NEXT_PUBLIC_GHL_CHAT_RESOURCES_URL || DEFAULT_RESOURCES_URL;
  const loaderSrc =
    process.env.NEXT_PUBLIC_GHL_CHAT_LOADER_SRC || DEFAULT_LOADER_SRC;
  // Optional: the chat widget can also be scoped to a location id.
  const locationId = process.env.NEXT_PUBLIC_GHL_LOCATION_ID;

  return (
    <Script
      id={SCRIPT_ID}
      src={loaderSrc}
      strategy="lazyOnload"
      data-resources-url={resourcesUrl}
      data-widget-id={widgetId}
      {...(locationId ? { "data-location-id": locationId } : {})}
    />
  );
}
