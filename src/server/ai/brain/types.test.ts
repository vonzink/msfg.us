import { describe, it, expect } from "vitest";
import { parseBrainResponse, unavailableAnswer, FALLBACK_DISCLAIMER } from "./types";

const sample = {
  conversationId: "e5e48b02-1111-2222-3333-444455556666",
  answer: "Gift funds may generally be used for a down payment...",
  citations: [
    {
      source_name: "Fannie Mae Selling Guide",
      document_name: "fannie mae sellers guide.pdf",
      section: "B3-4.3-04 Personal Gifts",
      page_number: "412",
      effective_date: "2026-01-01",
    },
  ],
  confidence: 0.8,
  humanEscalationRequired: false,
  disclaimer: "This answer is for general mortgage education only...",
};

describe("parseBrainResponse", () => {
  it("maps snake_case citations to camelCase", () => {
    const a = parseBrainResponse(sample);
    expect(a.conversationId).toBe(sample.conversationId);
    expect(a.answer).toBe(sample.answer);
    expect(a.humanEscalationRequired).toBe(false);
    expect(a.citations[0]).toEqual({
      sourceName: "Fannie Mae Selling Guide",
      documentName: "fannie mae sellers guide.pdf",
      section: "B3-4.3-04 Personal Gifts",
      pageNumber: "412",
      effectiveDate: "2026-01-01",
    });
  });

  it("defaults missing citations to an empty array", () => {
    const a = parseBrainResponse({ ...sample, citations: undefined });
    expect(a.citations).toEqual([]);
  });

  it("preserves null citation fields", () => {
    const a = parseBrainResponse({
      ...sample,
      citations: [
        { source_name: "X", document_name: null, section: null, page_number: null, effective_date: null },
      ],
    });
    expect(a.citations[0]).toEqual({
      sourceName: "X", documentName: null, section: null, pageNumber: null, effectiveDate: null,
    });
  });

  it("throws on a malformed body (missing answer)", () => {
    expect(() =>
      parseBrainResponse({ conversationId: "x", humanEscalationRequired: false, disclaimer: "d" }),
    ).toThrow();
  });
});

describe("unavailableAnswer", () => {
  it("escalates to a loan officer without fabricating mortgage content", () => {
    const a = unavailableAnswer();
    expect(a.humanEscalationRequired).toBe(true);
    expect(a.citations).toEqual([]);
    expect(a.disclaimer).toBe(FALLBACK_DISCLAIMER);
    expect(a.answer.length).toBeGreaterThan(0);
  });
});
