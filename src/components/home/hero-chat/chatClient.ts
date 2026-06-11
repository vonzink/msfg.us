import type { BrainCitation } from "@/server/ai/brain/types";

/** Wire format for one SSE event from /api/v1/ai/chat (agentic path). */
export type ChatEvent =
  | { type: "session"; sessionId: string }
  | { type: "text"; value: string }
  | { type: "tool"; name: string }
  | { type: "sources"; citations: BrainCitation[]; disclaimer: string; humanEscalationRequired: boolean }
  | { type: "done" }
  | { type: "error" };

export type ChatHistoryMsg = { role: "user" | "assistant"; content: string };

/** Split an SSE buffer into parsed `data:` events + the unterminated tail.
 *  Malformed frames are skipped (keep streaming). Pure — unit-tested. */
export function splitSseFrames(buffer: string): { events: ChatEvent[]; rest: string } {
  const frames = buffer.split("\n\n");
  const rest = frames.pop() ?? "";
  const events: ChatEvent[] = [];
  for (const frame of frames) {
    const line = frame.trim();
    if (!line.startsWith("data:")) continue;
    const jsonStr = line.slice(5).trim();
    if (!jsonStr) continue;
    try {
      events.push(JSON.parse(jsonStr) as ChatEvent);
    } catch {
      // ignore malformed frames; keep streaming
    }
  }
  return { events, rest };
}

/** POST one turn to the agentic chat route and invoke `onEvent` per SSE
 *  event until the stream closes. Throws on a non-OK response so the caller
 *  can render the error turn. */
export async function streamChat(opts: {
  sessionId: string | null;
  messages: ChatHistoryMsg[];
  onEvent: (evt: ChatEvent) => void;
}): Promise<void> {
  const res = await fetch("/api/v1/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId: opts.sessionId ?? undefined, messages: opts.messages }),
  });
  if (!res.ok || !res.body) throw new Error(`chat request failed: ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const { events, rest } = splitSseFrames(buffer);
    buffer = rest;
    for (const evt of events) opts.onEvent(evt);
  }
}
