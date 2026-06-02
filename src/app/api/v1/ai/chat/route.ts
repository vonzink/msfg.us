/**
 * POST /api/v1/ai/chat — streaming MSFG AI assistant (Claude API).
 *
 * Body: { sessionId?: string, messages: Array<{role:"user"|"assistant", content:string}> }
 *
 * Behavior:
 *  - If the assistant isn't configured (no ANTHROPIC_API_KEY) → 200 SSE stream
 *    with a single friendly "unavailable" text + done, so the UI degrades.
 *  - Otherwise run a MANUAL agentic tool loop: stream each model turn, get
 *    finalMessage(), execute any tool_use blocks server-side, append the
 *    assistant turn + tool_result turn, and loop until stop_reason="end_turn".
 *  - Streams Server-Sent Events to the client:
 *      data: {"type":"text","value":"..."}   text deltas (thinking ignored)
 *      data: {"type":"tool","name":"..."}     a tool started executing
 *      data: {"type":"session","sessionId":"..."}  recording session id
 *      data: {"type":"done"}                   end of turn
 *      data: {"type":"error"}                  failure
 *  - Records the transcript (user msg + assistant text + tool names) best-effort.
 *
 * Node runtime (Prisma + SDK), never statically cached.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { AnthropicError } from "@anthropic-ai/sdk";
import { aiConfigured } from "@/lib/env";
import { SITE } from "@/content/site";
import { SYSTEM_PROMPT } from "@/server/ai/prompt";
import { TOOLS, runTool } from "@/server/ai/tools";
import { getAnthropic, AI_MODEL, AI_MAX_TOKENS } from "@/server/ai/client";
import {
  createChatSession,
  appendMessage,
  type TranscriptRole,
} from "@/server/ai/transcript";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const encoder = new TextEncoder();

/** Serialize one SSE event line. */
function sse(data: Record<string, unknown>): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(data)}\n\n`);
}

const SSE_HEADERS: HeadersInit = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
};

type ClientMessage = { role: "user" | "assistant"; content: string };

/** Validate + normalize the inbound messages array. */
function parseMessages(value: unknown): ClientMessage[] | null {
  if (!Array.isArray(value)) return null;
  const out: ClientMessage[] = [];
  for (const m of value) {
    if (!m || typeof m !== "object") return null;
    const role = (m as Record<string, unknown>).role;
    const content = (m as Record<string, unknown>).content;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") {
      return null;
    }
    if (content.trim()) out.push({ role, content });
  }
  return out;
}

/** Friendly text shown when the assistant is unavailable / errors. */
const UNAVAILABLE_TEXT = `The assistant isn't available right now — call us at ${SITE.phoneDisplay} or start your application.`;

/** One-shot SSE stream that emits a single text message then done. */
function staticStream(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(sse({ type: "text", value: text }));
      controller.enqueue(sse({ type: "done" }));
      controller.close();
    },
  });
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(staticStream(UNAVAILABLE_TEXT), { headers: SSE_HEADERS });
  }

  const messages = parseMessages((body as Record<string, unknown>)?.messages);
  if (!messages || messages.length === 0) {
    return new Response(
      staticStream("I didn't catch that — could you rephrase your question?"),
      { headers: SSE_HEADERS },
    );
  }

  // No key → graceful degraded path (still a 200 SSE stream the UI can read).
  if (!aiConfigured()) {
    return new Response(staticStream(UNAVAILABLE_TEXT), { headers: SSE_HEADERS });
  }

  const client = getAnthropic();

  // Build the conversation for the API. The SDK accepts string content for
  // simple turns; we promote to block arrays as the tool loop appends.
  const convo: Anthropic.MessageParam[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Reuse the caller's recording session if provided, else start one.
      const incomingSessionId =
        typeof (body as Record<string, unknown>)?.sessionId === "string"
          ? ((body as Record<string, unknown>).sessionId as string)
          : undefined;
      let sessionId: string | null = incomingSessionId ?? null;
      if (!sessionId) {
        sessionId = await createChatSession({ surface: "homepage-widget" });
      }
      if (sessionId) {
        controller.enqueue(sse({ type: "session", sessionId }));
      }

      // Track transcript ordering; persistence is best-effort throughout.
      let order = 0;
      const record = (role: TranscriptRole, content: string, tool?: string) =>
        appendMessage(sessionId, role, content, order++, tool);

      // Record the latest user turn (the tail of the inbound history).
      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      if (lastUser) await record("user", lastUser.content);

      try {
        // System prompt as a single cacheable text block (stable prefix).
        const system: Anthropic.TextBlockParam[] = [
          {
            type: "text",
            text: SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ];

        // Manual agentic loop. Bounded to avoid any unbounded tool cycling.
        const MAX_TURNS = 8;
        for (let turn = 0; turn < MAX_TURNS; turn++) {
          const modelStream = client.messages.stream({
            model: AI_MODEL,
            max_tokens: AI_MAX_TOKENS,
            thinking: { type: "adaptive" },
            system,
            tools: TOOLS,
            messages: convo,
          });

          // Stream TEXT deltas only — ignore thinking deltas.
          modelStream.on("text", (delta) => {
            if (delta) controller.enqueue(sse({ type: "text", value: delta }));
          });

          const finalMessage = await modelStream.finalMessage();

          // Persist any assistant text from this turn.
          const assistantText = finalMessage.content
            .filter((b): b is Anthropic.TextBlock => b.type === "text")
            .map((b) => b.text)
            .join("");
          if (assistantText.trim()) await record("assistant", assistantText);

          // Done — model produced a normal end-of-turn answer.
          if (finalMessage.stop_reason !== "tool_use") break;

          // Append the assistant turn (full content preserves tool_use blocks).
          convo.push({ role: "assistant", content: finalMessage.content });

          // Execute each tool_use block server-side, in order.
          const toolUses = finalMessage.content.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
          );
          const toolResults: Anthropic.ToolResultBlockParam[] = [];
          for (const tu of toolUses) {
            controller.enqueue(sse({ type: "tool", name: tu.name }));
            const result = await runTool(tu.name, tu.input);
            await record("tool", result, tu.name);
            toolResults.push({
              type: "tool_result",
              tool_use_id: tu.id,
              content: result,
            });
          }

          // Feed results back as the next user turn and loop.
          convo.push({ role: "user", content: toolResults });
        }

        controller.enqueue(sse({ type: "done" }));
      } catch (err) {
        // Typed SDK errors are logged with status; client just sees a friendly
        // error + a final text fallback so the bubble isn't left empty.
        if (err instanceof AnthropicError) {
          const status =
            "status" in err ? (err as { status?: number }).status : undefined;
          console.error(`[ai/chat] Anthropic error${status ? ` ${status}` : ""}:`, err.message);
        } else {
          console.error("[ai/chat] stream error:", err);
        }
        controller.enqueue(sse({ type: "text", value: UNAVAILABLE_TEXT }));
        controller.enqueue(sse({ type: "error" }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
