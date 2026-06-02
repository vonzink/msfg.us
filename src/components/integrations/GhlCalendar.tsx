/**
 * GhlCalendar — embeds a GoHighLevel / LeadConnector booking calendar as a
 * responsive iframe.
 *
 * The calendar id resolves from (in order): an explicit `calendarId` prop (a
 * per-officer override) → `NEXT_PUBLIC_GHL_CALENDAR_ID`. The embed host comes
 * from `NEXT_PUBLIC_GHL_CALENDAR_BASE` (default: LeadConnector's booking host),
 * producing `${base}/widget/booking/<calendarId>` — the standard GHL embed
 * URL. When no id is configured the component renders nothing, so callers must
 * provide a fallback (see ScheduleCallButton).
 *
 * Lazy by default (`loading="lazy"`) so the iframe only loads when scrolled
 * near / opened in a dialog. Public config only — no secrets here.
 */

/** Default LeadConnector booking host; override per-deployment if needed. */
const DEFAULT_CALENDAR_BASE = "https://api.leadconnectorhq.com";

/** Resolve the effective calendar id (prop override → env default). */
export function resolveCalendarId(calendarId?: string): string | null {
  const id = calendarId ?? process.env.NEXT_PUBLIC_GHL_CALENDAR_ID;
  return id && id.trim() !== "" ? id : null;
}

/** Build the GHL booking embed URL for a calendar id, or null if unconfigured. */
export function calendarEmbedUrl(calendarId?: string): string | null {
  const id = resolveCalendarId(calendarId);
  if (!id) return null;
  const base = (
    process.env.NEXT_PUBLIC_GHL_CALENDAR_BASE || DEFAULT_CALENDAR_BASE
  ).replace(/\/+$/, "");
  return `${base}/widget/booking/${encodeURIComponent(id)}`;
}

/** True when a calendar is configured (used to gate the dialog vs. fallback). */
export function calendarConfigured(calendarId?: string): boolean {
  return calendarEmbedUrl(calendarId) !== null;
}

export interface GhlCalendarProps {
  /** Per-officer calendar id override; falls back to the env default. */
  calendarId?: string;
  /** Accessible iframe title (e.g. "Schedule a call with Mara Hollister"). */
  title?: string;
  /** Extra classes for the iframe wrapper. */
  className?: string;
}

/**
 * Render the booking iframe. Returns null when no calendar is configured so the
 * site stays functional with no GHL credentials.
 */
export function GhlCalendar({
  calendarId,
  title = "Schedule a call",
  className,
}: GhlCalendarProps) {
  const src = calendarEmbedUrl(calendarId);
  if (!src) return null;

  return (
    <iframe
      src={src}
      title={title}
      loading="lazy"
      scrolling="no"
      className={className ?? "h-full w-full border-0"}
      style={{ minHeight: "min(640px, 80vh)", width: "100%", border: "none" }}
    />
  );
}
