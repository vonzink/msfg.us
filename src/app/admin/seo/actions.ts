"use server";

import { requireRole } from "@/server/admin/access";
import {
  saveDraft,
  publish,
  rollback,
  getDraftData,
  getPublishedData,
} from "@/server/cms/versioning";
import { seoTag, revalidateCmsTag } from "@/server/cms/cache";
import { getDb } from "@/lib/db";
import { PageSeoSchema } from "@/server/cms/seo";
import { isSeoRoute } from "./routes";

function assertRoute(path: string): void {
  if (!isSeoRoute(path)) throw new Error(`Unknown SEO route: ${path}`);
}

/** Merge the editor's SEO patch over the current draft/published data and save it as the draft. */
export async function saveSeoDraftAction(path: string, patch: Record<string, unknown>) {
  // Route guard BEFORE authorization — fail fast on bogus paths.
  assertRoute(path);
  // Two-layer guard: server actions re-check authorization; do NOT rely on layout alone.
  const ctx = await requireRole("EDITOR");
  // tenantId always comes from the admin context — never from client input.
  const base =
    (await getDraftData(ctx.tenant.id, "PAGE_SEO", path)) ??
    (await getPublishedData(ctx.tenant.id, "PAGE_SEO", path)) ??
    {};
  // Validate through schema — throws on invalid data, surfaced to the editor.
  const parsed = PageSeoSchema.parse({ ...(base as object), ...patch });
  await saveDraft(ctx.tenant.id, "PAGE_SEO", path, parsed, ctx.user.id);
  await getDb().auditLog.create({
    data: {
      tenantId: ctx.tenant.id,
      userId: ctx.user.id,
      action: "seo.save_draft",
      meta: { path },
    },
  });
  return { ok: true as const };
}

/** Publish the current SEO draft and invalidate the live per-path cache. */
export async function publishSeoAction(path: string) {
  assertRoute(path);
  // Two-layer guard: re-check authorization in the action.
  const ctx = await requireRole("EDITOR");
  await publish(ctx.tenant.id, "PAGE_SEO", path, ctx.user.id);
  // Bust the cached SEO data so the next request re-fetches the published revision.
  revalidateCmsTag(seoTag(ctx.tenant.id, path));
  await getDb().auditLog.create({
    data: {
      tenantId: ctx.tenant.id,
      userId: ctx.user.id,
      action: "seo.publish",
      meta: { path },
    },
  });
  return { ok: true as const };
}

/** Copy a historical SEO version into a new draft (review, then publish). */
export async function rollbackSeoAction(path: string, version: number) {
  assertRoute(path);
  // Two-layer guard: re-check authorization in the action.
  const ctx = await requireRole("EDITOR");
  await rollback(ctx.tenant.id, "PAGE_SEO", path, version, ctx.user.id);
  await getDb().auditLog.create({
    data: {
      tenantId: ctx.tenant.id,
      userId: ctx.user.id,
      action: "seo.rollback",
      meta: { path, version },
    },
  });
  return { ok: true as const };
}
