import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the openai module before importing the provider
const mockCreate = vi.fn();
vi.mock("openai", () => {
  return {
    default: vi.fn().mockImplementation(function () {
      return {
        chat: {
          completions: {
            create: mockCreate,
          },
        },
      };
    }),
  };
});

import { OpenAICompatibleProvider } from "./openaiCompatible";
import type { AiMessage, AiTool } from "./types";

/** Build a minimal async iterable of stream chunks for mocking. */
function makeStream(chunks: object[]): AsyncIterable<object> {
  return {
    [Symbol.asyncIterator]() {
      let i = 0;
      return {
        async next() {
          if (i >= chunks.length) return { done: true, value: undefined };
          return { done: false, value: chunks[i++] };
        },
      };
    },
  };
}

const provider = new OpenAICompatibleProvider({
  apiKey: "sk-test",
  baseURL: "https://api.deepseek.com",
  model: "deepseek-chat",
});

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

describe("OpenAICompatibleProvider.streamTurn", () => {
  it("yields text events from content deltas", async () => {
    mockCreate.mockResolvedValue(
      makeStream([
        { choices: [{ delta: { content: "Hello" }, finish_reason: null }] },
        { choices: [{ delta: { content: " world" }, finish_reason: null }] },
        { choices: [{ delta: {}, finish_reason: "stop" }] },
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

  it("assembles tool_calls from index-keyed deltas and yields tool_call events", async () => {
    mockCreate.mockResolvedValue(
      makeStream([
        {
          choices: [{
            delta: {
              tool_calls: [{ index: 0, id: "call_abc", function: { name: "calculate_payment", arguments: '{"amount":' } }],
            },
            finish_reason: null,
          }],
        },
        {
          choices: [{
            delta: {
              tool_calls: [{ index: 0, id: null, function: { name: null, arguments: "300000}" } }],
            },
            finish_reason: null,
          }],
        },
        { choices: [{ delta: {}, finish_reason: "tool_calls" }] },
      ])
    );

    const messages: AiMessage[] = [{ role: "user", content: "What's my payment?" }];
    const events = [];
    for await (const ev of provider.streamTurn("System.", messages, tools)) {
      events.push(ev);
    }

    expect(events).toEqual([
      { type: "tool_call", id: "call_abc", name: "calculate_payment", args: '{"amount":300000}' },
    ]);
  });

  it("translates neutral messages to OpenAI wire format", async () => {
    mockCreate.mockResolvedValue(makeStream([
      { choices: [{ delta: { content: "ok" }, finish_reason: "stop" }] },
    ]));

    const messages: AiMessage[] = [
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello" },
      {
        role: "assistant",
        toolCalls: [{ id: "call_1", name: "calculate_payment", args: '{"purpose":"buy"}' }],
      },
      { role: "tool", toolCallId: "call_1", name: "calculate_payment", result: '{"payment":1200}' },
    ];

    for await (const _ of provider.streamTurn("Sys", messages, tools)) { /* drain */ }

    const callArgs = mockCreate.mock.calls[0][0];
    // System message first
    expect(callArgs.messages[0]).toEqual({ role: "system", content: "Sys" });
    // user text
    expect(callArgs.messages[1]).toEqual({ role: "user", content: "Hi" });
    // assistant text
    expect(callArgs.messages[2]).toEqual({ role: "assistant", content: "Hello" });
    // assistant tool_calls
    expect(callArgs.messages[3]).toMatchObject({
      role: "assistant",
      tool_calls: [{ id: "call_1", type: "function", function: { name: "calculate_payment", arguments: '{"purpose":"buy"}' } }],
    });
    // tool result
    expect(callArgs.messages[4]).toEqual({
      role: "tool",
      tool_call_id: "call_1",
      content: '{"payment":1200}',
    });
    // tools translated
    expect(callArgs.tools[0]).toEqual({
      type: "function",
      function: {
        name: "calculate_payment",
        description: "Estimate mortgage payment",
        parameters: { type: "object", properties: { amount: { type: "number" } }, required: [] },
      },
    });
  });
});
