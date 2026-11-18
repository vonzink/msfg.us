import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MortgageCalculator } from "./MortgageCalculator";
import { MortgageResults } from "./Results";
import { calculateMortgage } from "./math";
import { exampleValues, toInput } from "./fields";

const NOTE = "Example rate for illustration, not an offer.";
const DISCLAIMER = "This is an estimate based on the numbers you entered.";
const page = () => renderToStaticMarkup(<MortgageCalculator exampleRatePct={7} exampleRateNote={NOTE} disclaimer={DISCLAIMER} />);
const results = (changes: Record<string, string>) =>
  renderToStaticMarkup(
    <MortgageResults
      result={calculateMortgage(toInput({ ...exampleValues(7), ...changes }, { month: 0, year: 0 }))}
      start={null}
      disclaimer={DISCLAIMER}
    />,
  );

const BAD_OUTPUT = /NaN|Infinity|\$-|undefined/;
const BAD_WORDS = /qualif|approved|eligible|your rate/i;

describe("mortgage calculator page", () => {
  it("opens on the worked example with the config note and disclaimer", () => {
    const html = page();
    expect(html).toContain("$2,129"); // principal and interest on $320,000 at 7% for 30 years
    expect(html).toContain("$2,679"); // plus $400 tax and $150 insurance a month
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
    for (const id of ["homePrice", "downPayment", "rate", "yearlyTax", "yearlyInsurance", "monthlyHoa", "monthlyPmi", "extraAmount"]) {
      expect(html.split(`id="mortgage-${id}"`).length - 1, id).toBe(1);
      expect(html, id).toContain(`for="mortgage-${id}"`);
    }
    for (const legend of ["Down payment as", "Loan term", "Pay the extra"]) {
      expect(html).toMatch(new RegExp(`<legend[^>]*>${legend}</legend>`));
    }
  });

  it("keeps the optional inputs in a closed panel and shows the schedule in full", () => {
    const html = page();
    expect(html.split("<details data-calc-panel").length - 1).toBe(1);
    expect(html).toMatch(/<caption[^>]*>Amortization schedule<\/caption>/);
    expect(html).toContain("mortgage-breakdown-month");
  });

  it("prints a summary and the schedule, not the form or the charts", () => {
    const html = page();
    expect(html).toContain("Mortgage payment estimate");
    expect(html).toMatch(/<form[^>]*class="[^"]*print:hidden/);
    expect(html).toMatch(/<section id="mortgage-results"[^>]*class="[^"]*print:hidden/);
  });
});

describe("mortgage results", () => {
  it("asks for the missing numbers when there is no result", () => {
    const html = results({ homePrice: "abc" });
    expect(html).toContain("Enter a home price, a down payment smaller than the price, a rate and a term to see your payment.");
    expect(html).toMatch(/role="status"[^>]*>Enter a home price/);
    expect(html).not.toMatch(BAD_OUTPUT);
    expect(html).not.toContain("<table");
    expect(html).not.toContain("type=\"range\"");
  });

  it("keeps the headline as the regular payment and states the extra principal beside it", () => {
    expect(results({})).not.toContain("extra principal");
    const monthly = results({ extraAmount: "200" });
    expect(monthly).toContain("$2,679");
    expect(monthly).toContain("Plus $200 extra principal every month, $2,879 in all.");
    expect(results({ extraAmount: "1,000", extraFrequency: "annually" })).toContain("Plus $1,000 extra principal once a year.");
    expect(results({ extraAmount: "5,000", extraFrequency: "one-time" })).toContain("Plus $5,000 extra principal with the first payment.");
  });

  it("shows interest and time saved only with extra principal", () => {
    expect(results({})).not.toContain("Interest saved");
    const html = results({ extraAmount: "200" });
    expect(html).toContain("Interest saved");
    expect(html).toContain("Time saved");
  });

  it("says when mortgage insurance is included and when it stops", () => {
    expect(results({ downPayment: "5", monthlyPmi: "120" })).toMatch(/Includes mortgage insurance until payment \d+\./);
  });

  it("prompts for mortgage insurance with less than 20% down and none entered", () => {
    expect(results({ downPayment: "5" })).toContain("With less than 20% down, most conventional loans add mortgage insurance. Add it under Add detail.");
    expect(results({})).not.toContain("most conventional loans add mortgage insurance");
  });

  it("shows the dashboard's reference case as the dashboard does", () => {
    // msfg-calc's own test: $250,000 home, $50,000 down, 7.5%, 30 years, $2,500 tax, $125/mo insurance, $100 HOA.
    const html = results({ homePrice: "250,000", downUnit: "usd", downPayment: "50,000", rate: "7.5", yearlyTax: "2,500", yearlyInsurance: "1,500", monthlyHoa: "100" });
    expect(html).toContain("$1,398");
    expect(html).toContain("$1,832");
  });

  it("gives the payoff as a length of time until the start date is known", () => {
    expect(results({})).toContain("30 years");
  });
});
