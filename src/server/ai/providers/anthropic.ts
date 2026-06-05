/**
 * Anthropic Claude provider adapter.
 *
 * Translates neutral AiMessage[] + AiTool[] to Anthropic's MessageParam[]
 * (system passed separately, tool_results as user turn), calls
 * messages.stream(), and emits neutral AiEvents.
 * Tool-call JSON is assembled from input_json_delta fragments before emit.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam, ToolUseBlockParam, ToolResultBlockParam } from "@anthropic-ai/sdk/resources";
import type { AiProvider, AiMessage, AiTool, AiEvent } from "./types";

const AI_MAX_TOKENS = 2048;

interface Options {
  apiKey: string;
  model: string;
}

export class AnthropicProvider implements AiProvider {
  private client: Anthropic;
  private model: string;

  constructor({ apiKey, model }: Options) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async *streamTurn(
    system: string,
    messages: AiMessage[],
    tools: AiTool[],
  ): AsyncIterable<AiEvent> {
    // Translate neutral messages → Anthropic MessageParam[]
    // Rules:
    //   - user text → {role:"user", content:string}
    //   - assistant text → {role:"assistant", content:string}
    //   - assistant toolCalls → {role:"assistant", content:[{type:"tool_use",...}]}
    //   - tool results → group consecutive tool results into one {role:"user",
    //       content:[{type:"tool_result",...}]} message
    const anthropicMessages: MessageParam[] = [];

    // Collapse consecutive tool-result messages into a single user message
    // with multiple tool_result blocks (Anthropic requirement).
    let toolResultBuffer: ToolResultBlockParam[] = [];

    const flushToolResults = () => {
      if (toolResultBuffer.length > 0) {
        anthropicMessages.push({ role: "user", content: toolResultBuffer });
        toolResultBuffer = [];
      }
    };

    for (const m of messages) {
      if (m.role === "tool") {
        toolResultBuffer.push({
          type: "tool_result",
          tool_use_id: m.toolCallId,
          content: m.result,
        });
        continue;
      }
      // Not a tool result — flush any buffered results first
      flushToolResults();

      if (m.role === "user") {
        anthropicMessages.push({ role: "user", content: m.content });
      } else if (m.role === "assistant" && "content" in m) {
        anthropicMessages.push({ role: "assistant", content: m.content });
      } else if (m.role === "assistant" && "toolCalls" in m) {
        const toolUseBlocks: ToolUseBlockParam[] = m.toolCalls.map((tc) => ({
          type: "tool_use",
          id: tc.id,
          name: tc.name,
          input: JSON.parse(tc.args || "{}"),
        }));
        anthropicMessages.push({ role: "assistant", content: toolUseBlocks });
      }
    }
    flushToolResults();

    // Translate AiTool[] → Anthropic tool format (input_schema instead of parameters)
    const anthropicTools = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters as Anthropic.Tool["input_schema"],
    }));

    // State for assembling streaming tool_use blocks
    type PartialTool = { id: string; name: string; argsJson: string };
    const partials: Record<number, PartialTool> = {};

    const stream = this.client.messages.stream({
      model: this.model,
      system,
      messages: anthropicMessages,
      tools: anthropicTools,
      max_tokens: AI_MAX_TOKENS,
    });

    for await (const event of stream) {
      if (event.type === "content_block_start") {
        if (event.content_block.type === "tool_use") {
          partials[event.index] = {
            id: event.content_block.id,
            name: event.content_block.name,
            argsJson: "",
          };
        }
        // text blocks: no action needed; deltas handle the content
      } else if (event.type === "content_block_delta") {
        if (event.delta.type === "text_delta") {
          yield { type: "text", delta: event.delta.text };
        } else if (event.delta.type === "input_json_delta") {
          if (partials[event.index]) {
            partials[event.index].argsJson += event.delta.partial_json;
          }
        }
      } else if (event.type === "content_block_stop") {
        const partial = partials[event.index];
        if (partial) {
          yield {
            type: "tool_call",
            id: partial.id,
            name: partial.name,
            args: partial.argsJson,
          };
          delete partials[event.index];
        }
      }
      // message_stop, message_delta, etc.: ignore
    }
  }
}
