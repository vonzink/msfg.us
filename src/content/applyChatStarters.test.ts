import { describe, it, expect } from "vitest";
import { INTENTS } from "@/content/flows";
import { APPLY_CHAT_STARTERS, stepHelpPrompt } from "./applyChatStarters";

describe("apply chat starters", () => {
  it("every intent has at least one non-empty starter", () => {
    for (const intent of INTENTS) {
      const starters = APPLY_CHAT_STARTERS[intent];
      expect(starters?.length, intent).toBeGreaterThan(0);
      for (const s of starters) expect(s.trim().length).toBeGreaterThan(0);
    }
  });

  it("stepHelpPrompt includes the step question text", () => {
    const q = "What's your estimated credit score?";
    expect(stepHelpPrompt(q)).toContain(q);
  });
});
