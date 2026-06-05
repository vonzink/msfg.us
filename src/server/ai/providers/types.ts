/**
 * Provider-agnostic AI types.
 *
 * The chat route and all adapters speak this neutral language; vendor-specific
 * types (OpenAI `ChatCompletionMessageParam`, Anthropic `MessageParam`) are
 * confined to their respective adapter files (openaiCompatible.ts / anthropic.ts).
 */

/** A single tool invocation the model requested. */
export type AiToolCall = {
  /** Unique call id (OpenAI `tool_call.id` / Anthropic `tool_use` id). */
  id: string;
  /** Function name. */
  name: string;
  /** JSON-serialized argument object. */
  args: string;
};

/**
 * One message in the conversation history. Four discriminated shapes map to
 * every vendor message format:
 *  - user / assistant text,
 *  - an assistant turn carrying tool calls,
 *  - a tool result.
 */
export type AiMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string }
  | { role: "assistant"; toolCalls: AiToolCall[] }
  | { role: "tool"; toolCallId: string; name: string; result: string };

/**
 * A tool descriptor. `parameters` is a full JSON Schema object; adapters
 * translate it to their vendor shape (OpenAI `function.parameters`, Anthropic
 * `input_schema`) on the fly.
 */
export type AiTool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

/**
 * Streaming events emitted by `AiProvider.streamTurn`.
 *  - `text`: a streamed text delta.
 *  - `tool_call`: a complete tool call, emitted once after its args are fully
 *    assembled across stream chunks.
 */
export type AiEvent =
  | { type: "text"; delta: string }
  | { type: "tool_call"; id: string; name: string; args: string };

/**
 * Pluggable AI provider interface. Owns ONE model turn (system + conversation
 * history + tools → streaming events). It does NOT own the agentic loop or
 * transcript recording — those stay provider-agnostic in the chat route.
 */
export interface AiProvider {
  streamTurn(
    system: string,
    messages: AiMessage[],
    tools: AiTool[],
  ): AsyncIterable<AiEvent>;
}
