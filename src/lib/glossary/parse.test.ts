import { describe, it, expect } from "vitest";
import { parseGlossary } from "./parse";

const FIXTURE = `## # (Numbers) {#num}

### 1003 Form
A loan application document.

## A {#A}

### Acceptance
First line.
Second line.

### Interest rate
The cost of borrowing money from a lender, expressed as a percentage of

### Interest rate
The cost of borrowing money from a lender, expressed as a percentage of the loan amount.

## K {#K}
`;

describe("parseGlossary", () => {
  const sections = parseGlossary(FIXTURE);

  it("creates one section per ## heading, mapping label + anchor", () => {
    expect(sections.map((s) => s.label)).toEqual(["#", "A", "K"]);
    expect(sections.map((s) => s.anchor)).toEqual(["num", "A", "K"]);
  });

  it("captures terms with slug + whitespace-collapsed multi-line definitions", () => {
    const num = sections[0];
    expect(num.terms[0]).toEqual({
      term: "1003 Form",
      slug: "1003-form",
      definition: "A loan application document.",
    });
    const acceptance = sections[1].terms.find((t) => t.slug === "acceptance");
    expect(acceptance?.definition).toBe("First line. Second line.");
  });

  it("dedupes repeated terms by slug, keeping the longer definition", () => {
    const a = sections[1];
    const matches = a.terms.filter((t) => t.slug === "interest-rate");
    expect(matches).toHaveLength(1);
    expect(matches[0].definition).toContain("the loan amount.");
  });

  it("keeps sections with no terms as empty arrays", () => {
    expect(sections[2].terms).toEqual([]);
  });
});
