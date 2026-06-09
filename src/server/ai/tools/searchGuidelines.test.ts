import { describe, it, expect, vi, beforeEach } from "vitest";
import { runSearchGuidelines } from "./searchGuidelines";
import * as brainModule from "@/server/ai/brain";

vi.mock("@/server/ai/brain");

const ANSWER = {
  conversationId: "c1",
  answer: "FHA allows 3.5% down at 580+ FICO.",
  citations: [
    { sourceName: "HUD", documentName: "4000.1", section: "II.A", pageNumber: "12", effectiveDate: "2026-01-01" },
  ],
  confidence: 0.9,
  humanEscalationRequired: false,
  disclaimer: "General info, not a commitment to lend.",
};

beforeEach(() => vi.resetAllMocks());

describe("runSearchGuidelines", () => {
  it("returns model text grounded in the brain answer + structured sources", async () => {
    vi.mocked(brainModule.getMortgageBrain).mockResolvedValue({
      ask: vi.fn().mockResolvedValue({ ok: true, answer: ANSWER }),
    } as never);

    const res = await runSearchGuidelines({ question: "FHA down payment?" }, "sess1");

    expect(res.text).toContain("FHA allows 3.5% down");
    expect(res.text).toContain("4000.1"); // citation visible to the model
    expect(res.sources).toEqual({
      citations: ANSWER.citations,
      disclaimer: ANSWER.disclaimer,
      humanEscalationRequired: false,
    });
  });

  it("falls back to an escalation message when the brain is unavailable", async () => {
    vi.mocked(brainModule.getMortgageBrain).mockResolvedValue(null);
    const res = await runSearchGuidelines({ question: "anything" }, "sess1");
    expect(res.text.toLowerCase()).toContain("loan officer");
    expect(res.sources?.humanEscalationRequired).toBe(true);
  });

  it("escalates on a brain error result", async () => {
    vi.mocked(brainModule.getMortgageBrain).mockResolvedValue({
      ask: vi.fn().mockResolvedValue({ ok: false, kind: "unavailable", message: "timeout" }),
    } as never);
    const res = await runSearchGuidelines({ question: "x" }, "sess1");
    expect(res.sources?.humanEscalationRequired).toBe(true);
  });
});
