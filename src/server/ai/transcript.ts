/**
 * Best-effort chat recording for MSFG AI (quality & compliance).
 *
 * Every helper here is fire-and-forget safe: it swallows its own errors and
 * returns gracefully so a DB hiccup (or no DB at all) NEVER blocks or fails the
 * chat. The chat route awaits these only to sequence orderIndex correctly; a
 * rejection is impossible because each catch returns instead of throwing.
 *
 * Server-only — imports the Prisma client via getDb().
 */
import { getDb } from "@/lib/db";

export type TranscriptRole = "user" | "assistant" | "tool";

/**
 * Create a ChatSession row and return its id, or null if persistence failed /
 * is unavailable. Callers treat a null id as "recording disabled" and simply
 * skip subsequent appends.
 */
export async function createChatSession(
  metadata?: Record<string, unknown>,
): Promise<string | null> {
  try {
    const db = getDb();
    const session = await db.chatSession.create({
      data: { metadata: metadata ? (metadata as object) : undefined },
    });
    return session.id;
  } catch (err) {
    console.error("[ai/transcript] createChatSession failed:", err);
    return null;
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
    const db = getDb();
    await db.chatMessage.create({
      data: {
        chatSessionId: sessionId,
        role,
        content,
        orderIndex,
        toolName: toolName ?? null,
      },
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
    const db = getDb();
    await db.chatSession.update({
      where: { id: sessionId },
      data: { leadId },
    });
  } catch (err) {
    console.error("[ai/transcript] linkLeadToSession failed:", err);
  }
}
