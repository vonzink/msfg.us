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
const NOT_A_LENDING_AMOUNT = "This is arithmetic on the payment entered. It is not the amount a lender would lend.";

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
    expect(html).toMatch(/<legend class="sr-only">Calculation type<\/legend>/);
    expect(html).not.toContain("I want to work out");
    expect(html.split(`name="mortgage-mode"`).length - 1).toBe(3);
    for (const label of ["Purchase", "Refinance", "Payment"]) expect(html, label).toMatch(new RegExp(`<input[^>]*name="mortgage-mode"[^>]*/>${label}</label>`));
    expect(html).toMatch(/<input(?=[^>]*name="mortgage-mode")(?=[^>]*value="purchase")(?=[^>]*checked="")/);
    expect(html.indexOf("Calculation type")).toBeGreaterThan(html.indexOf("<form"));
    expect(html.indexOf("Calculation type")).toBeLessThan(html.indexOf("The home and the loan"));
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
    ["a down payment of the whole price", { downPayment: "100" }, "purchase", "Enter a down payment smaller than the home price."],
    ["a down payment above the price", { downUnit: "usd", downPayment: "500,000" }, "purchase", "Enter a down payment smaller than the home price."],
    ["a negative down payment", { downPayment: "-5" }, "purchase", "Enter a down payment smaller than the home price."],
    ["junk for the refinance home value", { homeValue: "abc" }, "refinance", "Enter a number for home value, or leave it empty."],
    ["a refinance home value of 0", { homeValue: "0" }, "refinance", "Home value must be above $0, or leave it empty."],
    ["a negative refinance home value", { homeValue: "-1" }, "refinance", "Home value must be above $0, or leave it empty."],
    ["a payment of a million", { payment: "1,000,000" }, "payment", "Enter a payment under $1,000,000."],
    ["a payment of 6e11", { payment: "600000000000" }, "payment", "Enter a payment under $1,000,000."],
    ["a payment of a tenth of a cent", { payment: "0.001" }, "payment", "Enter a larger monthly payment."],
    ["a payment of $5", { payment: "5" }, "payment", "Enter a larger monthly payment."],
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
    expect(html).toContain("Estimated loan amount$320,000what $2,128.97 a month pays off over 30 years at 7%. No tax or insurance is taken off.");
    expect(html).not.toContain("Full monthly payment");
    expect(html).not.toContain("Estimated monthly payment");
    expect(html).not.toContain("$320,000.30");
  });

  it("says straight under the headline that it is not a lending amount", () => {
    const html = results({}, "payment");
    expect(html.split(NOT_A_LENDING_AMOUNT).length - 1).toBe(1);
    expect(html.indexOf(NOT_A_LENDING_AMOUNT)).toBeGreaterThan(html.indexOf("pays off over"));
    expect(html.indexOf(NOT_A_LENDING_AMOUNT)).toBeLessThan(html.indexOf("Where each payment goes"));
  });

  it("still gives total interest, the payoff, the slider and the balance chart", () => {
    const html = results({}, "payment");
    for (const part of ["Total interest", "Paid off", "mortgage-breakdown-month", "Loan balance at the end of each year"]) expect(html, part).toContain(part);
  });

  it("lists no cost while none is entered, and says nothing of a home value", () => {
    const html = text(results({}, "payment"));
    expect(html).not.toMatch(/HOA|home value|mortgage insurance|Property tax|Homeowners/i);
  });

  it("takes no notice of a home value left over from Refinance: no prompt, and the insurance is counted", () => {
    for (const homeValue of ["400,000", "500,000", "300,000", "abc"]) {
      expect(text(results({ homeValue }, "payment")), homeValue).toBe(text(results({}, "payment")));
      const html = text(results({ payment: "2,278.97", paymentDown: "0", monthlyPmi: "150", homeValue }, "payment"));
      expect(html, homeValue).toContain("Includes mortgage insurance until payment 162.");
      expect(html, homeValue).toContain("after $150.00 a month of mortgage insurance comes off the $2,278.97 payment.");
      expect(html, homeValue).not.toMatch(/home value|most conventional loans/i);
    }
  });

  it("does not draw the balance chart for a term under two years", () => {
    for (const mode of ["purchase", "refinance", "payment"] as const) {
      expect(results({ termYears: "1" }, mode), mode).not.toContain("Loan balance at the end of each year");
      expect(results({ termYears: "1" }, mode), mode).toContain("Total interest");
      expect(results({ termYears: "2" }, mode), mode).toContain("Loan balance at the end of each year");
    }
    // Paid off inside the first year by extra principal: one point again.
    expect(results({ termYears: "2", extraAmount: "300,000", extraFrequency: "one-time" })).not.toContain("Loan balance at the end of each year");
  });

  it("names a one-year term in the singular and keeps the rate as typed", () => {
    expect(text(results({ termYears: "1", rate: "6.125" }, "payment"))).toContain("pays off over 1 year at 6.125%.");
  });

  it("states extra principal beside the payment", () => {
    expect(text(results({ extraAmount: "200" }, "payment"))).toContain("Plus $200 extra principal every month, $2,329 in all.");
  });

  it("shows the payment typed, to the cent, when a fraction of a cent is typed", () => {
    // Only while focus is in the box: on leaving it the box itself becomes 2,128.98. Until then the
    // fraction is cut off, never rounded up: the loan is the one $2,128.97 pays off.
    const values = { ...exampleValues(7, "payment"), payment: "2128.975" };
    expect(calculateMortgage(toInput(values, { month: 0, year: 0 }))!.monthlyPI).toBe(2128.97);
    expect(text(results({ payment: "2128.975" }, "payment"))).toContain("what $2,128.98 a month pays off");
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
    expect(html).toMatch(/^Loan amount estimateThe loanMonthly payment\$2,128\.97Principal and interest\$2,128\.97Down payment20%Interest rate7%Loan term30 years/);
    expect(html).toContain("The estimateEstimated loan amount$320,000Home price$400,000Total interest");
    expect(html).toContain(NOT_A_LENDING_AMOUNT);
    expect(html).not.toMatch(/tax|insurance|HOA|Home value|Mortgage payment estimate/i);
  });

  it("keeps the title for a purchase and a refinance", () => {
    expect(text(printed({}, "purchase"))).toMatch(/^Mortgage payment estimateThe loan/);
    expect(text(printed({}, "refinance"))).toMatch(/^Mortgage payment estimateThe loan/);
  });

  it("includes the costs entered in payment mode, as the other modes do", () => {
    const html = text(printed({ payment: "2,928.97", paymentDown: "0", yearlyTax: "4,800", yearlyInsurance: "1,800", monthlyHoa: "100", monthlyPmi: "150", homeValue: "400,000" }, "payment"));
    expect(html).not.toContain("Home value");
    expect(html).toContain("Monthly payment$2,928.97Property tax$4,800 a yearHomeowners insurance$1,800 a yearHOA dues$100 a monthMortgage insurance$150 a month, until payment 162Principal and interest$2,128.97Down payment0%Interest rate7%Loan term30 yearsFirst paymentJan 2027");
    expect(html).toContain("The estimateEstimated loan amount$320,000Home price$320,000Property tax (monthly)$400Homeowners insurance (monthly)$150HOA dues (monthly)$100Mortgage insurance (monthly)$150Total interest");
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
    expect(about[0]).toMatch(/Payment starts from a whole monthly payment\./);
    expect(about[0]).toContain(NOT_A_LENDING_AMOUNT);
    expect(HOW_IT_WORKS.join(" ")).not.toContain("you typed. It is not");
    expect(HOW_IT_WORKS).toHaveLength(5);
    const all = [...HOW_IT_WORKS, ...QUESTIONS.flatMap((x) => [x.q, x.a])].join(" ");
    // True in every mode: no box named that may not be on screen.
    expect(all).toContain("reach 78% of the home price or home value, then drops it.");
    expect(all).not.toContain("Change the down payment above");
    expect(all).not.toMatch(/78% of the home price(?! or home value)/);
    expect(all).not.toMatch(BAD_WORDS);
    expect(all).not.toMatch(DASHES);
  });
});

describe("payment mode's down payment in the results and in print", () => {
  it("says the home price that goes with the down payment, inside the headline card under the sub line", () => {
    const raw = results({}, "payment");
    const html = text(raw);
    expect(html).toContain("at 7%. No tax or insurance is taken off.With 20% down, that is a home price of $400,000.");
    expect(html).toContain(`With 20% down, that is a home price of $400,000.${NOT_A_LENDING_AMOUNT}`);
    const card = raw.slice(0, raw.indexOf(NOT_A_LENDING_AMOUNT));
    expect(card.split("<div").length - card.split("</div>").length).toBe(0); // the card has closed before the sentence
    expect(raw.indexOf("that is a home price")).toBeLessThan(raw.indexOf("</div>"));
    expect(text(results({ paymentDown: "10" }, "payment"))).toContain("With 10% down, that is a home price of $355,556.");
    expect(text(results({ paymentDown: "3.5" }, "payment"))).toContain("With 3.5% down, that is a home price of $331,607.");
  });

  it("says the home price is the loan amount with nothing down", () => {
    for (const paymentDown of ["", "0"]) {
      const html = text(results({ paymentDown }, "payment"));
      expect(html).toContain("With nothing down, the home price is the loan amount.");
      expect(html).not.toContain("that is a home price of");
    }
  });

  it.each(["100", "abc", "-5", "150"])("asks for a down payment from 0%% to under 100%% when it is %s", (paymentDown) => {
    expect(text(results({ paymentDown }, "payment"))).toBe("Enter a down payment from 0% to under 100%.");
  });

  it("prompts for mortgage insurance under 20% down with none typed, as a purchase does", () => {
    const prompt = "With less than 20% down, most conventional loans add mortgage insurance. Add it under Add detail.";
    expect(text(results({ paymentDown: "10" }, "payment"))).toContain(prompt);
    expect(text(results({ paymentDown: "" }, "payment"))).toContain(prompt);
    expect(text(results({ paymentDown: "10", monthlyPmi: "150" }, "payment"))).not.toContain("most conventional loans");
    expect(text(results({ paymentDown: "10", monthlyPmi: "150" }, "payment"))).toContain("Includes mortgage insurance until payment 115.");
    for (const payment of ["2,128.97", "1,500", "1,234.56", "999.99"]) {
      expect(text(results({ payment }, "payment")), payment).not.toContain("most conventional loans");
      expect(text(results({ payment, monthlyPmi: "150" }, "payment")), payment).not.toMatch(/Includes mortgage insurance|Full monthly payment/);
    }
  });

  it("prints the down payment on the left and the home price on the right", () => {
    const html = text(printed({}, "payment"));
    expect(html).toContain("The loanMonthly payment$2,128.97Principal and interest$2,128.97Down payment20%Interest rate7%Loan term30 years");
    expect(html).toContain("The estimateEstimated loan amount$320,000Home price$400,000Total interest");
    expect(text(printed({ paymentDown: "" }, "payment"))).toContain("Down payment0%Interest rate");
    expect(text(printed({ paymentDown: "" }, "payment"))).toContain("Estimated loan amount$320,000Home price$320,000Total interest");
    expect(text(printed({ paymentDown: "10", monthlyPmi: "150" }, "payment"))).toContain("Mortgage insurance$150 a month, until payment 115");
  });
});

describe("payment mode: costs come off the payment", () => {
  const whole = { payment: "2,679", yearlyTax: "4,800", yearlyInsurance: "1,800" };
  const all = { payment: "2,829", yearlyTax: "4,800", yearlyInsurance: "1,800", monthlyHoa: "100", monthlyPmi: "150", paymentDown: "10" };

  it("with no costs, says nothing is taken off", () => {
    const html = text(results({}, "payment"));
    expect(html).toContain("Estimated loan amount$320,000what $2,128.97 a month pays off over 30 years at 7%. No tax or insurance is taken off.With 20% down, that is a home price of $400,000.");
    expect(html).not.toMatch(/of principal and interest|comes? off|not included/);
  });

  it("with costs, says what is left and what came off", () => {
    expect(text(results(whole, "payment"))).toContain(
      "Estimated loan amount$320,005what $2,129.00 a month of principal and interest pays off over 30 years at 7%, after $550.00 a month of tax and insurance come off the $2,679.00 payment.With 20% down, that is a home price of $400,006.",
    );
    expect(text(results(all, "payment"))).toContain(
      "Estimated loan amount$304,974what $2,029.00 a month of principal and interest pays off over 30 years at 7%, after $800.00 a month of tax, insurance, HOA dues and mortgage insurance come off the $2,829.00 payment.With 10% down, that is a home price of $338,860.",
    );
    expect(text(results(all, "payment"))).toContain("Includes mortgage insurance until payment 115.");
    expect(text(results({ payment: "2,500", monthlyHoa: "100" }, "payment"))).toContain("after $100.00 a month of HOA dues comes off the $2,500.00 payment.");
    expect(text(results(whole, "payment"))).not.toContain("No tax or insurance is taken off.");
  });

  it("lists the costs taken off with \"and\" before the last, and the verb agrees", () => {
    const sub = (changes: Record<string, string>) => text(results(changes, "payment")).match(/, after .*? payment\./)![0];
    // One cost: "comes".
    expect(sub({ payment: "2,529", yearlyTax: "4,800" })).toBe(", after $400.00 a month of tax comes off the $2,529.00 payment.");
    // Two: "and", no comma, "come".
    expect(sub(whole)).toBe(", after $550.00 a month of tax and insurance come off the $2,679.00 payment.");
    // Three or more: commas, then "and" before the last.
    expect(sub({ ...whole, payment: "2,779", monthlyHoa: "100" })).toBe(", after $650.00 a month of tax, insurance and HOA dues come off the $2,779.00 payment.");
    expect(sub(all)).toBe(", after $800.00 a month of tax, insurance, HOA dues and mortgage insurance come off the $2,829.00 payment.");
  });

  it("has no full monthly payment card: the payment typed is the full payment", () => {
    for (const changes of [{}, whole, all]) expect(results(changes, "payment")).not.toContain("Full monthly payment");
    // The ring splits the payment typed.
    const raw = results(all, "payment");
    for (const part of ["Property tax $400", "Homeowners insurance $150", "HOA dues $100", "Mortgage insurance $150"]) expect(raw, part).toContain(part);
    expect(text(raw)).toContain("Total$2,829");
  });

  it("keeps the not-a-lending-amount sentence directly under the card", () => {
    const raw = results(whole, "payment");
    expect(text(raw)).toContain(`that is a home price of $400,006.${NOT_A_LENDING_AMOUNT}Where each payment goes`);
  });

  it("says when the costs take up the whole payment", () => {
    expect(text(results({ ...whole, payment: "500" }, "payment"))).toBe("The costs under Add detail take up the whole payment. Enter a larger monthly payment or lower the costs.");
    expect(text(results({ payment: "5" }, "payment"))).toBe("Enter a larger monthly payment.");
  });

  it("prints the payment, the costs entered, then the principal and interest left", () => {
    expect(text(printed(all, "payment"))).toContain(
      "The loanMonthly payment$2,829.00Property tax$4,800 a yearHomeowners insurance$1,800 a yearHOA dues$100 a monthMortgage insurance$150 a month, until payment 115Principal and interest$2,029.00Down payment10%Interest rate7%Loan term30 years",
    );
    expect(text(printed(all, "payment"))).toContain("The estimateEstimated loan amount$304,974Home price$338,860");
    expect(text(printed(all, "payment"))).not.toContain("Full monthly payment");
    expect(text(printed({ payment: "2,500", monthlyHoa: "100" }, "payment"))).toContain("The loanMonthly payment$2,500.00HOA dues$100 a monthPrincipal and interest$2,400.00Down payment20%");
    expect(text(printed({}, "payment"))).toContain("The loanMonthly payment$2,128.97Principal and interest$2,128.97Down payment20%Interest rate7%");
    expect(text(printed({}, "payment"))).not.toMatch(/tax|insurance|HOA/i);
  });

  it("explains it in the mode paragraph", () => {
    const about = HOW_IT_WORKS.find((p) => /Refinance/.test(p))!;
    expect(about).toContain(
      `Payment starts from a whole monthly payment. Tax, insurance and other costs entered under Add detail come off it, and what is left pays off the loan amount shown at the rate and term entered, with the home price that goes with the down payment entered. ${NOT_A_LENDING_AMOUNT}`,
    );
    expect(about).not.toMatch(/to see the full payment|principal and interest payment/);
  });
});
