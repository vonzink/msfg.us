/**
 * Per-provider inbound webhook signature verification.
 *
 * Generic providers use HMAC-SHA256 of the raw body keyed by a shared secret
 * (`verifyWebhook`). GHL is special-cased (`verifyGhlWebhook`) because
 * LeadConnector marketplace webhooks are asymmetrically signed — RSA-SHA256
 * over the raw body in the legacy `X-WH-Signature` header, and Ed25519 in the
 * current `X-GHL-Signature` header — with public keys published by HighLevel.
 * GHL also supports a shared-secret HMAC mode for custom/automation webhooks.
 * The active mode is selected by which env is set; with none configured, GHL
 * inbound is DISABLED.
 *
 * Public keys, header names (`X-GHL-Signature` Ed25519 / `X-WH-Signature`
 * RSA-SHA256), algorithms, and the base64 signature encoding were verified
 * against HighLevel's Webhook Integration Guide
 * (marketplace.gohighlevel.com/docs/webhook/WebhookIntegrationGuide) and the
 * keys were confirmed to parse + round-trip with node:crypto. The legacy RSA
 * header is slated for deprecation 2026-07-01; we verify whichever header is
 * present, preferring Ed25519.
 */
import crypto from "node:crypto";
import { serverEnv } from "@/lib/env";

export interface VerifyInput {
  provider: string;
  /** Exact raw request body (pre-JSON-parse) — required for any signature. */
  rawBody: string;
  /** Signature header value, if the provider sent one (generic HMAC path). */
  signature: string | null;
  /** Shared secret for this provider, if configured (generic HMAC path). */
  secret?: string;
}

/** Outcome of a verification attempt. */
export interface VerifyResult {
  ok: boolean;
  /** Why verification passed/failed, for logging (never sent to the client). */
  reason?: string;
}

// --- HighLevel published public keys (defaults; override via env) ----------
// Source: HighLevel Webhook Integration Guide → "Verifying Webhook
// Authenticity". These are PUBLIC keys (safe to embed) — they only let us
// verify GHL's signatures, never forge them.

/** Current Ed25519 public key for the `X-GHL-Signature` header. */
const GHL_ED25519_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAi2HR1srL4o18O8BRa7gVJY7G7bupbN3H9AwJrHCDiOg=
-----END PUBLIC KEY-----`;

/** Legacy RSA public key for the `X-WH-Signature` header (deprecates 2026-07-01). */
const GHL_RSA_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAokvo/r9tVgcfZ5DysOSC
Frm602qYV0MaAiNnX9O8KxMbiyRKWeL9JpCpVpt4XHIcBOK4u3cLSqJGOLaPuXw6
dO0t6Q/ZVdAV5Phz+ZtzPL16iCGeK9po6D6JHBpbi989mmzMryUnQJezlYJ3DVfB
csedpinheNnyYeFXolrJvcsjDtfAeRx5ByHQmTnSdFUzuAnC9/GepgLT9SM4nCpv
uxmZMxrJt5Rw+VUaQ9B8JSvbMPpez4peKaJPZHBbU3OdeCVx5klVXXZQGNHOs8gF
3kvoV5rTnXV0IknLBXlcKKAQLZcY/Q9rG6Ifi9c+5vqlvHPCUJFT5XUGG5RKgOKU
J062fRtN+rLYZUV+BjafxQauvC8wSWeYja63VSUruvmNj8xkx2zE/Juc+yjLjTXp
IocmaiFeAO6fUtNjDeFVkhf5LNb59vECyrHD2SQIrhgXpO4Q3dVNA5rw576PwTzN
h/AMfHKIjE4xQA1SZuYJmNnmVZLIZBlQAF9Ntd03rfadZ+yDiOXCCs9FkHibELhC
HULgCsnuDJHcrGNd5/Ddm5hxGQ0ASitgHeMZ0kcIOwKDOzOU53lDza6/Y09T7sYJ
PQe7z0cvj7aE4B+Ax1ZoZGPzpJlZtGXCsu9aTEGEnKzmsFqwcSsnw3JB31IGKAyk
T1hhTiaCeIY/OwwwNUY2yvcCAwEAAQ==
-----END PUBLIC KEY-----`;

/** Constant-time compare of two hex digests. */
function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ab.length !== bb.length || ab.length === 0) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/** Strip a "scheme=" prefix some providers add, e.g. "sha256=<hex>". */
function stripScheme(signature: string): string {
  return signature.includes("=") && !signature.endsWith("=")
    ? signature.split("=").slice(1).join("=")
    : signature;
}

/**
 * Verify a generic HMAC-SHA256 webhook: hex digest of the raw body keyed by
 * `secret`, compared constant-time. Off-production with no secret/sig it stays
 * permissive (local testing); in production an unsigned/unsecured request is
 * rejected. Used by non-GHL providers.
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

  return safeEqualHex(expected, stripScheme(signature));
}

/**
 * Verify an HMAC-SHA256 signature against a shared secret, tolerating either a
 * hex or base64 digest encoding (GHL custom webhooks vary). Constant-time.
 */
function verifyHmac(
  rawBody: string,
  signature: string,
  secret: string,
): boolean {
  const provided = stripScheme(signature);

  const hex = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");
  if (provided.length === hex.length && safeEqualHex(hex, provided)) {
    return true;
  }

  // Fall back to a base64 comparison of the same digest.
  try {
    const expected = crypto
      .createHmac("sha256", secret)
      .update(rawBody, "utf8")
      .digest();
    const got = Buffer.from(provided, "base64");
    return (
      expected.length === got.length &&
      got.length > 0 &&
      crypto.timingSafeEqual(expected, got)
    );
  } catch {
    return false;
  }
}

/** Verify a base64 RSA-SHA256 signature (legacy `X-WH-Signature`). */
function verifyRsa(rawBody: string, signature: string, pem: string): boolean {
  try {
    const verifier = crypto.createVerify("SHA256");
    verifier.update(rawBody, "utf8");
    verifier.end();
    return verifier.verify(pem, signature, "base64");
  } catch {
    return false;
  }
}

/** Verify a base64 Ed25519 signature (current `X-GHL-Signature`). */
function verifyEd25519(
  rawBody: string,
  signature: string,
  pem: string,
): boolean {
  try {
    const key = crypto.createPublicKey(pem);
    return crypto.verify(
      null,
      Buffer.from(rawBody, "utf8"),
      key,
      Buffer.from(signature, "base64"),
    );
  } catch {
    return false;
  }
}

/** Signature material read off the inbound GHL request. */
export interface GhlSignatureHeaders {
  /** `X-GHL-Signature` — Ed25519, base64. Preferred. */
  ghlSignature: string | null;
  /** `X-WH-Signature` — legacy RSA-SHA256, base64. */
  whSignature: string | null;
  /** Generic HMAC header (`x-wh-signature`/`x-signature`) for shared-secret mode. */
  hmacSignature: string | null;
}

/**
 * Verify an inbound GHL webhook against whichever mode is configured.
 *
 * Precedence:
 *   1. HMAC shared secret (`GHL_WEBHOOK_SECRET`) — the signature header must
 *      HMAC-match the raw body.
 *   2. Public-key verification — Ed25519 `X-GHL-Signature` preferred, else
 *      legacy RSA `X-WH-Signature`, using `GHL_WEBHOOK_PUBLIC_KEY` (override)
 *      or the built-in HighLevel keys. Enabled when an override key is set OR
 *      `GHL_WEBHOOK_PUBLIC_KEY_VERIFY=true`.
 *
 * Returns `{ ok: false }` when no mode is configured (inbound disabled), so the
 * route can skip side effects without 401-ing the sender.
 */
export function verifyGhlWebhook(
  rawBody: string,
  headers: GhlSignatureHeaders,
): VerifyResult {
  const secret = serverEnv.GHL_WEBHOOK_SECRET;
  const overrideKey = serverEnv.GHL_WEBHOOK_PUBLIC_KEY;
  const requirePublicKey = serverEnv.GHL_WEBHOOK_PUBLIC_KEY_VERIFY;

  // Mode 1: shared-secret HMAC.
  if (secret) {
    const sig = headers.hmacSignature ?? headers.whSignature;
    if (!sig) return { ok: false, reason: "hmac: missing signature header" };
    return verifyHmac(rawBody, sig, secret)
      ? { ok: true, reason: "hmac" }
      : { ok: false, reason: "hmac: mismatch" };
  }

  // Mode 2: public-key (RSA / Ed25519).
  if (overrideKey || requirePublicKey) {
    // Prefer the current Ed25519 header.
    if (headers.ghlSignature) {
      const ok = verifyEd25519(
        rawBody,
        headers.ghlSignature,
        overrideKey ?? GHL_ED25519_PUBLIC_KEY,
      );
      return ok
        ? { ok: true, reason: "ed25519" }
        : { ok: false, reason: "ed25519: verify failed" };
    }
    // Fall back to the legacy RSA header during the transition window.
    if (headers.whSignature) {
      const ok = verifyRsa(
        rawBody,
        headers.whSignature,
        overrideKey ?? GHL_RSA_PUBLIC_KEY,
      );
      return ok
        ? { ok: true, reason: "rsa" }
        : { ok: false, reason: "rsa: verify failed" };
    }
    return { ok: false, reason: "public-key: no signature header present" };
  }

  // No mode configured → inbound disabled.
  return {
    ok: false,
    reason: "ghl inbound disabled (no verification configured)",
  };
}
