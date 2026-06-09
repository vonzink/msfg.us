"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/server/admin/access";
import { getDb } from "@/lib/db";
import { fetchOfficersMarkdown } from "@/server/officers/s3";
import { parseOfficerMarkdown } from "@/server/officers/parseOfficers";
import { planOfficerSync } from "@/server/officers/sync";

/**
 * Re-import the loan-officer roster from S3 markdown. EDITOR-gated. Writes use
 * getDb() with an explicit tenantId — the tenant-scoped client bans upsert
 * (unique-by-where) to prevent cross-tenant leakage.
 */
export async function importOfficersFromS3Action() {
  const ctx = await requireRole("EDITOR");
  const parsed = parseOfficerMarkdown(await fetchOfficersMarkdown());
  if (parsed.length === 0) throw new Error("No officers parsed from the S3 roster.");

  const db = getDb();
  const existing = await db.loanOfficer.findMany({
    where: { tenantId: ctx.tenant.id },
    select: { nmls: true },
  });
  const plan = planOfficerSync(
    parsed,
    existing.map((e) => e.nmls),
  );

  for (const up of plan.upserts) {
    await db.loanOfficer.upsert({
      where: { tenantId_nmls: { tenantId: ctx.tenant.id, nmls: up.nmls } },
      update: up.data,
      create: { tenantId: ctx.tenant.id, nmls: up.nmls, ...up.data },
    });
  }
  if (plan.deactivateNmls.length > 0) {
    await db.loanOfficer.updateMany({
      where: { tenantId: ctx.tenant.id, nmls: { in: plan.deactivateNmls } },
      data: { active: false },
    });
  }

  await db.auditLog.create({
    data: { tenantId: ctx.tenant.id, userId: ctx.user.id, action: "officers.import_s3" },
  });
  revalidatePath("/loan-officers");
  return {
    ok: true as const,
    imported: plan.upserts.length,
    deactivated: plan.deactivateNmls.length,
  };
}
