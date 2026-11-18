import { describe, expect, it } from "vitest";
import { HOW_IT_WORKS, QUESTIONS } from "./content";

const text = [...HOW_IT_WORKS, ...QUESTIONS.flatMap(({ q, a }) => [q, a])];

describe("rent vs buy page text", () => {
  it("explains the method and answers three or four questions", () => {
    expect(HOW_IT_WORKS.length).toBeGreaterThanOrEqual(3);
    expect(QUESTIONS.length).toBeGreaterThanOrEqual(3);
    expect(QUESTIONS.length).toBeLessThanOrEqual(4);
    for (const t of text) expect(t.trim().length, t).toBeGreaterThan(0);
  });

  it("has no word that reads as a loan decision or as advice", () => {
    for (const t of text) expect(t, t).not.toMatch(/qualif|approved|eligible|your rate|should/i);
  });

  it("is plain text: no formulas and no dashes used as punctuation", () => {
    for (const t of text) expect(t, t).not.toMatch(/[—–=^×]| x /);
  });

  it("says what is left out and that the loan is fixed-rate", () => {
    const how = HOW_IT_WORKS.join(" ");
    for (const item of ["mortgage insurance", "closing costs", "HOA dues", "renters insurance", "income tax", "fixed-rate"]) {
      expect(how, item).toContain(item);
    }
  });
});
