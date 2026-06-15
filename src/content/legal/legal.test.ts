import { describe, it, expect } from "vitest";
import { DEFAULT_TENANT_CONFIG } from "@/content/site";
import { privacyPolicyDoc } from "@/content/legal/privacyPolicy";
import { privacyNoticeDoc, glbaRows } from "@/content/legal/privacyNotice";
import { termsDoc } from "@/content/legal/terms";
import { accessibilityDoc } from "@/content/legal/accessibility";
import { licensingDoc } from "@/content/legal/licensing";
import type { LegalDoc } from "@/content/legal/types";

const C = DEFAULT_TENANT_CONFIG;
const docs: Record<string, LegalDoc> = {
  privacyPolicy: privacyPolicyDoc(C),
  privacyNotice: privacyNoticeDoc(C),
  terms: termsDoc(C),
  accessibility: accessibilityDoc(C),
  licensing: licensingDoc(C),
};

describe("legal docs", () => {
  for (const [name, doc] of Object.entries(docs)) {
    it(`${name} has sections with non-empty headings and blocks`, () => {
      expect(doc.sections.length).toBeGreaterThan(0);
      for (const s of doc.sections) {
        expect(s.heading.trim().length).toBeGreaterThan(0);
        expect(s.blocks.length).toBeGreaterThan(0);
      }
    });
  }

  it("glbaRows returns the standard sharing matrix", () => {
    expect(glbaRows(C).length).toBeGreaterThanOrEqual(6);
  });
});
