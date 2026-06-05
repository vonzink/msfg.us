/**
 * OpenAI-compatible provider adapter (works with OpenAI, DeepSeek, Azure, etc.)
 *
 * Translates neutral AiMessage[] + AiTool[] to OpenAI wire types, calls
 * chat.completions.create({stream: true}), and emits neutral AiEvents.
 * Tool-call JSON is assembled from delta.tool_calls[].index-keyed fragments
 * by delta.tool_calls[].index before emit.
 */
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources";
import type { AiProvider, AiMessage, AiTool, AiEvent } from "./types";

const AI_MAX_TOKENS = 2048;

interface Options {
  apiKey: string;
  baseURL: string;
  model: string;
}

export class OpenAICompatibleProvider implements AiProvider {
  private client: OpenAI;
  private model: string;

  constructor({ apiKey, baseURL, model }: Options) {
    this.client = new OpenAI({ apiKey, baseURL });
    this.model = model;
  }

  async *streamTurn(
    system: string,
    messages: AiMessage[],
    tools: AiTool[]
  ): AsyncIterable<AiEvent> {
    // Translate neutral messages → OpenAI wire format
    const openaiMessages: ChatCompletionMessageParam[] = [
      { role: "system", content: system },
    ];

    for (const m of messages) {
      if (m.role === "user") {
        openaiMessages.push({ role: "user", content: m.content });
      } else if (m.role === "assistant" && "content" in m) {
        openaiMessages.push({ role: "assistant", content: m.content });
      } else if (m.role === "assistant" && "toolCalls" in m) {
        openaiMessages.push({
          role: "assistant",
          content: null,
          tool_calls: m.toolCalls.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: { name: tc.name, arguments: tc.args || "{}" },
          })),
        });
      } else if (m.role === "tool") {
        openaiMessages.push({
          role: "tool",
          tool_call_id: m.toolCallId,
          content: m.result,
        });
      }
    }

    // Translate neutral AiTool[] → OpenAI tool format
    const openaiTools = tools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    const stream = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: AI_MAX_TOKENS,
      messages: openaiMessages,
      tools: openaiTools,
      stream: true,
    });

    // Assemble tool_call fragments by index.
    // Each element: { id, name, args (accumulated string) }
    type PartialCall = { id: string; name: string; args: string };
    const partials: Record<number, PartialCall> = {};

    for await (const chunk of stream) {
      const choice = (chunk as { choices: Array<{ delta: { content?: string | null; tool_calls?: Array<{ index: number; id?: string | null; function?: { name?: string | null; arguments?: string | null } }> } }> }).choices[0];
      if (!choice) continue;

      const delta = choice.delta;

      // Text deltas
      if (delta.content) {
        yield { type: "text", delta: delta.content };
      }

      // Tool call fragment accumulation
      if (delta.tool_calls) {
        for (const fragment of delta.tool_calls) {
          const idx = fragment.index;
          if (!partials[idx]) {
            partials[idx] = { id: "", name: "", args: "" };
          }
          if (fragment.id) partials[idx].id = fragment.id;
          if (fragment.function?.name) partials[idx].name = fragment.function.name;
          if (fragment.function?.arguments) partials[idx].args += fragment.function.arguments;
        }
      }
    }

    // Emit one tool_call event per accumulated call
    for (const partial of Object.values(partials)) {
      if (partial.name && partial.id) {
        yield { type: "tool_call", id: partial.id, name: partial.name, args: partial.args };
      }
    }
  }
}
