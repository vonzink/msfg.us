import { describe, expect, it } from "vitest";
import { HOW_IT_WORKS, INTRO, QUESTIONS } from "./content";
import { BACK_BANDS, FRONT_BANDS } from "./math";
import { PRIVACY_LINE } from "./Results";

const text = [INTRO, ...HOW_IT_WORKS, ...QUESTIONS.flatMap(({ q, a }) => [q, a])];
const how = HOW_IT_WORKS.join(" ");
const pct = (x: number) => `${Math.round(x * 100)}%`;

describe("home budget page text", () => {
  it("has a one-sentence intro, the method and three or four questions", () => {
    expect(INTRO.match(/[.?!](\s|$)/g)).toHaveLength(1);
    expect(HOW_IT_WORKS.length).toBeGreaterThanOrEqual(3);
    expect(QUESTIONS.length).toBeGreaterThanOrEqual(3);
    expect(QUESTIONS.length).toBeLessThanOrEqual(4);
    for (const t of text) expect(t.trim().length, t).toBeGreaterThan(0);
  });

  it("has no word that reads as a loan decision or as advice", () => {
    for (const t of text) expect(t, t).not.toMatch(/qualif|approved|eligible|your rate|should|guideline|limit|DTI/i);
  });

  it("is plain text: no formulas and no dashes used as punctuation", () => {
    for (const t of text) expect(t, t).not.toMatch(/[—–=^×÷/*+]| x | - /);
  });

  it("says in the intro what the page is for and that it is not a loan decision", () => {
    expect(INTRO).toContain("what is left");
    expect(INTRO).toContain("not as a loan decision");
  });

  it("says the two ratios are shares of gross income, and what each of the other figures is taken after", () => {
    expect(how).toContain("The two ratios are shares of gross income, which is income before tax.");
    expect(how).toContain("Tax, savings and living costs have not been taken off at that point");
    expect(how).toContain("Monthly cash flow is what remains after everything entered: tax, any savings set aside, housing, debts and living costs.");
  });

  it("gives the band edges the model uses, and says the bands are only a way to read a share", () => {
    for (const edge of [FRONT_BANDS.comfortable, FRONT_BANDS.stretching, BACK_BANDS.comfortable, BACK_BANDS.stretching]) expect(how, pct(edge)).toContain(pct(edge));
    expect(how).toContain("up to 32% of gross income reads as Comfortable, above 32% and up to 47% as Stretching, and above 47% as High");
    expect(how).toContain("the bands change at 47% and 55%");
    expect(how).toContain("The bands are a general way to read a share of income.");
    expect(how).toContain("lenders look at more than these two ratios");
  });

  it("C1: says which boxes have to be filled in, and that the rest count as zero when empty", () => {
    expect(how).toContain("Only the income and the housing payment have to be entered. The tax rate, the debts and the living costs count as zero while they are empty.");
  });

  it("says a group is its total or its lines, never both", () => {
    expect(how).toContain("A group uses its total or its lines, never both.");
  });

  it("carries the privacy line word for word", () => {
    expect(how).toContain(PRIVACY_LINE);
  });

  it("B6: does not say how many months a loan asks for; a lender counts reserves in its own way", () => {
    const { a } = QUESTIONS.find(({ q }) => q === "How many months of savings is enough?")!;
    expect(a).toContain("A lender counts reserves in its own way, and a loan officer can explain what applies to you.");
    expect(a).not.toContain("set number of months");
    expect(a).not.toContain("Some loans");
  });

  it("answers the four questions of the plan", () => {
    expect(QUESTIONS.map(({ q }) => q)).toEqual([
      "Do I enter gross income or take-home pay?",
      "What counts as a debt payment?",
      "What if the ratios are high?",
      "How many months of savings is enough?",
    ]);
  });
});
