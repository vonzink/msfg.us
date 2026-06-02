/**
 * In-memory token-bucket rate limiter for the public partner API.
 *
 * Keyed by (apiKeyId || client IP). The bucket holds up to `rpm` tokens and
 * refills continuously at `rpm` tokens/minute; each request costs one token.
 * When empty, the request is limited and a `Retry-After` (seconds) is returned.
 *
 * NOTE: this state lives in process memory, so on a serverless platform it is
 * PER-INSTANCE — each cold/warm instance keeps its own buckets, so the
 * effective global limit is (rpm × instances). That is acceptable for an MVP /
 * abuse-dampener. The production upgrade is a DISTRIBUTED limiter backed by a
 * shared store (e.g. Upstash Redis or a Postgres counter) so the limit is
 * enforced globally; swap the implementation behind `checkRateLimit` then.
 *
 * Server-only.
 */
import { serverEnv } from "@/lib/env";

interface Bucket {
  /** Fractional tokens currently available. */
  tokens: number;
  /** Epoch ms of the last refill calculation. */
  updatedAt: number;
}

/** Per-key buckets. Module-level so they persist across requests in-instance. */
const buckets = new Map<string, Bucket>();

/** Periodically drop idle buckets so the map can't grow unbounded. */
const IDLE_EVICT_MS = 10 * 60_000; // 10 minutes
let lastSweep = 0;
function maybeSweep(now: number): void {
  if (now - lastSweep < IDLE_EVICT_MS) return;
  lastSweep = now;
  for (const [k, b] of buckets) {
    if (now - b.updatedAt > IDLE_EVICT_MS) buckets.delete(k);
  }
}

/** The outcome of a rate-limit check + the headers to surface. */
export interface RateLimitResult {
  /** Whether the request is allowed. */
  allowed: boolean;
  /** Configured max requests per minute (the bucket capacity). */
  limit: number;
  /** Whole tokens remaining after this request. */
  remaining: number;
  /** Unix seconds when the bucket is expected to be full again. */
  reset: number;
  /** Seconds to wait before retrying (only meaningful when !allowed). */
  retryAfter: number;
}

/**
 * Consume one token for `identifier`. Pure-ish: mutates the in-memory bucket
 * and returns the decision plus header values. `rpm` defaults to
 * `PUBLIC_API_RATE_RPM` (env, default 60).
 */
export function checkRateLimit(
  identifier: string,
  rpm: number = serverEnv.PUBLIC_API_RATE_RPM,
): RateLimitResult {
  const now = Date.now();
  maybeSweep(now);

  const capacity = rpm;
  const refillPerMs = rpm / 60_000; // tokens per millisecond

  let bucket = buckets.get(identifier);
  if (!bucket) {
    bucket = { tokens: capacity, updatedAt: now };
    buckets.set(identifier, bucket);
  } else {
    // Refill based on elapsed time, capped at capacity.
    const elapsed = now - bucket.updatedAt;
    bucket.tokens = Math.min(capacity, bucket.tokens + elapsed * refillPerMs);
    bucket.updatedAt = now;
  }

  const allowed = bucket.tokens >= 1;
  if (allowed) bucket.tokens -= 1;

  const remaining = Math.max(0, Math.floor(bucket.tokens));
  // Seconds until the bucket would be full again from its current level.
  const tokensToFull = capacity - bucket.tokens;
  const msToFull = tokensToFull / refillPerMs;
  const reset = Math.ceil((now + msToFull) / 1000);
  // Seconds until at least one token is available again.
  const retryAfter = allowed ? 0 : Math.max(1, Math.ceil((1 - bucket.tokens) / refillPerMs / 1000));

  return { allowed, limit: capacity, remaining, reset, retryAfter };
}

/**
 * Derive a stable client identifier for limiting: the resolved API key id when
 * present, else the client IP from the usual proxy headers, else "anonymous".
 */
export function clientIdentifier(
  req: Request,
  apiKeyId?: string,
): string {
  if (apiKeyId) return `key:${apiKeyId}`;
  const fwd = req.headers.get("x-forwarded-for");
  const ip =
    (fwd ? fwd.split(",")[0]?.trim() : null) ??
    req.headers.get("x-real-ip") ??
    "anonymous";
  return `ip:${ip}`;
}

/** Build the standard rate-limit headers from a result. */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(result.reset),
  };
  if (!result.allowed) headers["Retry-After"] = String(result.retryAfter);
  return headers;
}
