import { describe, expect, it } from "vitest";
import { HOW_IT_WORKS, QUESTIONS } from "./content";
import { MI_END_LTV, PREPAID_INTEREST_DAYS } from "./math";
import { LOAN_ESTIMATE_LINE } from "./Results";

const text = [...HOW_IT_WORKS, ...QUESTIONS.flatMap(({ q, a }) => [q, a])];
const how = HOW_IT_WORKS.join(" ");
const answer = (question: string) => QUESTIONS.find(({ q }) => q === question)!.a;

describe("APR page text", () => {
  it("explains the method and answers three or four questions", () => {
    expect(HOW_IT_WORKS.length).toBeGreaterThanOrEqual(3);
    expect(QUESTIONS.length).toBeGreaterThanOrEqual(3);
    expect(QUESTIONS.length).toBeLessThanOrEqual(4);
    for (const t of text) expect(t.trim().length, t).toBeGreaterThan(0);
    expect(new Set(text).size).toBe(text.length);
  });

  it("has no word that reads as a loan decision, an offer or advice", () => {
    for (const t of text) expect(t, t).not.toMatch(/qualif|approved|eligible|your rate|your APR|should|quote|offer|recommend|official/i);
  });

  it("is plain text: no formulas and no dashes used as punctuation", () => {
    for (const t of text) expect(t, t).not.toMatch(/[—–=^×÷/*+]| x | - /);
  });

  it("says the rate sets the payment and the APR spreads certain costs over the loan", () => {
    expect(how).toContain("The interest rate sets the monthly payment.");
    expect(how).toContain("as if they were interest");
    expect(how).toContain("does not change the payment");
  });

  it("says which costs are counted and which are left out", () => {
    expect(how).toContain("The costs counted here are the lender fees you enter, any discount points, prepaid interest and mortgage insurance.");
    expect(HOW_IT_WORKS[1]).toContain("such as the appraisal, the owner's title insurance, the title search and recording, are left out");
    expect(how).not.toContain("title work");
  });

  it("A2: says lender fees are everything the lender or a mortgage broker charges for the loan", () => {
    expect(HOW_IT_WORKS[1]).toContain("Lender fees are all that the lender or a mortgage broker charges for the loan");
    for (const fee of ["origination", "underwriting", "processing", "administration", "rate lock"]) expect(HOW_IT_WORKS[1], fee).toContain(fee);
  });

  it("E1: counts the technology and courier fees and the lender's title insurance in the lender fees, as the dashboard's catalog does", () => {
    const counted = HOW_IT_WORKS[1].slice(0, HOW_IT_WORKS[1].indexOf("are left out"));
    expect(counted).toContain("technology and courier fees");
    expect(counted).toContain("along with the lender's title insurance.");
    expect(counted.indexOf("lender's title insurance")).toBeLessThan(counted.indexOf("owner's title insurance"));
  });

  it("A6: says what the amount financed and the finance charge are, in a sentence each", () => {
    expect(how).toContain("The amount financed is the loan amount less the fees counted.");
    expect(how).toContain("The finance charge is the interest, the fees counted and any mortgage insurance over the whole loan.");
    expect(HOW_IT_WORKS).toHaveLength(7);
  });

  it("says the loan is assumed to be a conventional fixed-rate loan", () => {
    expect(how).toContain("The loan is assumed to be a conventional fixed-rate loan");
  });

  it("gives the model's own figures for mortgage insurance and prepaid interest", () => {
    expect(how).toContain(`until the scheduled balance reaches ${MI_END_LTV * 100}% of the home value`);
    expect(how).toContain(`${PREPAID_INTEREST_DAYS} days of interest`);
    expect(how).toContain("the amount is shown in the list of fees");
  });

  it("says a lender credit lowers the fees counted, never below zero, and leaves points alone", () => {
    expect(how).toContain("A lender credit lowers the lender fees and prepaid interest that are counted, never below zero.");
    expect(how).toContain("It does not come off discount points.");
  });

  it("E2: names the Loan Estimate as the place of the APR for the loan, in the words of the result", () => {
    expect(HOW_IT_WORKS[HOW_IT_WORKS.length - 1]).toBe("The result is an estimate based on the numbers you entered. The APR for your loan is the one on your Loan Estimate.");
    expect(LOAN_ESTIMATE_LINE).toContain("The APR for your loan is the one on your Loan Estimate.");
    expect(answer("What is a Loan Estimate?")).toContain("The APR on it is the one for that loan.");
    expect(answer("Why can the APR here differ from a lender's?")).toContain("This figure is an estimate, and the Loan Estimate has the APR for the loan.");
    expect(answer("What is a Loan Estimate?")).toContain("Loan Estimate");
  });

  it("answers the four questions of the plan", () => {
    expect(QUESTIONS.map(({ q }) => q)).toEqual([
      "Why is the APR higher than the interest rate?",
      "Is a lower APR always the better loan?",
      "What is a Loan Estimate?",
      "Why can the APR here differ from a lender's?",
    ]);
  });

  it("answers the lower APR question with how APR works, not with what to pick", () => {
    const a = answer("Is a lower APR always the better loan?");
    expect(a).toContain("it assumes the loan is kept to the end");
    expect(a).not.toMatch(/choose|pick|best|better off|we suggest|you want/i);
  });
});
