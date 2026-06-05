/**
 * Best-effort chat recording for MSFG AI (quality & compliance).
 *
 * Every helper here is fire-and-forget safe: it swallows its own errors and
 * returns gracefully so a DB hiccup (or no DB at all) NEVER blocks or fails the
 * chat. The chat route awaits these only to sequence orderIndex correctly; a
 * rejection is impossible because each catch returns instead of throwing.
 *
 * Server-only — imports the tenant-scoped Prisma client via getTenantDb().
 */
import type { Prisma } from "@prisma/client";
import { getTenantDb } from "@/lib/db";

export type TranscriptRole = "user" | "assistant" | "tool";

// The tenant-scoping extension injects `tenantId` into every create at runtime
// (see src/server/tenant/scoping.ts). Prisma's generated create types can't see
// that, so they still require tenantId statically — we type each create payload
// as the create input MINUS tenantId (keeps full field-checking on the fields we
// pass) and cast at the call boundary.
type ChatSessionData = Omit<Prisma.ChatSessionCreateInput, "tenantId">;
type ChatMessageData = Omit<Prisma.ChatMessageUncheckedCreateInput, "tenantId">;

/**
 * Create a ChatSession row and return its id, or null if persistence failed /
 * is unavailable. Callers treat a null id as "recording disabled" and simply
 * skip subsequent appends.
 */
export async function createChatSession(
  metadata?: Record<string, unknown>,
): Promise<string | null> {
  try {
    const db = await getTenantDb();
    const data: ChatSessionData = {
      metadata: metadata ? (metadata as object) : undefined,
    };
    const session = await db.chatSession.create({
      data: data as Prisma.ChatSessionCreateInput,
    });
    return session.id;
  } catch (err) {
    console.error("[ai/transcript] createChatSession failed:", err);
    return null;
  }
}

/**
 * Find the ChatSession recording a given brain conversation, or create one.
 * Threads multi-turn brain conversations into a single session, keyed by the
 * brain's `conversationId` (stored in `metadata`). Best-effort: returns null on
 * any failure so recording never blocks the answer.
 */
export async function findOrCreateBrainSession(
  conversationId: string,
  metadata?: Record<string, unknown>,
): Promise<string | null> {
  try {
    const db = await getTenantDb();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = await db.chatSession.findFirst({
      where: { metadata: { path: ["conversationId"], equals: conversationId } } as any,
      select: { id: true },
    });
    if (existing) return existing.id;
    return await createChatSession({ ...metadata, conversationId });
  } catch (err) {
    console.error("[ai/transcript] findOrCreateBrainSession failed:", err);
    return null;
  }
}

/** Next orderIndex for a session (count of existing messages). 0 on error/null. */
export async function nextOrderIndex(sessionId: string | null): Promise<number> {
  if (!sessionId) return 0;
  try {
    const db = await getTenantDb();
    return await db.chatMessage.count({ where: { chatSessionId: sessionId } });
  } catch {
    return 0;
  }
}

/**
 * Append one message to a session. No-ops when sessionId is null. `toolName`
 * is recorded for tool rows. Returns nothing — failures are logged, never
 * surfaced.
 */
export async function appendMessage(
  sessionId: string | null,
  role: TranscriptRole,
  content: string,
  orderIndex: number,
  toolName?: string,
): Promise<void> {
  if (!sessionId) return;
  try {
    const db = await getTenantDb();
    const data: ChatMessageData = {
      chatSessionId: sessionId,
      role,
      content,
      orderIndex,
      toolName: toolName ?? null,
    };
    await db.chatMessage.create({
      data: data as Prisma.ChatMessageUncheckedCreateInput,
    });
  } catch (err) {
    console.error("[ai/transcript] appendMessage failed:", err);
  }
}

/**
 * Link a captured lead to the session (set when the capture_lead tool runs).
 * Best-effort; safe to call with a null sessionId.
 */
export async function linkLeadToSession(
  sessionId: string | null,
  leadId: string,
): Promise<void> {
  if (!sessionId) return;
  try {
    const db = await getTenantDb();
    // Scoped client BANS `update` (its unique where can't be tenant-guarded);
    // updateMany carries a tenant-scoped where and we don't need the row back.
    await db.chatSession.updateMany({
      where: { id: sessionId },
      data: { leadId },
    });
  } catch (err) {
    console.error("[ai/transcript] linkLeadToSession failed:", err);
  }
}
