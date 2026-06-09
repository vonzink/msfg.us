/**
 * POST /api/v1/ai/chat — streaming provider-agnostic assistant (DeepSeek/Claude).
 *
 * PRIMARY front door for the homepage AiWidget: streams grounded mortgage answers
 * via a manual agentic tool loop. The `search_guidelines` tool grounds regulated
 * answers in the Mortgage Brain; the route emits a structured `sources` SSE event
 * (citations + disclaimer + escalation flag) that the widget renders deterministically.
 *
 * Body: { sessionId?: string, messages: Array<{role:"user"|"assistant", content:string}> }
 *
 * Behavior:
 *  - If no AI provider is configured → 200 SSE stream with a single friendly
 *    "unavailable" text + done, so the UI degrades gracefully.
 *  - Otherwise run a MANUAL agentic tool loop: stream each model turn via
 *    provider.streamTurn(), collect text + tool calls, execute any tool calls
 *    server-side, append the neutral AiMessage results, and loop until the
 *    model answers without tools.
 *  - Streams Server-Sent Events to the client (provider-agnostic protocol):
 *      data: {"type":"text","value":"..."}        text deltas
 *      data: {"type":"tool","name":"..."}         a tool started executing
 *      data: {"type":"sources",citations,disclaimer,humanEscalationRequired}
 *                                                 grounded tool citations
 *      data: {"type":"session","sessionId":"..."} recording session id
 *      data: {"type":"done"}                       end of turn
 *      data: {"type":"error"}                      failure
 *  - Records the transcript (user msg + assistant text + tool names) best-effort.
 *
 * Node runtime (Prisma + provider SDK), never statically cached.
 */
import { SITE } from "@/content/site";
import { SYSTEM_PROMPT } from "@/server/ai/prompt";
import { TOOLS, runTool } from "@/server/ai/tools";
import { getAiProvider } from "@/server/ai/providers";
import type { AiMessage } from "@/server/ai/providers/types";
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

  // No provider configured → graceful degraded path (200 SSE the UI can read).
  const provider = await getAiProvider();
  if (!provider) {
    return new Response(staticStream(UNAVAILABLE_TEXT), { headers: SSE_HEADERS });
  }

  // Build neutral history from inbound messages (user/assistant text only).
  // System prompt is passed separately to provider.streamTurn.
  const history: AiMessage[] = messages.map((m) =>
    m.role === "user"
      ? { role: "user" as const, content: m.content }
      : { role: "assistant" as const, content: m.content },
  );

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
          let assistantText = "";
          const pendingToolCalls: Array<{ id: string; name: string; args: string }> = [];

          // Stream one turn from the provider
          for await (const event of provider.streamTurn(SYSTEM_PROMPT, history, TOOLS)) {
            if (event.type === "text") {
              controller.enqueue(sse({ type: "text", value: event.delta }));
              assistantText += event.delta;
            } else if (event.type === "tool_call") {
              pendingToolCalls.push({ id: event.id, name: event.name, args: event.args });
            }
          }

          // Record assistant text (best-effort)
          if (assistantText.trim()) {
            await record("assistant", assistantText);
          }

          // No tool calls → done
          if (pendingToolCalls.length === 0) break;

          // Push neutral assistant-tool-calls message into history
          history.push({
            role: "assistant",
            toolCalls: pendingToolCalls.map((tc) => ({
              id: tc.id,
              name: tc.name,
              args: tc.args,
            })),
          });

          // Execute each tool, stream the tool SSE event, record, and push neutral result
          for (const tc of pendingToolCalls) {
            controller.enqueue(sse({ type: "tool", name: tc.name }));
            // Parse the model's args defensively (matches the pre-refactor route's
            // graceful fallback — a malformed args string must NOT break the loop).
            let parsed: unknown = {};
            try {
              parsed = tc.args ? JSON.parse(tc.args) : {};
            } catch {
              parsed = {};
            }
            // runTool returns { text, sources? }. Feed result.text back to the
            // model as the neutral tool result; when sources are present (the
            // grounded search_guidelines tool) emit a structured `sources` SSE
            // event for the widget. Never JSON.stringify result.text.
            const result = await runTool(tc.name, parsed, sessionId ?? "anon");
            await record("tool", result.text, tc.name);
            if (result.sources) {
              controller.enqueue(
                sse({
                  type: "sources",
                  citations: result.sources.citations,
                  disclaimer: result.sources.disclaimer,
                  humanEscalationRequired: result.sources.humanEscalationRequired,
                }),
              );
            }
            history.push({
              role: "tool",
              toolCallId: tc.id,
              name: tc.name,
              result: result.text,
            });
          }
        }

        controller.enqueue(sse({ type: "done" }));
      } catch (err: unknown) {
        console.error("[chat] provider error:", err instanceof Error ? err.message : err);
        // Match the pre-refactor route: show the friendly fallback text on a
        // mid-stream failure, then signal error so the UI can recover.
        controller.enqueue(sse({ type: "text", value: UNAVAILABLE_TEXT }));
        controller.enqueue(sse({ type: "error" }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
