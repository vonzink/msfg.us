import { describe, it, expect } from "vitest";
import { GLOSSARY } from "./glossary";

describe("GLOSSARY (generated)", () => {
  const allTerms = GLOSSARY.flatMap((s) => s.terms);

  it("starts with the numbers section and has many letter sections", () => {
    expect(GLOSSARY[0].label).toBe("#");
    expect(GLOSSARY[0].anchor).toBe("num");
    expect(GLOSSARY.length).toBeGreaterThan(20);
  });

  it("every term has a name, slug and definition", () => {
    for (const t of allTerms) {
      expect(t.term).toBeTruthy();
      expect(t.slug).toBeTruthy();
      expect(t.definition).toBeTruthy();
    }
  });

  it("slugs are globally unique", () => {
    const slugs = allTerms.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("omits empty letters K and X", () => {
    const labels = GLOSSARY.map((s) => s.label);
    expect(labels).not.toContain("K");
    expect(labels).not.toContain("X");
  });

  it("dedupes the duplicate 'Interest rate', keeping the complete definition", () => {
    const matches = allTerms.filter((t) => t.slug === "interest-rate");
    expect(matches).toHaveLength(1);
    expect(matches[0].definition).toContain("the loan amount");
  });

  it("slugs long legal term names correctly", () => {
    expect(allTerms.map((t) => t.slug)).toContain(
      "equal-credit-opportunity-act-ecoa-15-usc-1691-et-seq",
    );
  });
});
