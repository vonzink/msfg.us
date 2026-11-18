import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BreakevenCalculator } from "./BreakevenCalculator";
import { BreakevenPrintSummary } from "./PrintSummary";
import { BreakevenResults } from "./Results";
import { exampleValues, toInput } from "./fields";
import { calculateBreakeven } from "./math";

const NOTE = "Example rate for illustration, not an offer.";
const DISCLAIMER = "This is an estimate based on the numbers you entered.";
const page = () => renderToStaticMarkup(<BreakevenCalculator exampleRatePct={7} exampleRateNote={NOTE} disclaimer={DISCLAIMER} />);
const input = (changes: Record<string, string> = {}) => toInput({ ...exampleValues(7), ...changes });
const results = (changes: Record<string, string> = {}) =>
  renderToStaticMarkup(<BreakevenResults result={calculateBreakeven(input(changes))} disclaimer={DISCLAIMER} />);
const count = (html: string, needle: string) => html.split(needle).length - 1;

const BAD_OUTPUT = /NaN|Infinity|\$-|undefined/;
const BAD_WORDS = /qualif|approved|eligible|your rate/i;
const CAUTION = "A lower payment is not the whole decision. A new loan restarts the clock, so check the interest over the life of each loan as well as the breakeven.";
const NO_SAVINGS = { currentRate: "6" };
const STRETCHED = { currentBalance: "250,000", currentRate: "7.25", yearsLeft: "22", newRate: "6.75", closingCosts: "5,000" };

describe("refinance breakeven calculator page", () => {
  it("opens on a 23-month breakeven with both payments and the savings", () => {
    const html = page();
    for (const figure of ["23 months", "$2,263", "$1,996", "$267", "$6,000"]) expect(html, figure).toContain(figure);
    expect(html).toContain(NOTE);
    expect(html).toContain(DISCLAIMER);
  });

  it("never prints a broken number or a loan-decision word, whatever the outcome", () => {
    for (const html of [page(), results(NO_SAVINGS), results({ closingCosts: "0" }), results(STRETCHED), results({ currentBalance: "" })]) {
      expect(html).not.toMatch(BAD_OUTPUT);
      expect(html).not.toMatch(BAD_WORDS);
    }
  });

  it("labels every typed field and groups the choice", () => {
    const html = page();
    for (const id of ["currentBalance", "currentRate", "yearsLeft", "newRate", "closingCosts", "newLoanAmount", "cashOut", "debtPaymentsPaidOff", "currentMi", "newMi", "keepYears"]) {
      expect(count(html, `id="breakeven-${id}"`), id).toBe(1);
      expect(html, id).toContain(`for="breakeven-${id}"`);
    }
    expect(html).toMatch(/<legend[^>]*>New loan term<\/legend>/);
    expect(count(html, "<details data-calc-panel")).toBe(1);
  });

  it("prints a summary, not the form", () => {
    const html = page();
    expect(html).toMatch(/<form[^>]*class="[^"]*print:hidden/);
    expect(html).toContain("Refinance breakeven estimate");
  });
});

describe("the headline", () => {
  it("gives the months and what is being recovered", () => {
    const html = results();
    expect(html).toContain("Estimated breakeven");
    expect(html).toContain("to recover $6,000 of closing costs at $267 a month");
  });

  it("says there is no breakeven when the new payment is not lower", () => {
    const html = results(NO_SAVINGS);
    expect(html).toContain("No breakeven");
    expect(html).toContain("The new payment is not lower, so the closing costs are not recovered through the payment.");
    expect(html).not.toContain("months</p>");
    expect(html).not.toContain("Savings against closing costs");
  });

  it("says the breakeven is immediate with no closing costs, and draws no chart", () => {
    const html = results({ closingCosts: "0" });
    expect(html).toContain("Right away");
    expect(html).toContain("there are no closing costs to recover");
    expect(html).not.toContain("0 months");
    expect(html).not.toContain("Savings against closing costs");
  });

  it("uses one month in the singular", () => {
    expect(results({ closingCosts: "200" })).toContain(">1 month<");
  });
});

describe("interest over the life of each loan", () => {
  it("is always shown, with the difference in words", () => {
    const html = results();
    expect(html).toContain("Interest over the life of each loan");
    expect(html).toContain("$433,160");
    expect(html).toContain("$418,528");
    expect(html).toContain("The new loan costs $14,633 less in interest.");
  });

  it("says so when a lower payment costs more interest", () => {
    const html = results(STRETCHED);
    expect(html).toContain("The new loan costs $82,871 more in interest, even with the lower payment.");
  });

  it("is still shown when there is no breakeven", () => {
    expect(results(NO_SAVINGS)).toContain("Interest over the life of each loan");
  });
});

describe("optional detail", () => {
  it("shows net savings only when the years to keep the loan are given", () => {
    expect(results()).not.toContain("Net savings over");
    const html = results({ keepYears: "5" });
    expect(html).toContain("Net savings over 5 years");
    expect(html).toContain("$10,016");
  });

  it("shows what would still be owed on each loan after the years entered", () => {
    expect(results()).not.toContain("still owed");
    const html = results({ newRate: "6.5", newTermYears: "15", keepYears: "10" });
    expect(html).toContain("After 10 years");
    expect(html).toContain("Still owed on the loan now");
    expect(html).toContain("$251,915");
    expect(html).toContain("Still owed on the new loan");
    expect(html).toContain("$133,563");
    expect(html).toContain("You would owe $118,351 less with the new loan.");
    expect(html).toContain("-$48,058");
    expect(html).toContain("Counting the payments, the closing costs and what would still be owed, the refinance leaves you $70,294 ahead after 10 years.");
  });

  it("says when the refinance leaves you behind once the balance is counted", () => {
    const html = results({ ...STRETCHED, keepYears: "7" });
    expect(html).toContain("You would owe $19,135 more with the new loan.");
    expect(html).toContain("the refinance leaves you $974 behind after 7 years.");
  });

  it("mentions cash out only when there is some", () => {
    expect(results()).not.toContain("of cash out");
    expect(results({ cashOut: "40,000" })).toContain("Includes $40,000 of cash out, which is added to the new loan.");
  });

  it("says what the payments and the savings include", () => {
    const html = results({ currentMi: "140", newMi: "95", cashOut: "40,000", debtPaymentsPaidOff: "900" });
    expect(html).toContain("principal, interest and $140 mortgage insurance");
    expect(html).toContain("principal, interest and $95 mortgage insurance");
    expect(html).toContain("includes $900 of debt payments paid off");
  });

  it("always carries the caution", () => {
    for (const html of [results(), results(NO_SAVINGS), results({ closingCosts: "0" })]) expect(html).toContain(CAUTION);
  });
});

describe("statements that must stay true", () => {
  it("does not claim a lower payment when the savings come only from debts paid off", () => {
    const html = results({ cashOut: "60,000", debtPaymentsPaidOff: "900" });
    expect(html).not.toContain("even with the lower payment");
    expect(html).toContain("The new loan costs $69,072 more in interest.");
    expect(html).toContain("the new payment is $132 higher; the savings come from debt payments paid off");
  });

  it("warns and gives no figures when the typed loan cannot cover the balance and the cash out", () => {
    const html = results({ cashOut: "40,000", newLoanAmount: "306,000" });
    expect(html).toContain("A new loan of $306,000 is $34,000 less than the balance plus the cash out.");
    expect(html).not.toContain("Estimated breakeven");
    expect(html).not.toContain("Monthly savings");
    expect(html).not.toContain("Includes $40,000 of cash out");
  });

  it("says when debt payments were left out because no extra was borrowed", () => {
    const html = results({ debtPaymentsPaidOff: "900" });
    expect(html).toContain("$900 of debt payments are not counted");
    expect(html).toContain("$267");
  });

  it("says no breakeven, with the reason, when it would outlast the new loan", () => {
    const html = results({ currentRate: "7.02", yearsLeft: "30" });
    expect(html).toContain("No breakeven");
    expect(html).toContain("The savings would not cover the closing costs within the life of the new loan.");
    expect(html).not.toMatch(/\d{3,} months/);
  });

  it("says when the new loan is a different size from the balance", () => {
    expect(results({ cashOut: "40,000" })).toContain("The new loan is $40,000 larger than the balance, which adds to its interest.");
    expect(results({ newLoanAmount: "280,000" })).toContain("The new loan is $20,000 smaller than the balance; that amount is paid in at closing.");
    expect(results()).not.toContain("than the balance");
  });
});

describe("no result", () => {
  it("asks for the missing numbers", () => {
    const html = results({ currentBalance: "" });
    expect(html).toMatch(/role="status"[^>]*>Enter your loan balance, both rates, the years left and the new term to see the breakeven\./);
    expect(html).not.toContain(CAUTION);
  });
});

describe("print summary", () => {
  it("sets the two loans beside the estimate", () => {
    const i = input({ keepYears: "5" });
    const html = renderToStaticMarkup(<BreakevenPrintSummary input={i} result={calculateBreakeven(i)!} />);
    expect(html).toMatch(/^<section[^>]*class="[^"]*hidden[^"]*print:block/);
    for (const text of ["Loan balance", "$300,000", "Current rate", "8%", "27 years", "New rate", "7%", "30 years", "Closing costs", "$6,000", "Breakeven", "23 months", "Monthly savings", "$267", "Interest left on the loan now", "$433,160", "Interest on the new loan", "$418,528", "Net savings over 5 years", "$10,016", "Owed on the loan now after 5 years", "Owed on the new loan after 5 years", "Overall position after 5 years"]) {
      expect(html, text).toContain(text);
    }
  });
});
