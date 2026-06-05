/** Pure selectors over a list of revisions. No DB, no I/O — unit-tested. */

/** The next version number = current max + 1 (1 when there are none). */
export function nextVersion(revisions: { version: number }[]): number {
  return revisions.reduce((max, r) => Math.max(max, r.version), 0) + 1;
}

/** The live revision: highest-version PUBLISHED, or null. */
export function findPublished<T extends { version: number; state: string }>(
  revisions: T[],
): T | null {
  return (
    revisions
      .filter((r) => r.state === "PUBLISHED")
      .sort((a, b) => b.version - a.version)[0] ?? null
  );
}

/** The working draft: highest-version DRAFT, or null. */
export function findDraft<T extends { version: number; state: string }>(
  revisions: T[],
): T | null {
  return (
    revisions
      .filter((r) => r.state === "DRAFT")
      .sort((a, b) => b.version - a.version)[0] ?? null
  );
}
