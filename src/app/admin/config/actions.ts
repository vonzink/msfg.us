"use server";

import { requireRole } from "@/server/admin/access";
import {
  saveDraft,
  publish,
  rollback,
  getDraftData,
  getPublishedData,
} from "@/server/cms/versioning";
import { mergeConfig } from "@/server/cms/config-form";
import { revalidateCmsTag, configTag } from "@/server/cms/cache";
import { TenantConfigSchema } from "@/content/site";
import { getDb } from "@/lib/db";

/** Merge the editor's section patch over the current config and save it as the draft. */
export async function saveConfigDraftAction(patch: Record<string, unknown>) {
  // Two-layer guard: server actions re-check authorization; do NOT rely on layout alone.
  const ctx = await requireRole("EDITOR");
  // tenantId always comes from the admin context — never from client input.
  const base =
    (await getDraftData(ctx.tenant.id, "CONFIG", "default")) ??
    (await getPublishedData(ctx.tenant.id, "CONFIG", "default")) ??
    {};
  const merged = mergeConfig(base as Record<string, unknown>, patch);
  // Validate through schema — throws on invalid data, surfaced to the editor.
  const parsed = TenantConfigSchema.parse(merged);
  await saveDraft(ctx.tenant.id, "CONFIG", "default", parsed, ctx.user.id);
  await getDb().auditLog.create({
    data: {
      tenantId: ctx.tenant.id,
      userId: ctx.user.id,
      action: "config.save_draft",
    },
  });
  return { ok: true as const };
}

/** Publish the current draft and invalidate the live config cache. */
export async function publishConfigAction() {
  // Two-layer guard: re-check authorization in the action.
  const ctx = await requireRole("EDITOR");
  await publish(ctx.tenant.id, "CONFIG", "default", ctx.user.id);
  // Bust the cached config so the next request re-fetches the published revision.
  revalidateCmsTag(configTag(ctx.tenant.id));
  await getDb().auditLog.create({
    data: {
      tenantId: ctx.tenant.id,
      userId: ctx.user.id,
      action: "config.publish",
    },
  });
  return { ok: true as const };
}

/** Copy a historical version into a new draft (review, then publish). */
export async function rollbackConfigAction(version: number) {
  // Two-layer guard: re-check authorization in the action.
  const ctx = await requireRole("EDITOR");
  await rollback(ctx.tenant.id, "CONFIG", "default", version, ctx.user.id);
  await getDb().auditLog.create({
    data: {
      tenantId: ctx.tenant.id,
      userId: ctx.user.id,
      action: "config.rollback",
      meta: { version },
    },
  });
  return { ok: true as const };
}
