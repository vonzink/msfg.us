import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MortgageCalculator } from "./MortgageCalculator";
import { MortgageResults, promptText } from "./Results";
import { calculateMortgage } from "./math";
import { exampleValues, inputFault, scenarioOf, toInput, type Mode } from "./fields";
import { PrintSummary } from "./PrintSummary";
import { HOW_IT_WORKS, QUESTIONS } from "./content";

const NOTE = "Example rate for illustration, not an offer.";
const DISCLAIMER = "This is an estimate based on the numbers you entered.";
const page = () => renderToStaticMarkup(<MortgageCalculator exampleRatePct={7} exampleRateNote={NOTE} disclaimer={DISCLAIMER} />);
const results = (changes: Record<string, string>, mode: Mode = "purchase") => {
  const values = { ...exampleValues(7, mode), ...changes };
  return renderToStaticMarkup(
    <MortgageResults
      result={calculateMortgage(toInput(values, { month: 0, year: 0 }))}
      start={null}
      disclaimer={DISCLAIMER}
      scenario={scenarioOf(values)}
      fault={inputFault(values)}
    />,
  );
};
const printed = (changes: Record<string, string>, mode: Mode) => {
  const values = { ...exampleValues(7, mode), ...changes };
  const input = toInput(values, { month: 0, year: 2027 });
  return renderToStaticMarkup(<PrintSummary input={input} result={calculateMortgage(input)!} start={{ month: 0, year: 2027 }} scenario={scenarioOf(values)} />);
};
const text = (html: string) => html.replace(/<[^>]+>/g, "");

const BAD_OUTPUT = /NaN|Infinity|\$-|-\$0|undefined/;
const BAD_WORDS = /qualif|approved|eligible|your rate|afford|should/i;
const DASHES = /[\u2013\u2014]/;
const NOT_A_LENDING_AMOUNT = "This is arithmetic on the payment you typed. It is not the amount a lender would lend.";

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
    for (const id of ["homePrice", "downPayment", "rate", "termYears", "yearlyTax", "yearlyInsurance", "monthlyHoa", "monthlyPmi", "extraAmount"]) {
      expect(html.split(`id="mortgage-${id}"`).length - 1, id).toBe(1);
      expect(html, id).toContain(`for="mortgage-${id}"`);
    }
    for (const legend of ["Down payment as", "Pay the extra"]) {
      expect(html).toMatch(new RegExp(`<legend[^>]*>${legend}</legend>`));
    }
  });

  it("puts the mode switch first, above the first card, on Purchase", () => {
    const html = page();
    expect(html).toMatch(/<legend[^>]*>I want to work out<\/legend>/);
    expect(html.split(`name="mortgage-mode"`).length - 1).toBe(3);
    for (const label of ["Purchase", "Refinance", "Payment"]) expect(html, label).toMatch(new RegExp(`<input[^>]*name="mortgage-mode"[^>]*/>${label}</label>`));
    expect(html).toMatch(/<input(?=[^>]*name="mortgage-mode")(?=[^>]*value="purchase")(?=[^>]*checked="")/);
    expect(html.indexOf("I want to work out")).toBeGreaterThan(html.indexOf("<form"));
    expect(html.indexOf("I want to work out")).toBeLessThan(html.indexOf("The home and the loan"));
  });

  it("takes the loan term as a number box with a slider from 1 to 30", () => {
    const html = page();
    expect(html).toMatch(/<input[^>]*id="mortgage-termYears"[^>]*type="text"[^>]*value="30"/);
    expect(html).toMatch(/<input[^>]*type="range"[^>]*aria-label="Loan term"[^>]*min="1"[^>]*max="30"[^>]*step="1"/);
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
  it("names the box at fault when there is no result", () => {
    const html = results({ homePrice: "abc" });
    expect(html).toMatch(/role="status"[^>]*>Enter a number for home price\.</);
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

describe("the prompt when there is no result", () => {
  const prompt = (changes: Record<string, string>, mode: Mode = "purchase") => promptText(inputFault({ ...exampleValues(7, mode), ...changes }));

  it.each<[string, Record<string, string>, Mode, string]>([
    ["an empty home price", { homePrice: "" }, "purchase", "Enter the home price."],
    ["a home price of 0", { homePrice: "0" }, "purchase", "Enter the home price."],
    ["letters for the home price", { homePrice: "abc" }, "purchase", "Enter a number for home price."],
    ["a down payment of the whole price", { downPayment: "100" }, "purchase", "The down payment is more than the home price."],
    ["a down payment above the price", { downUnit: "usd", downPayment: "500,000" }, "purchase", "The down payment is more than the home price."],
    ["an empty rate", { rate: "" }, "purchase", "Enter the interest rate."],
    ["a rate mid-typing", { rate: "7.." }, "purchase", "Enter a number for interest rate."],
    ["a rate above the limit", { rate: "26" }, "purchase", "Enter an interest rate from 0% to 25%."],
    ["a negative rate", { rate: "-1" }, "purchase", "Enter an interest rate from 0% to 25%."],
    ["an empty term", { termYears: "" }, "purchase", "Enter the loan term."],
    ["letters for the term", { termYears: "x" }, "purchase", "Enter a number for loan term."],
    ["a term of 0", { termYears: "0" }, "purchase", "Enter a loan term from 1 to 30 years."],
    ["a term of 31", { termYears: "31" }, "purchase", "Enter a loan term from 1 to 30 years."],
    ["a term of 7.5", { termYears: "7.5" }, "purchase", "Enter a loan term from 1 to 30 years."],
    ["an empty loan amount", { loanAmount: "" }, "refinance", "Enter the loan amount."],
    ["a home value below the loan", { homeValue: "300,000" }, "refinance", "The home value is below the loan amount."],
    ["an empty payment", { payment: "" }, "payment", "Enter the monthly payment."],
    ["letters for the payment", { payment: "abc" }, "payment", "Enter a number for monthly payment."],
    ["a payment of 0", { payment: "0" }, "payment", "Enter a payment large enough to pay off a loan at this rate."],
    ["a term of 31 in payment mode", { termYears: "31" }, "payment", "Enter a loan term from 1 to 30 years."],
  ])("%s", (_name, changes, mode, expected) => {
    expect(prompt(changes, mode)).toBe(expected);
    const html = results(changes, mode);
    expect(html).toContain(`role="status"`);
    expect(text(html)).toBe(expected);
  });

  it("is general when no box is at fault", () => {
    expect(promptText(null)).toBe("Enter the numbers above to see the estimate.");
    expect(renderToStaticMarkup(<MortgageResults result={null} start={null} disclaimer={DISCLAIMER} />)).toMatch(/role="status"[^>]*>Enter the numbers above to see the estimate\.</);
  });
});

describe("refinance results", () => {
  it("opens on the same payment as the purchase example", () => {
    const html = text(results({}, "refinance"));
    expect(html).toContain("Estimated monthly payment$2,679");
    expect(html).toContain("$2,129 principal and interest on a $320,000 loan.");
    expect(html).not.toContain("mortgage insurance");
  });

  it("prompts for mortgage insurance in terms of the home value, not a down payment", () => {
    const html = text(results({ loanAmount: "360,000" }, "refinance"));
    expect(html).toContain("With a loan above 80% of the home value, most conventional loans add mortgage insurance. Add it under Add detail.");
    expect(html).not.toMatch(/down/i);
    expect(text(results({ loanAmount: "360,000", monthlyPmi: "150" }, "refinance"))).toMatch(/Includes mortgage insurance until payment \d+\./);
  });

  it("says nothing keyed on loan-to-value without a home value", () => {
    const cases: Record<string, string>[] = [{ homeValue: "" }, { homeValue: "", monthlyPmi: "150" }];
    for (const changes of cases) {
      const html = text(results(changes, "refinance"));
      expect(html).toContain("Estimated monthly payment$2,679");
      expect(html).not.toMatch(/mortgage insurance|home value|down/i);
    }
  });
});

describe("payment mode results", () => {
  it("leads with the loan amount in whole dollars and the payment as typed", () => {
    const html = text(results({}, "payment"));
    expect(html).toContain("Estimated loan amount$320,000paid off by $2,128.97 a month over 30 years at 7%");
    expect(html).not.toContain("Estimated monthly payment");
    expect(html).not.toContain("$320,000.30");
  });

  it("says straight under the headline that it is not a lending amount", () => {
    const html = results({}, "payment");
    expect(html.split(NOT_A_LENDING_AMOUNT).length - 1).toBe(1);
    expect(html.indexOf(NOT_A_LENDING_AMOUNT)).toBeGreaterThan(html.indexOf("paid off by"));
    expect(html.indexOf(NOT_A_LENDING_AMOUNT)).toBeLessThan(html.indexOf("Where each payment goes"));
  });

  it("still gives total interest, the payoff, the slider and the balance chart", () => {
    const html = results({}, "payment");
    for (const part of ["Total interest", "Paid off", "mortgage-breakdown-month", "Loan balance at the end of each year"]) expect(html, part).toContain(part);
  });

  it("shows nothing about tax, insurance, a down payment or loan-to-value", () => {
    const html = text(results({ yearlyTax: "4,800", yearlyInsurance: "1,800", monthlyHoa: "50", monthlyPmi: "150" }, "payment"));
    expect(html).not.toMatch(/tax|insurance|HOA|down|home value/i);
  });

  it("names a one-year term in the singular and keeps the rate as typed", () => {
    expect(text(results({ termYears: "1", rate: "6.125" }, "payment"))).toContain("a month over 1 year at 6.125%");
  });

  it("states extra principal beside the payment", () => {
    expect(text(results({ extraAmount: "200" }, "payment"))).toContain("Plus $200 extra principal every month, $2,329 in all.");
  });

  it("shows the payment typed, to the cent, when a fraction of a cent is typed", () => {
    // Only while focus is in the box: on leaving it the box itself becomes 2,128.98. Until then the
    // loan is the one $2,128.975 pays off, whose own payment is $2,128.97 in the schedule.
    const values = { ...exampleValues(7, "payment"), payment: "2128.975" };
    expect(calculateMortgage(toInput(values, { month: 0, year: 0 }))!.monthlyPI).toBe(2128.97);
    expect(text(results({ payment: "2128.975" }, "payment"))).toContain("paid off by $2,128.98 a month");
  });
});

describe("print summary by mode", () => {
  it("is unchanged for a purchase", () => {
    const html = text(printed({}, "purchase"));
    expect(html).toContain("Home price$400,000Down payment$80,000 (20%)Loan amount$320,000Interest rate7%Loan term30 years");
    expect(html).not.toContain("Home value");
  });

  it("says loan amount and home value for a refinance", () => {
    const html = text(printed({}, "refinance"));
    expect(html).toContain("The loanLoan amount$320,000Home value$400,000Interest rate7%Loan term30 years");
    expect(html).toContain("Property tax$4,800 a year");
    expect(html).toContain("Monthly payment$2,679");
    expect(html).not.toMatch(/Home price|Down payment/);
    expect(html.split("Loan amount").length - 1).toBe(1);
  });

  it("leaves the home value out of a refinance that has none", () => {
    const html = text(printed({ homeValue: "", monthlyPmi: "150" }, "refinance"));
    expect(html).toContain("The loanLoan amount$320,000Interest rate7%");
    expect(html).not.toMatch(/Home value|Home price|Down payment|Mortgage insurance/);
  });

  it("leads with the payment and the loan amount in payment mode", () => {
    const html = text(printed({}, "payment"));
    expect(html).toContain("The loanMonthly payment$2,128.97Interest rate7%Loan term30 years");
    expect(html).toContain("The estimateEstimated loan amount$320,000Total interest");
    expect(html).toContain(NOT_A_LENDING_AMOUNT);
    expect(html).not.toMatch(/tax|insurance|HOA|Home price|Down payment|Home value/i);
  });
});

describe("the words of the mortgage calculator", () => {
  const modes: Mode[] = ["purchase", "refinance", "payment"];

  it.each(modes)("no broken number, loan-decision word or dash in %s results and print", (mode) => {
    const cases: Record<string, string>[] = [{}, { extraAmount: "200" }, { termYears: "7" }, { rate: "0" }, { rate: "" }, { termYears: "" }];
    for (const changes of cases) {
      const html = text(results(changes, mode));
      expect(html).not.toMatch(BAD_OUTPUT);
      expect(html).not.toMatch(BAD_WORDS);
      expect(html).not.toMatch(DASHES);
    }
    const print = text(printed({}, mode));
    expect(print).not.toMatch(BAD_OUTPUT);
    expect(print).not.toMatch(BAD_WORDS);
    expect(print).not.toMatch(DASHES);
  });

  it("explains the three modes in one paragraph of How this works, without a loan-decision word", () => {
    const about = HOW_IT_WORKS.filter((p) => /Refinance/.test(p));
    expect(about).toHaveLength(1);
    expect(about[0]).toMatch(/Purchase/);
    expect(about[0]).toMatch(/Payment/);
    expect(about[0].split(/[.!?](?:\s|$)/).filter(Boolean).length).toBeLessThanOrEqual(3);
    expect(HOW_IT_WORKS).toHaveLength(5);
    const all = [...HOW_IT_WORKS, ...QUESTIONS.flatMap((x) => [x.q, x.a])].join(" ");
    expect(all).not.toMatch(BAD_WORDS);
    expect(all).not.toMatch(DASHES);
  });
});
