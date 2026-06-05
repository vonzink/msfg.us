import { describe, it, expect, vi } from "vitest";
import { HttpMortgageBrainClient, buildAskRequestBody } from "./httpBrainClient";

function res(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const sampleAnswer = {
  conversationId: "c1",
  answer: "A",
  citations: [],
  confidence: 0.5,
  humanEscalationRequired: false,
  disclaimer: "d",
};

describe("buildAskRequestBody", () => {
  it("omits absent optional fields", () => {
    expect(buildAskRequestBody({ sessionId: "s", question: "q" })).toEqual({
      sessionId: "s",
      question: "q",
    });
  });

  it("includes present optionals", () => {
    expect(
      buildAskRequestBody({
        sessionId: "s",
        question: "q",
        conversationId: "c",
        loanType: "conventional",
        state: "CO",
      }),
    ).toEqual({ sessionId: "s", question: "q", conversationId: "c", loanType: "conventional", state: "CO" });
  });
});

describe("HttpMortgageBrainClient.ask", () => {
  it("returns ok + mapped answer on 200 and calls the ask endpoint", async () => {
    const fetchImpl = vi.fn(async () => res(200, sampleAnswer));
    const c = new HttpMortgageBrainClient({ baseUrl: "http://brain", fetchImpl });
    const out = await c.ask({ sessionId: "s", question: "q" });
    expect(out).toEqual({ ok: true, answer: { ...sampleAnswer, citations: [] } });
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://brain/api/ai/mortgage/ask",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("forwards X-Forwarded-For and omits conversationId on the first turn", async () => {
    const fetchImpl = vi.fn(async () => res(200, sampleAnswer));
    const c = new HttpMortgageBrainClient({ baseUrl: "http://brain/", fetchImpl });
    await c.ask({ sessionId: "s", question: "q", clientIp: "203.0.113.7" });
    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>)["X-Forwarded-For"]).toBe("203.0.113.7");
    expect(JSON.parse(init.body as string)).toEqual({ sessionId: "s", question: "q" });
  });

  it("maps 400 to validation with the body message", async () => {
    const fetchImpl = vi.fn(async () => res(400, { error: "question is required" }));
    const c = new HttpMortgageBrainClient({ baseUrl: "http://brain", fetchImpl });
    expect(await c.ask({ sessionId: "s", question: "" })).toEqual({
      ok: false,
      kind: "validation",
      message: "question is required",
    });
  });

  it("maps 429 to rate_limited", async () => {
    const fetchImpl = vi.fn(async () => res(429, { error: "slow down" }));
    const c = new HttpMortgageBrainClient({ baseUrl: "http://brain", fetchImpl });
    const r = await c.ask({ sessionId: "s", question: "q" });
    expect(!r.ok && r.kind).toBe("rate_limited");
  });

  it("maps 500 to unavailable", async () => {
    const fetchImpl = vi.fn(async () => res(500, { error: "boom" }));
    const c = new HttpMortgageBrainClient({ baseUrl: "http://brain", fetchImpl });
    const r = await c.ask({ sessionId: "s", question: "q" });
    expect(!r.ok && r.kind).toBe("unavailable");
  });

  it("maps a network throw to unavailable", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    const c = new HttpMortgageBrainClient({ baseUrl: "http://brain", fetchImpl });
    const r = await c.ask({ sessionId: "s", question: "q" });
    expect(!r.ok && r.kind).toBe("unavailable");
  });

  it("maps a malformed 200 body to unavailable", async () => {
    const fetchImpl = vi.fn(async () => res(200, { answer: "missing required fields" }));
    const c = new HttpMortgageBrainClient({ baseUrl: "http://brain", fetchImpl });
    const r = await c.ask({ sessionId: "s", question: "q" });
    expect(!r.ok && r.kind).toBe("unavailable");
  });
});
