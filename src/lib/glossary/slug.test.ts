import { describe, it, expect } from "vitest";
import { slugify } from "./slug";

describe("slugify", () => {
  it("lowercases and hyphenates spaces", () => {
    expect(slugify("1003 Form")).toBe("1003-form");
  });

  it("strips parentheses but keeps existing hyphens", () => {
    expect(slugify("Co-borrower(s)")).toBe("co-borrowers");
    expect(slugify("Section 203(k) loan program")).toBe("section-203k-loan-program");
  });

  it("strips commas, periods and symbols, collapsing gaps", () => {
    expect(slugify("Equal Credit Opportunity Act (ECOA), 15 U.S.C. §1691 et seq.")).toBe(
      "equal-credit-opportunity-act-ecoa-15-usc-1691-et-seq",
    );
  });

  it("trims and collapses stray separators", () => {
    expect(slugify("  Adjustable-rate mortgage (ARM)  ")).toBe("adjustable-rate-mortgage-arm");
    expect(slugify("FHLMC — Freddie Mac")).toBe("fhlmc-freddie-mac");
  });
});
