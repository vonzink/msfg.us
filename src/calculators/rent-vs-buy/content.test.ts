import { describe, expect, it } from "vitest";
import { HOW_IT_WORKS, META_DESCRIPTION, QUESTIONS } from "./content";

const text = [META_DESCRIPTION, ...HOW_IT_WORKS, ...QUESTIONS.flatMap(({ q, a }) => [q, a])];

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

  it("F5: says what is left out on each side, with the same sentences as the assumptions list", () => {
    const how = HOW_IT_WORKS.join(" ");
    expect(how).toContain("Not included on the buying side: mortgage insurance, HOA dues and income tax effects. Counting them would raise the cost of buying.");
    expect(how).toContain("Not included on the renting side: renters insurance.");
    expect(how).toContain("Any monthly difference between the two payments is not invested.");
    expect(how).not.toContain("Not included: ");
  });

  it("counts closing costs on the buying side and no longer lists them as left out", () => {
    const how = HOW_IT_WORKS.join(" ");
    expect(how).toContain("Buying counts the down payment, the closing costs on the purchase, the mortgage payments, property tax, homeowners insurance and maintenance.");
    expect(how).not.toMatch(/Not included[^.]*closing costs/);
  });

  it("F6: the search description does not presume that buying pulls ahead", () => {
    expect(META_DESCRIPTION).toBe(
      "Compare the estimated cost of renting with the cost of buying over the years you plan to stay, and see whether and when buying pulls ahead.",
    );
  });

  it("F6: does not presume that buying catches up", () => {
    const how = HOW_IT_WORKS.join(" ");
    expect(how).toContain("It can catch up as the loan is paid down and as the home's value changes.");
    expect(how).not.toContain("It catches up");
  });

  it("says what is left out and that the loan is fixed-rate", () => {
    const how = HOW_IT_WORKS.join(" ");
    for (const item of ["mortgage insurance", "closing costs", "HOA dues", "renters insurance", "income tax", "fixed-rate"]) {
      expect(how, item).toContain(item);
    }
  });
});
