import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @anthropic-ai/sdk before importing the provider
const mockStream = vi.fn();
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: vi.fn().mockImplementation(function () {
      return {
        messages: {
          stream: mockStream,
        },
      };
    }),
  };
});

import { AnthropicProvider } from "./anthropic";
import type { AiMessage, AiTool } from "./types";

/** Build an async iterable of Anthropic stream events. */
function makeAnthropicStream(events: object[]): { [Symbol.asyncIterator](): AsyncIterator<object> } {
  return {
    [Symbol.asyncIterator]() {
      let i = 0;
      return {
        async next() {
          if (i >= events.length) return { done: true, value: undefined };
          return { done: false, value: events[i++] };
        },
      };
    },
  };
}

const provider = new AnthropicProvider({ apiKey: "sk-ant-test", model: "claude-3-5-haiku-20241022" });

const tools: AiTool[] = [
  {
    name: "calculate_payment",
    description: "Estimate mortgage payment",
    parameters: { type: "object", properties: { amount: { type: "number" } }, required: [] },
  },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AnthropicProvider.streamTurn", () => {
  it("yields text events from text_delta blocks", async () => {
    mockStream.mockReturnValue(
      makeAnthropicStream([
        { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
        { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hello" } },
        { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: " world" } },
        { type: "content_block_stop", index: 0 },
        { type: "message_stop" },
      ])
    );

    const messages: AiMessage[] = [{ role: "user", content: "Hi" }];
    const events = [];
    for await (const ev of provider.streamTurn("System.", messages, tools)) {
      events.push(ev);
    }
    expect(events).toEqual([
      { type: "text", delta: "Hello" },
      { type: "text", delta: " world" },
    ]);
  });

  it("assembles tool_use blocks and yields tool_call events on block_stop", async () => {
    mockStream.mockReturnValue(
      makeAnthropicStream([
        { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_abc", name: "calculate_payment", input: {} } },
        { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"amount":' } },
        { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: "300000}" } },
        { type: "content_block_stop", index: 0 },
        { type: "message_stop" },
      ])
    );

    const messages: AiMessage[] = [{ role: "user", content: "payment?" }];
    const events = [];
    for await (const ev of provider.streamTurn("Sys", messages, tools)) {
      events.push(ev);
    }
    expect(events).toEqual([
      { type: "tool_call", id: "toolu_abc", name: "calculate_payment", args: '{"amount":300000}' },
    ]);
  });

  it("passes system as top-level param, not in messages", async () => {
    mockStream.mockReturnValue(makeAnthropicStream([{ type: "message_stop" }]));

    const messages: AiMessage[] = [{ role: "user", content: "Hi" }];
    for await (const _ of provider.streamTurn("Be helpful.", messages, tools)) { /* drain */ }

    const callArgs = mockStream.mock.calls[0][0];
    expect(callArgs.system).toBe("Be helpful.");
    expect(callArgs.messages.some((m: { role: string }) => m.role === "system")).toBe(false);
  });

  it("translates tool results as user turn with tool_result content blocks", async () => {
    mockStream.mockReturnValue(makeAnthropicStream([{ type: "message_stop" }]));

    const messages: AiMessage[] = [
      { role: "user", content: "Pay?" },
      {
        role: "assistant",
        toolCalls: [{ id: "toolu_1", name: "calculate_payment", args: '{"purpose":"buy"}' }],
      },
      { role: "tool", toolCallId: "toolu_1", name: "calculate_payment", result: '{"payment":1200}' },
    ];

    for await (const _ of provider.streamTurn("Sys", messages, tools)) { /* drain */ }

    const callArgs = mockStream.mock.calls[0][0];
    // assistant with tool_use block
    const assistantMsg = callArgs.messages.find((m: { role: string }) => m.role === "assistant");
    expect(assistantMsg.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "tool_use", id: "toolu_1", name: "calculate_payment" }),
      ])
    );
    // tool result as user message with tool_result block
    const toolResultMsg = callArgs.messages.find(
      (m: { role: string; content: Array<{ type: string }> }) =>
        m.role === "user" &&
        Array.isArray(m.content) &&
        m.content.some((c) => c.type === "tool_result")
    );
    expect(toolResultMsg).toBeDefined();
    expect(toolResultMsg.content[0]).toMatchObject({
      type: "tool_result",
      tool_use_id: "toolu_1",
      content: '{"payment":1200}',
    });
  });

  it("translates AiTool to Anthropic input_schema shape", async () => {
    mockStream.mockReturnValue(makeAnthropicStream([{ type: "message_stop" }]));

    for await (const _ of provider.streamTurn("Sys", [{ role: "user", content: "x" }], tools)) { /* drain */ }

    const callArgs = mockStream.mock.calls[0][0];
    expect(callArgs.tools[0]).toEqual({
      name: "calculate_payment",
      description: "Estimate mortgage payment",
      input_schema: { type: "object", properties: { amount: { type: "number" } }, required: [] },
    });
  });
});
