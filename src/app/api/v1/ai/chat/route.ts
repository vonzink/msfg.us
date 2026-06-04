/**
 * POST /api/v1/ai/chat — streaming MSFG AI assistant (DeepSeek, OpenAI-compatible).
 *
 * Body: { sessionId?: string, messages: Array<{role:"user"|"assistant", content:string}> }
 *
 * Behavior:
 *  - If the assistant isn't configured (no DEEPSEEK_API_KEY) → 200 SSE stream
 *    with a single friendly "unavailable" text + done, so the UI degrades.
 *  - Otherwise run a MANUAL agentic tool loop: stream each model turn, collect
 *    text + tool calls, execute any tool calls server-side, append the assistant
 *    turn + tool result turns, and loop until the model answers without tools.
 *  - Streams Server-Sent Events to the client (provider-agnostic protocol):
 *      data: {"type":"text","value":"..."}        text deltas
 *      data: {"type":"tool","name":"..."}         a tool started executing
 *      data: {"type":"session","sessionId":"..."} recording session id
 *      data: {"type":"done"}                       end of turn
 *      data: {"type":"error"}                      failure
 *  - Records the transcript (user msg + assistant text + tool names) best-effort.
 *
 * Node runtime (Prisma + SDK), never statically cached.
 */
import OpenAI from "openai";
import { aiConfigured } from "@/lib/env";
import { SITE } from "@/content/site";
import { SYSTEM_PROMPT } from "@/server/ai/prompt";
import { TOOLS, runTool } from "@/server/ai/tools";
import { getAiClient, aiModel, AI_MAX_TOKENS } from "@/server/ai/client";
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

/** Accumulator for a streamed tool call (assembled across delta chunks). */
type PendingToolCall = { id: string; name: string; args: string };

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

  const client = getAiClient();

  // Build the conversation: system prompt first, then the client history.
  const convo: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

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
        // Manual agentic loop. Bounded to avoid any unbounded tool cycling.
        const MAX_TURNS = 8;
        for (let turn = 0; turn < MAX_TURNS; turn++) {
          const completion = await client.chat.completions.create({
            model: aiModel(),
            max_tokens: AI_MAX_TOKENS,
            messages: convo,
            tools: TOOLS,
            stream: true,
          });

          let assistantText = "";
          const pending = new Map<number, PendingToolCall>();

          for await (const chunk of completion) {
            const choice = chunk.choices[0];
            if (!choice) continue;
            const delta = choice.delta;
            if (delta?.content) {
              assistantText += delta.content;
              controller.enqueue(sse({ type: "text", value: delta.content }));
            }
            for (const tc of delta?.tool_calls ?? []) {
              const cur = pending.get(tc.index) ?? { id: "", name: "", args: "" };
              if (tc.id) cur.id = tc.id;
              if (tc.function?.name) cur.name = tc.function.name;
              if (tc.function?.arguments) cur.args += tc.function.arguments;
              pending.set(tc.index, cur);
            }
          }

          // Persist any assistant text produced this turn.
          if (assistantText.trim()) await record("assistant", assistantText);

          // No tool calls → the model answered; we're done.
          if (pending.size === 0) break;

          const toolCalls = [...pending.entries()]
            .sort(([a], [b]) => a - b)
            .map(([, c]) => c)
            .filter((c) => c.id && c.name);

          // Append the assistant turn carrying the tool calls (required so the
          // following tool results have matching tool_call_ids).
          convo.push({
            role: "assistant",
            content: assistantText || null,
            tool_calls: toolCalls.map((c) => ({
              id: c.id,
              type: "function",
              function: { name: c.name, arguments: c.args || "{}" },
            })),
          });

          // Execute each tool call server-side, in order, and append results.
          for (const c of toolCalls) {
            controller.enqueue(sse({ type: "tool", name: c.name }));
            let parsed: unknown = {};
            try {
              parsed = c.args ? JSON.parse(c.args) : {};
            } catch {
              parsed = {};
            }
            const result = await runTool(c.name, parsed);
            await record("tool", result, c.name);
            convo.push({
              role: "tool",
              tool_call_id: c.id,
              content: result,
            });
          }
        }

        controller.enqueue(sse({ type: "done" }));
      } catch (err) {
        if (err instanceof OpenAI.APIError) {
          console.error(
            `[ai/chat] DeepSeek API error${err.status ? ` ${err.status}` : ""}:`,
            err.message,
          );
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
