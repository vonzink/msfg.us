/**
 * Per-provider inbound webhook signature verification (Phase 3 scaffold).
 *
 * Real HMAC checks get wired per provider as they're onboarded. Until a
 * provider has a configured secret + scheme, verification returns false in
 * production so unsigned traffic can't be processed — but stays permissive in
 * non-production to ease local testing.
 */
import crypto from "node:crypto";

export interface VerifyInput {
  provider: string;
  /** Exact raw request body (pre-JSON-parse) — required for HMAC. */
  rawBody: string;
  /** Signature header value, if the provider sent one. */
  signature: string | null;
  /** Shared secret for this provider, if configured. */
  secret?: string;
}

/** Constant-time compare of two hex digests. */
function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ab.length !== bb.length || ab.length === 0) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * Verify an inbound webhook signature. Returns true when the HMAC-SHA256 of
 * the raw body (keyed by `secret`) matches `signature`. With no secret/sig,
 * returns true off-production (dev convenience) and false in production.
 */
export function verifyWebhook(input: VerifyInput): boolean {
  const { rawBody, signature, secret } = input;

  if (!secret || !signature) {
    return process.env.NODE_ENV !== "production";
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");

  // Tolerate providers that prefix the scheme, e.g. "sha256=<hex>".
  const provided = signature.includes("=")
    ? signature.split("=").pop() ?? signature
    : signature;

  return safeEqualHex(expected, provided);
}
