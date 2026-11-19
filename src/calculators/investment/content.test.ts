import { describe, expect, it } from "vitest";
import { HOW_IT_WORKS, INTRO, QUESTIONS } from "./content";

const text = [INTRO, ...HOW_IT_WORKS, ...QUESTIONS.flatMap(({ q, a }) => [q, a])];
const how = HOW_IT_WORKS.join(" ");
const answer = (question: string) => QUESTIONS.find(({ q }) => q === question)!.a;

describe("investment page text", () => {
  it("keeps the sentence the page had under its heading", () => {
    expect(INTRO).toBe("Enter the deal and your cash flow, tax effect, equity and five-year return update as you type.");
  });

  it("explains the method in four or five short paragraphs and answers three questions", () => {
    expect(HOW_IT_WORKS.length).toBeGreaterThanOrEqual(4);
    expect(HOW_IT_WORKS.length).toBeLessThanOrEqual(5);
    for (const p of HOW_IT_WORKS) expect(p.length, p).toBeLessThanOrEqual(320);
    expect(QUESTIONS).toHaveLength(3);
    for (const t of text) expect(t.trim().length, t).toBeGreaterThan(0);
    expect(new Set(text).size).toBe(text.length);
  });

  it("has no word that reads as a loan decision, an offer or advice", () => {
    for (const t of text) expect(t, t).not.toMatch(/qualif|approved|eligible|your rate|should|recommend|we suggest|good deal|worth buying/i);
  });

  it("is plain text: no formulas and no dashes used as punctuation", () => {
    for (const t of text) expect(t, t).not.toMatch(/[—–−=^×÷/*+]| x | - /);
  });

  it("says what the page adds up: rent against the costs of owning and running the property, and the loan if there is one", () => {
    expect(HOW_IT_WORKS[0]).toContain("rent");
    expect(HOW_IT_WORKS[0]).toContain("the costs of owning and running it");
    expect(HOW_IT_WORKS[0]).toContain("If there is a loan, the mortgage payments are counted too.");
  });

  it("says what the five-year return counts", () => {
    for (const part of ["cash flow", "income tax", "paying down the loan", "change in the property's value", "Selling costs are taken off"]) {
      expect(HOW_IT_WORKS[1], part).toContain(part);
    }
  });

  it("says growth, income tax and the comparison with another investment are assumptions under Add detail", () => {
    expect(how).toContain("are assumptions");
    expect(how).toContain("under Add detail");
    for (const part of ["Growth", "income tax", "the comparison with another investment"]) expect(HOW_IT_WORKS[2], part).toContain(part);
  });

  it("ends by saying the figures are estimates and not tax or investment advice", () => {
    expect(HOW_IT_WORKS[HOW_IT_WORKS.length - 1]).toBe("The figures are estimates based on the numbers you entered. They are not tax or investment advice.");
  });

  it("answers the three questions of the plan", () => {
    expect(QUESTIONS.map(({ q }) => q)).toEqual([
      "What do cash-on-cash and cap rate mean?",
      "Why can year 1 look worse than later years?",
      'What does "hold the losses" mean?',
    ]);
  });

  it("makes no tax claim beyond the page's own hints, and leaves the choice to a tax advisor", () => {
    const a = answer('What does "hold the losses" mean?');
    expect(a).toContain("saves no tax that year");
    expect(a).toContain("tax advisor");
    for (const t of text) expect(t, t).not.toMatch(/\$|\bIRS\b|deductible|passive|1031|you can deduct|you will save/i);
  });
});
