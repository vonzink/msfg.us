/**
 * Tiny structured logger for the public API (and any server code that wants
 * one-line JSON logs). No deps — just `console.log`/`console.error` with a
 * JSON line, so it works on Vercel, in dev, and in any log aggregator that
 * parses stdout.
 *
 * Server-only: imported by route handlers / server modules. `requestId` is a
 * `crypto.randomUUID()` generated per request by the `withPublicApi` wrapper
 * (src/server/api/respond.ts) and threaded into `logRequest`.
 */
import crypto from "node:crypto";

/** One access-log line for a completed public-API request. */
export interface RequestLog {
  /** Per-request id (crypto.randomUUID()), correlates logs to a single call. */
  requestId: string;
  /** Route path, e.g. "/api/v1/public/rates". */
  route: string;
  /** HTTP method. */
  method: string;
  /** Final HTTP status code. */
  status: number;
  /** Wall-clock handler duration in milliseconds. */
  ms: number;
  /** Resolved API key id, when the request was authenticated. */
  apiKeyId?: string;
}

/** Generate a fresh request id. Thin wrapper so callers don't import crypto. */
export function newRequestId(): string {
  return crypto.randomUUID();
}

/**
 * Emit a single structured access-log line. Shape:
 *   {"t":"2026-06-01T…","level":"info","kind":"request",…}
 * Kept dependency-free and side-effect-only (never throws on the hot path).
 */
export function logRequest(entry: RequestLog): void {
  try {
    console.log(
      JSON.stringify({
        t: new Date().toISOString(),
        level: entry.status >= 500 ? "error" : "info",
        kind: "request",
        ...entry,
      }),
    );
  } catch {
    // Logging must never break a request.
  }
}

/**
 * Error-capture seam. Today it logs a structured line to stderr. When Sentry
 * (or another error tracker) is wired, forward `err` here — gated on
 * `SENTRY_DSN`. The Sentry SDK is intentionally NOT a dependency yet (keeps the
 * bundle light); this is the single place to add `Sentry.captureException(err)`
 * as a follow-up. No-ops gracefully with no config.
 */
export function captureError(
  err: unknown,
  context?: Record<string, unknown>,
): void {
  // TODO(observability): if process.env.SENTRY_DSN is set and the Sentry SDK is
  // installed, forward to Sentry.captureException(err, { extra: context }).
  try {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error(
      JSON.stringify({
        t: new Date().toISOString(),
        level: "error",
        kind: "error",
        message,
        stack,
        ...(context ? { context } : {}),
      }),
    );
  } catch {
    // Never throw from the error path.
  }
}
