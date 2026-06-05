import { describe, it, expect } from "vitest";
import { TOOLS } from "./tools";
import type { AiTool } from "./providers/types";

const EXPECTED_TOOL_NAMES = [
  "calculate_payment",
  "lookup_rates",
  "explain_program",
  "capture_lead",
];

describe("TOOLS", () => {
  it("contains exactly the 4 expected tools", () => {
    const names = TOOLS.map((t: AiTool) => t.name);
    expect(names).toEqual(expect.arrayContaining(EXPECTED_TOOL_NAMES));
    expect(TOOLS).toHaveLength(4);
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
});
