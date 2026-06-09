import "server-only";
import { getTenantDb } from "@/lib/db";
import { OFFICERS, type Officer } from "@/content/officers";
import { rowToOfficer } from "@/server/officers/map";

/**
 * Active officers for the current tenant, ordered by sortOrder. Falls back to
 * the bundled OFFICERS content when the table is empty (fresh/un-seeded env),
 * so the public page never renders blank.
 */
export async function listOfficers(): Promise<Officer[]> {
  const db = await getTenantDb();
  const rows = await db.loanOfficer.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
  });
  return rows.length === 0 ? OFFICERS : rows.map(rowToOfficer);
}
