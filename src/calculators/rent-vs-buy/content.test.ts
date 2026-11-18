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

  it("says what is left out, with the same sentence as the printed list", () => {
    const how = HOW_IT_WORKS.join(" ");
    expect(how).toContain("Not included: renters insurance, and investing any monthly difference between the two payments.");
    expect(how).not.toContain("Not included on the");
  });

  it("says mortgage insurance and HOA dues are counted when entered, and claims nowhere that they are left out", () => {
    const how = HOW_IT_WORKS.join(" ");
    expect(how).toContain("Mortgage insurance and HOA dues are counted when you enter them.");
    for (const t of text) {
      expect(t, t).not.toMatch(/not included[^.]*(mortgage insurance|HOA dues|income tax|closing costs)/i);
      expect(t, t).not.toMatch(/(mortgage insurance|HOA dues)[^.]*(is|are) not included/i);
    }
  });

  it("says the interest deduction is optional and assumes itemizing, and is not tax advice", () => {
    const how = HOW_IT_WORKS.join(" ");
    expect(how).toContain("Counting the mortgage interest deduction is optional.");
    expect(how).toContain("That assumes you itemize deductions and that all of the interest is deductible.");
    expect(how).toContain("Many households take the standard deduction instead, and then there is no saving.");
    expect(how).toContain("This is not tax advice.");
  });

  it("describes the monthly payment to own, and no longer points at a list under the result", () => {
    const how = HOW_IT_WORKS.join(" ");
    expect(how).toContain("monthly payment to own");
    expect(how).not.toContain("listed under the result");
  });

  it("answers the mortgage insurance question truthfully now that it can be entered", () => {
    const qa = QUESTIONS.find(({ q }) => /mortgage insurance/i.test(q))!;
    expect(qa.q).toBe("How is mortgage insurance counted?");
    expect(qa.a).toContain("Enter the monthly amount under Add detail");
    expect(qa.a).not.toContain("It is not included here");
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
