/**
 * POST /api/v1/ai/ask — marketing-chat proxy to the Mortgage Brain.
 *
 * Renders the brain's compliance-locked answer VERBATIM. Tenant-scoped, server-
 * side (no browser→brain), best-effort transcript, graceful fallback. The brain
 * is selected per tenant (config.ai.brain); when disabled/unreachable we return a
 * compliant fallback that escalates to a loan officer — never a fabricated answer.
 *
 * Node runtime (Prisma + outbound fetch), never statically cached.
 */
import { z } from "zod";
import { getMortgageBrain } from "@/server/ai/brain";
import { unavailableAnswer, type BrainAnswer } from "@/server/ai/brain/types";
import { checkRateLimit } from "@/server/ai/brain/rateLimit";
import {
  findOrCreateBrainSession,
  nextOrderIndex,
  appendMessage,
} from "@/server/ai/transcript";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AskBody = z.object({
  sessionId: z.string().min(1).max(255),
  question: z.string().min(1).max(2000),
  conversationId: z.string().optional(),
  loanType: z.string().max(50).optional(),
  state: z.string().max(2).optional(),
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** First IP from X-Forwarded-For (real client behind our proxy), else X-Real-IP. */
function clientIpOf(req: Request): string | undefined {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || undefined;
  return req.headers.get("x-real-ip") ?? undefined;
}

export async function POST(req: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json({ error: "Invalid request body.", kind: "validation" }, 400);
  }

  const parsed = AskBody.safeParse(raw);
  if (!parsed.success) {
    return json({ error: "question and sessionId are required.", kind: "validation" }, 400);
  }
  const input = parsed.data;
  const clientIp = clientIpOf(req);

  // Our own per-process guard (the brain also rate-limits per IP).
  const rlKey = `${input.sessionId}:${clientIp ?? "noip"}`;
  if (!checkRateLimit(rlKey, Date.now()).allowed) {
    return json(
      { error: "You're asking questions quickly — give it a few seconds.", kind: "rate_limited" },
      429,
    );
  }

  const brain = await getMortgageBrain();
  if (!brain) {
    // Disabled/unconfigured → compliant fallback (200 so the widget renders it).
    return json(unavailableAnswer());
  }

  const result = await brain.ask({ ...input, clientIp });

  if (!result.ok) {
    const status =
      result.kind === "validation" ? 400 : result.kind === "rate_limited" ? 429 : 503;
    return json({ error: result.message, kind: result.kind }, status);
  }

  // Best-effort transcript (never blocks the answer).
  await recordTurn(input.question, result.answer);

  return json(result.answer);
}

/** Thread the Q&A into a ChatSession keyed by the brain conversationId. */
async function recordTurn(question: string, answer: BrainAnswer): Promise<void> {
  try {
    const sessionId = await findOrCreateBrainSession(answer.conversationId, {
      surface: "homepage-widget",
    });
    if (!sessionId) return;
    const base = await nextOrderIndex(sessionId);
    await appendMessage(sessionId, "user", question, base);
    await appendMessage(sessionId, "assistant", answer.answer, base + 1);
  } catch {
    // best-effort — recording must never affect the response
  }
}
