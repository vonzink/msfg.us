import "server-only";
import type { Prisma, EditableKind } from "@prisma/client";
import { getDb } from "@/lib/db";
import { nextVersion, findDraft, findPublished } from "./revisions";

/**
 * The CMS versioning service: the single access path to Editable/Revision rows.
 * Always filtered by an explicit `tenantId` (cache-safe — no request context),
 * uses the base Prisma client (NOT getTenantDb), and only mutates rows it read
 * within the tenant. Cross-tenant isolation is enforced by explicit tenantId on
 * every query.
 */

/** Upsert the Editable record for a (tenantId, kind, key) triple. */
async function ensureEditable(tenantId: string, kind: EditableKind, key: string) {
  return getDb().editable.upsert({
    where: { tenantId_kind_key: { tenantId, kind, key } },
    update: {},
    create: { tenantId, kind, key },
  });
}

/** Latest PUBLISHED revision's `data`, or null. */
export async function getPublishedData<T = unknown>(
  tenantId: string,
  kind: EditableKind,
  key: string,
): Promise<T | null> {
  const ed = await getDb().editable.findUnique({
    where: { tenantId_kind_key: { tenantId, kind, key } },
    select: { id: true },
  });
  if (!ed) return null;
  const rev = await getDb().revision.findFirst({
    where: { tenantId, editableId: ed.id, state: "PUBLISHED" },
    orderBy: { version: "desc" },
  });
  return (rev?.data as T) ?? null;
}

/** Latest DRAFT revision's `data`, or null. */
export async function getDraftData<T = unknown>(
  tenantId: string,
  kind: EditableKind,
  key: string,
): Promise<T | null> {
  const ed = await getDb().editable.findUnique({
    where: { tenantId_kind_key: { tenantId, kind, key } },
    select: { id: true },
  });
  if (!ed) return null;
  const rev = await getDb().revision.findFirst({
    where: { tenantId, editableId: ed.id, state: "DRAFT" },
    orderBy: { version: "desc" },
  });
  return (rev?.data as T) ?? null;
}

/** Create the single DRAFT (or update it if one already exists). */
export async function saveDraft(
  tenantId: string,
  kind: EditableKind,
  key: string,
  data: unknown,
  authorId?: string,
  note?: string,
) {
  const ed = await ensureEditable(tenantId, kind, key);
  const revisions = await getDb().revision.findMany({ where: { tenantId, editableId: ed.id } });
  const draft = findDraft(revisions);
  const json = data as Prisma.InputJsonValue;
  if (draft) {
    return getDb().revision.update({
      where: { id: draft.id },
      data: { data: json, authorId: authorId ?? draft.authorId, note: note ?? draft.note },
    });
  }
  return getDb().revision.create({
    data: {
      tenantId,
      editableId: ed.id,
      version: nextVersion(revisions),
      state: "DRAFT",
      data: json,
      authorId: authorId ?? null,
      note: note ?? null,
    },
  });
}

/** Promote the current DRAFT to PUBLISHED; archive the prior PUBLISHED. */
export async function publish(
  tenantId: string,
  kind: EditableKind,
  key: string,
  authorId?: string,
) {
  const ed = await ensureEditable(tenantId, kind, key);
  const revisions = await getDb().revision.findMany({ where: { tenantId, editableId: ed.id } });
  const draft = findDraft(revisions);
  if (!draft) throw new Error("No draft to publish");
  const prev = findPublished(revisions);
  const ops = [
    getDb().revision.update({
      where: { id: draft.id },
      data: { state: "PUBLISHED", publishedAt: new Date(), authorId: authorId ?? draft.authorId },
    }),
    ...(prev
      ? [getDb().revision.update({ where: { id: prev.id }, data: { state: "ARCHIVED" } })]
      : []),
  ];
  const [published] = await getDb().$transaction(ops);
  return published;
}

/** Full revision history (newest first). */
export async function listHistory(tenantId: string, kind: EditableKind, key: string) {
  const ed = await getDb().editable.findUnique({
    where: { tenantId_kind_key: { tenantId, kind, key } },
    select: { id: true },
  });
  if (!ed) return [];
  return getDb().revision.findMany({
    where: { tenantId, editableId: ed.id },
    orderBy: { version: "desc" },
  });
}

/** Copy a historical revision's data into a new/updated DRAFT (review then publish). */
export async function rollback(
  tenantId: string,
  kind: EditableKind,
  key: string,
  toVersion: number,
  authorId?: string,
) {
  const ed = await ensureEditable(tenantId, kind, key);
  const revisions = await getDb().revision.findMany({ where: { tenantId, editableId: ed.id } });
  const target = revisions.find((r) => r.version === toVersion);
  if (!target) throw new Error(`No revision v${toVersion}`);
  const note = `Rolled back to v${toVersion}`;
  const draft = findDraft(revisions);
  const json = target.data as Prisma.InputJsonValue;
  if (draft) {
    return getDb().revision.update({
      where: { id: draft.id },
      data: { data: json, authorId: authorId ?? null, note },
    });
  }
  return getDb().revision.create({
    data: {
      tenantId,
      editableId: ed.id,
      version: nextVersion(revisions),
      state: "DRAFT",
      data: json,
      authorId: authorId ?? null,
      note,
    },
  });
}
