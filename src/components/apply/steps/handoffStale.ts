/** Safety window for a pre-warmed hand-off token: 8 minutes, 2 minutes under the
 *  10-minute JWT TTL minted by mintHandoffToken (handoffToken.ts). Past this we
 *  re-mint on the Continue click rather than navigate with a near-expired token. */
export const HANDOFF_STALE_MS = 8 * 60 * 1000;

/**
 * Pure predicate: should the warmed token be discarded and re-minted before
 * navigating? A null `mintedAt` (token never warmed) is always stale. Otherwise
 * stale once `now - mintedAt` reaches `ttlMs` (default {@link HANDOFF_STALE_MS}).
 */
export function isHandoffTokenStale(
  mintedAt: number | null,
  now: number,
  ttlMs: number = HANDOFF_STALE_MS,
): boolean {
  if (mintedAt === null) return true;
  return now - mintedAt >= ttlMs;
}
