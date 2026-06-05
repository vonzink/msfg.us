import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAsk = vi.fn();
const mockGetBrain = vi.fn();
const mockCheckRateLimit = vi.fn(() => ({ allowed: true }));

vi.mock("@/server/ai/brain", () => ({ getMortgageBrain: () => mockGetBrain() }));
vi.mock("@/server/ai/brain/rateLimit", () => ({ checkRateLimit: () => mockCheckRateLimit() }));
vi.mock("@/server/ai/transcript", () => ({
  findOrCreateBrainSession: vi.fn(async () => "sess_1"),
  nextOrderIndex: vi.fn(async () => 0),
  appendMessage: vi.fn(async () => {}),
}));

import { POST } from "./route";

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/v1/ai/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const answer = {
  conversationId: "c1",
  answer: "Gift funds...",
  citations: [],
  confidence: 0.8,
  humanEscalationRequired: false,
  disclaimer: "d",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockCheckRateLimit.mockReturnValue({ allowed: true });
});

describe("POST /api/v1/ai/ask", () => {
  it("400s on an invalid body and never calls the brain", async () => {
    mockGetBrain.mockResolvedValue({ ask: mockAsk });
    const res = await POST(post({ sessionId: "" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.kind).toBe("validation");
    expect(mockAsk).not.toHaveBeenCalled();
  });

  it("returns a compliant fallback (200, escalate) when the brain is disabled", async () => {
    mockGetBrain.mockResolvedValue(null);
    const res = await POST(post({ sessionId: "s1", question: "hi" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.humanEscalationRequired).toBe(true);
    expect(body.citations).toEqual([]);
  });

  it("returns the brain answer verbatim on success", async () => {
    mockAsk.mockResolvedValue({ ok: true, answer });
    mockGetBrain.mockResolvedValue({ ask: mockAsk });
    const res = await POST(post({ sessionId: "s1", question: "gift funds?" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(answer);
  });

  it("forwards the first X-Forwarded-For IP to the brain", async () => {
    mockAsk.mockResolvedValue({ ok: true, answer });
    mockGetBrain.mockResolvedValue({ ask: mockAsk });
    await POST(post({ sessionId: "s1", question: "q" }, { "x-forwarded-for": "203.0.113.7, 10.0.0.1" }));
    expect(mockAsk).toHaveBeenCalledWith(expect.objectContaining({ clientIp: "203.0.113.7" }));
  });

  it("maps an unavailable brain result to 503", async () => {
    mockAsk.mockResolvedValue({ ok: false, kind: "unavailable", message: "down" });
    mockGetBrain.mockResolvedValue({ ask: mockAsk });
    const res = await POST(post({ sessionId: "s1", question: "q" }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.kind).toBe("unavailable");
  });

  it("429s when the local rate limit trips, without calling the brain", async () => {
    mockCheckRateLimit.mockReturnValue({ allowed: false });
    mockGetBrain.mockResolvedValue({ ask: mockAsk });
    const res = await POST(post({ sessionId: "s1", question: "q" }));
    expect(res.status).toBe(429);
    expect(mockAsk).not.toHaveBeenCalled();
  });
});
