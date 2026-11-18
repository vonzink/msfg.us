import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BuydownCalculator } from "./BuydownCalculator";
import { BuydownPrintSummary } from "./PrintSummary";
import { BuydownResults } from "./Results";
import { exampleValues, toInput } from "./fields";
import { calculateBuydown } from "./math";

const NOTE = "Example rate for illustration, not an offer.";
const DISCLAIMER = "This is an estimate based on the numbers you entered.";
const page = () => renderToStaticMarkup(<BuydownCalculator exampleRatePct={7} exampleRateNote={NOTE} disclaimer={DISCLAIMER} />);
const results = (changes: Record<string, string>) =>
  renderToStaticMarkup(<BuydownResults result={calculateBuydown(toInput({ ...exampleValues(7), ...changes }))} disclaimer={DISCLAIMER} />);
const count = (html: string, needle: string) => html.split(needle).length - 1;

const BAD_OUTPUT = /NaN|Infinity|\$-|undefined/;
const BAD_WORDS = /qualif|approved|eligible|your rate/i;

describe("buydown calculator page", () => {
  it("opens on a 2-1 buydown with its cost, both reduced payments and the full payment", () => {
    const html = page();
    for (const figure of ["$7,459", "$1,718", "$1,919", "$2,129"]) expect(html, figure).toContain(figure);
    expect(html).toContain(NOTE);
    expect(html).toContain(DISCLAIMER);
  });

  it("never prints a broken number or a loan-decision word", () => {
    const html = page();
    expect(html).not.toMatch(BAD_OUTPUT);
    expect(html).not.toMatch(BAD_WORDS);
  });

  it("labels every typed field and groups every choice", () => {
    const html = page();
    for (const id of ["loanAmount", "rate", "yearlyTax", "yearlyInsurance", "monthlyHoa"]) {
      expect(count(html, `id="buydown-${id}"`), id).toBe(1);
      expect(html, id).toContain(`for="buydown-${id}"`);
    }
    for (const legend of ["Loan term", "Buydown type"]) expect(html).toMatch(new RegExp(`<legend[^>]*>${legend}</legend>`));
    expect(count(html, "<details data-calc-panel")).toBe(1);
  });
});

describe("buydown printed page", () => {
  it("prints a summary and the payment table, not the form or the chart", () => {
    const html = page();
    expect(html).toMatch(/<form[^>]*class="[^"]*print:hidden/);
    expect(html).toMatch(/<section id="buydown-results"[^>]*class="[^"]*print:hidden/);
    expect(html).toContain("Rate buydown estimate");
    expect(count(html, ">Payment by year</caption>")).toBe(2); // on screen, and again for print
  });

  it("states the loan and the estimate side by side", () => {
    const html = renderToStaticMarkup(<BuydownPrintSummary input={toInput(exampleValues(7))} result={calculateBuydown(toInput(exampleValues(7)))!} />);
    expect(html).toMatch(/^<section[^>]*class="[^"]*hidden[^"]*print:block/);
    for (const text of ["Loan amount", "$320,000", "Interest rate", "7%", "30 years", "Buydown type", "2-1", "Buydown cost", "$7,459", "Year 1 payment", "$1,718", "Payment from year 3", "$2,129"]) {
      expect(html, text).toContain(text);
    }
  });
});

describe("buydown results", () => {
  it("says who usually pays and that the payment returns to the full amount", () => {
    const html = results({});
    expect(html).toContain("A seller, builder or lender credit often covers it.");
    expect(html).toContain("When the reduced period ends, the payment returns to $2,129 a month.");
  });

  it("shows the full payment at least as often as the first-year payment", () => {
    const html = results({});
    expect(count(html, "$2,129")).toBeGreaterThanOrEqual(count(html, "$1,718"));
    expect(html).toContain("Payment from year 3");
  });

  it("lists each reduced year and then the full rate", () => {
    const rows = (type: string) => count(results({ buydownType: type }).split("<tbody")[1], "<tr");
    expect(rows("3-2-1")).toBe(4);
    expect(rows("2-1")).toBe(3);
    expect(rows("1-0")).toBe(2);
    const html = results({ buydownType: "3-2-1" });
    expect(html).toMatch(/<caption[^>]*>Payment by year<\/caption>/);
    expect(html).toContain("Year 4 onward");
    expect(html).toContain("4%");
  });

  it("includes tax, insurance and HOA in every payment without changing the cost", () => {
    const html = results({ yearlyTax: "4,800", yearlyInsurance: "1,800", monthlyHoa: "100" });
    expect(html).toContain("$7,459");
    expect(html).toContain("$2,368"); // year 1: $1,717.83 + $650
    expect(html).toContain("$2,779"); // full: $2,128.97 + $650
  });

  it("explains a rate that was stopped at 0%", () => {
    expect(results({ rate: "2", buydownType: "3-2-1" })).toContain("A rate cannot go below 0%, so the lowest year is shown at 0%.");
    expect(results({})).not.toContain("cannot go below 0%");
  });

  it("asks for the missing numbers when there is no result", () => {
    const html = results({ loanAmount: "" });
    expect(html).toMatch(/role="status"[^>]*>Enter a loan amount and an interest rate to see what a buydown costs\./);
    expect(html).not.toContain("<table");
    expect(html).not.toMatch(BAD_OUTPUT);
  });
});
