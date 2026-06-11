import { describe, it, expect, vi } from "vitest";
import { TOOLS, runTool } from "./tools";
import type { AiTool } from "./providers/types";
import * as sg from "@/server/ai/tools/searchGuidelines";

const EXPECTED_TOOL_NAMES = [
  "calculate_payment",
  "lookup_rates",
  "explain_program",
  "capture_lead",
  "search_guidelines",
];

describe("TOOLS", () => {
  it("contains exactly the 5 expected tools", () => {
    const names = TOOLS.map((t: AiTool) => t.name);
    expect(names).toEqual(expect.arrayContaining(EXPECTED_TOOL_NAMES));
    expect(TOOLS).toHaveLength(5);
  });

  it("each tool has a non-empty description", () => {
    for (const tool of TOOLS) {
      expect(tool.description.length).toBeGreaterThan(0);
    }
  });

  it("each tool has a parameters object with type 'object'", () => {
    for (const tool of TOOLS) {
      expect(tool.parameters).toBeDefined();
      expect(typeof tool.parameters).toBe("object");
      expect((tool.parameters as Record<string, unknown>).type).toBe("object");
    }
  });

  it("runTool('search_guidelines') returns text + sources", async () => {
    vi.spyOn(sg, "runSearchGuidelines").mockResolvedValue({
      text: "grounded answer",
      sources: { citations: [], disclaimer: "d", humanEscalationRequired: false },
    });
    const r = await runTool("search_guidelines", { question: "q" }, "sess1");
    expect(r.text).toBe("grounded answer");
    expect(r.sources).toBeDefined();
  });

  it("existing tools return { text } only", async () => {
    const r = await runTool(
      "calculate_payment",
      {
        purpose: "buy",
        homePrice: 400000,
        downPaymentPct: 20,
        annualRatePct: 6.5,
        termMonths: 360,
      },
      "sess1",
    );
    expect(typeof r.text).toBe("string");
    expect(r.sources).toBeUndefined();
  });
});
