/**
 * Public partner API response helpers + the `withPublicApi` wrapper.
 *
 * Provides:
 *   • Consistent JSON envelopes: `ok({...})` → { ok:true, data }, and
 *     `fail(status, msg)` → { ok:false, error }.
 *   • CORS headers from `PUBLIC_API_CORS_ORIGINS` (default "*").
 *   • `withPublicApi(handler, opts)` — wraps a route handler with CORS,
 *     rate-limiting, auth (none | key | key+hmac), structured request logging,
 *     and uniform error handling. Also exposes an `OPTIONS` preflight handler.
 *
 * Server-only.
 */
import { serverEnv, publicApiConfigured } from "@/lib/env";
import { logRequest, newRequestId, captureError } from "@/lib/log";
import {
  authenticateKey,
  authenticateWrite,
  type ApiKeyRecord,
} from "@/server/api/auth";
import {
  checkRateLimit,
  clientIdentifier,
  rateLimitHeaders,
} from "@/server/api/rateLimit";

/** Auth mode for an endpoint. */
export type AuthMode = "none" | "key" | "key+hmac";

/** Options for {@link withPublicApi}. */
export interface PublicApiOptions {
  /** Auth requirement. Default "none" (open read). */
  auth?: AuthMode;
  /** Apply the token-bucket rate limiter. Default true. */
  rateLimit?: boolean;
}

/** Context handed to the wrapped handler. */
export interface PublicApiContext {
  /** Per-request id (also returned to the client as `X-Request-Id`). */
  requestId: string;
  /** The authenticated key, when auth !== "none". */
  apiKey?: ApiKeyRecord;
  /** Raw request body (read once for HMAC; reuse to avoid a double read). */
  rawBody: string;
}

type Handler = (
  req: Request,
  ctx: PublicApiContext,
) => Promise<Response> | Response;

/** Resolve the allowed CORS origin for a request. */
function corsOrigin(req: Request): string {
  const configured = serverEnv.PUBLIC_API_CORS_ORIGINS;
  if (configured === "*") return "*";
  const allow = configured
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const origin = req.headers.get("origin");
  if (origin && allow.includes(origin)) return origin;
  // Fall back to the first configured origin (so the header is always set).
  return allow[0] ?? "*";
}

/** Standard CORS headers for the public API. */
export function corsHeaders(req: Request): Record<string, string> {
  const origin = corsOrigin(req);
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, x-api-key, x-signature, x-idempotency-key",
    "Access-Control-Max-Age": "86400",
    ...(origin !== "*" ? { Vary: "Origin" } : {}),
  };
}

/** Merge header maps into a Headers object. */
function mergeHeaders(...maps: Array<Record<string, string> | undefined>): Headers {
  const h = new Headers();
  for (const map of maps) {
    if (!map) continue;
    for (const [k, v] of Object.entries(map)) h.set(k, v);
  }
  return h;
}

/** Build a success envelope: { ok:true, data }. */
export function ok<T>(
  data: T,
  init?: { status?: number; headers?: Record<string, string> },
): Response {
  return new Response(JSON.stringify({ ok: true, data }), {
    status: init?.status ?? 200,
    headers: mergeHeaders({ "Content-Type": "application/json" }, init?.headers),
  });
}

/** Build an error envelope: { ok:false, error }. */
export function fail(
  status: number,
  error: string,
  headers?: Record<string, string>,
): Response {
  return new Response(JSON.stringify({ ok: false, error }), {
    status,
    headers: mergeHeaders({ "Content-Type": "application/json" }, headers),
  });
}

/** Pre-flight handler — export as `OPTIONS` from a route. */
export function preflight(req: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

/**
 * Wrap a public-API route handler. Applies, in order: CORS, rate-limit, auth,
 * structured logging, and error handling. The handler receives the validated
 * context (requestId, apiKey, rawBody) and may return any Response — CORS +
 * request-id + rate-limit headers are added to it automatically.
 */
export function withPublicApi(handler: Handler, opts: PublicApiOptions = {}) {
  const auth: AuthMode = opts.auth ?? "none";
  const doRateLimit = opts.rateLimit ?? true;

  return async function wrapped(req: Request): Promise<Response> {
    const started = Date.now();
    const requestId = newRequestId();
    const route = new URL(req.url).pathname;
    const cors = corsHeaders(req);

    // Finalize: stamp shared headers, log, return.
    const finish = (res: Response, apiKeyId?: string): Response => {
      const headers = new Headers(res.headers);
      for (const [k, v] of Object.entries(cors)) headers.set(k, v);
      headers.set("X-Request-Id", requestId);
      logRequest({
        requestId,
        route,
        method: req.method,
        status: res.status,
        ms: Date.now() - started,
        apiKeyId,
      });
      return new Response(res.body, { status: res.status, headers });
    };

    try {
      // Read the raw body once (needed for HMAC; reused by the handler).
      const rawBody =
        req.method === "GET" || req.method === "HEAD"
          ? ""
          : await req.text();

      // --- Auth -------------------------------------------------------------
      let apiKey: ApiKeyRecord | undefined;
      if (auth !== "none") {
        // WRITE endpoints gate on the API being enabled at all.
        if (!publicApiConfigured()) {
          return finish(
            fail(503, "Public API not enabled", rateLimitNoop()),
          );
        }
        const result =
          auth === "key+hmac"
            ? await authenticateWrite(req, rawBody)
            : await authenticateKey(req);
        if (!result.ok) {
          return finish(fail(result.status, result.error));
        }
        apiKey = result.key;
      }

      // --- Rate limit -------------------------------------------------------
      if (doRateLimit) {
        const id = clientIdentifier(req, apiKey?.keyId);
        const rl = checkRateLimit(id);
        const rlHeaders = rateLimitHeaders(rl);
        if (!rl.allowed) {
          return finish(
            fail(429, "Rate limit exceeded", rlHeaders),
            apiKey?.keyId,
          );
        }
        // Allowed: run the handler, then attach limit headers.
        const res = await handler(req, { requestId, apiKey, rawBody });
        const withRl = new Response(res.body, {
          status: res.status,
          headers: mergeHeaders(
            Object.fromEntries(res.headers.entries()),
            rlHeaders,
          ),
        });
        return finish(withRl, apiKey?.keyId);
      }

      const res = await handler(req, { requestId, apiKey, rawBody });
      return finish(res, apiKey?.keyId);
    } catch (err) {
      captureError(err, { route, requestId, method: req.method });
      return finish(fail(500, "Internal server error"));
    }
  };
}

/** Empty header map (keeps call sites readable when no extra headers apply). */
function rateLimitNoop(): Record<string, string> {
  return {};
}
