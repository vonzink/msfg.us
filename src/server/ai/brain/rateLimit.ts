/**
 * In-memory sliding-window rate limiter for the brain proxy. Per-process — adequate
 * for the current single-instance pm2/EC2 deploy; revisit if the app scales
 * horizontally (move to Redis/DB). Keyed by sessionId+IP. This is OUR guard; the
 * brain also rate-limits per IP (see the integration spec).
 */
const WINDOW_MS = 60_000;
const MAX_IN_WINDOW = 8;

const hits = new Map<string, number[]>();

export function checkRateLimit(
  key: string,
  now: number,
  max: number = MAX_IN_WINDOW,
  windowMs: number = WINDOW_MS,
): { allowed: boolean } {
  const cutoff = now - windowMs;
  const recent = (hits.get(key) ?? []).filter((t) => t > cutoff);
  if (recent.length >= max) {
    hits.set(key, recent);
    return { allowed: false };
  }
  recent.push(now);
  hits.set(key, recent);
  return { allowed: true };
}

/** Test seam: clear all counters. */
export function __resetRateLimit(): void {
  hits.clear();
}
