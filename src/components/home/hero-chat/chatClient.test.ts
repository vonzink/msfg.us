import { describe, expect, it } from "vitest";
import { splitSseFrames, type ChatEvent } from "./chatClient";

describe("splitSseFrames", () => {
  it("parses complete data frames and returns the unterminated tail", () => {
    const { events, rest } = splitSseFrames('data: {"type":"text","value":"Hi"}\n\ndata: {"type":"done"}\n\ndata: {"ty');
    expect(events).toEqual([{ type: "text", value: "Hi" }, { type: "done" }] satisfies ChatEvent[]);
    expect(rest).toBe('data: {"ty');
  });
  it("skips malformed JSON and non-data frames without throwing", () => {
    const { events } = splitSseFrames("data: {not json}\n\n: keep-alive\n\ndata: {\"type\":\"done\"}\n\n");
    expect(events).toEqual([{ type: "done" }]);
  });
  it("returns everything as rest when no frame is complete", () => {
    const { events, rest } = splitSseFrames('data: {"type":"text"');
    expect(events).toEqual([]);
    expect(rest).toBe('data: {"type":"text"');
  });
});
