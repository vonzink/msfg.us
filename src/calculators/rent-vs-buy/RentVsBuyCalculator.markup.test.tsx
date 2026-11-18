import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { formatUSD } from "@/lib/finance";
import { exampleValues, toInput } from "./fields";
import golden from "./golden.json";
import { calculateRentVsBuy, type RentVsBuyResult } from "./math";
import { RentVsBuyPrintSummary } from "./PrintSummary";
import { RentVsBuyCalculator } from "./RentVsBuyCalculator";
import { assumptionLines, CAUTION, headlineText, pullAheadSentence, RentVsBuyResults } from "./Results";

const NOTE = "Example rate for illustration, not an offer.";
const DISCLAIMER = "This is an estimate based on the numbers you entered.";
const page = () => renderToStaticMarkup(<RentVsBuyCalculator exampleRatePct={7} exampleRateNote={NOTE} disclaimer={DISCLAIMER} />);
const input = (changes: Record<string, string> = {}) => toInput({ ...exampleValues(7), ...changes });
const results = (changes: Record<string, string> = {}) => {
  const i = input(changes);
  return renderToStaticMarkup(<RentVsBuyResults input={i} result={calculateRentVsBuy(i)} disclaimer={DISCLAIMER} />);
};
const count = (html: string, needle: string) => html.split(needle).length - 1;
/** Text as React writes it into markup (an apostrophe becomes an entity). */
const escaped = (text: string) => renderToStaticMarkup(<>{text}</>);
/** A result with only what the two sentence builders read. */
const outcome = (ahead: RentVsBuyResult["ahead"], difference: number, pullAheadYear: number | null) =>
  ({ ahead, difference, pullAheadYear }) as RentVsBuyResult;

const BAD_OUTPUT = /NaN|Infinity|undefined/;
const BAD_WORDS = /qualif|approved|eligible|your rate|should/i;
const EXAMPLE_DIFFERENCE = golden.cases.find((c) => c.name === "example")!.expected.differenceByYear[6];
const RENTING_AHEAD = { monthlyRent: "1,600", stayYears: "3" };
const ZERO_DOWN = { downPayment: "0" };
const EMPTY_COSTS = { yearlyTax: "", yearlyInsurance: "", yearlyMaintenance: "" };
const UNDERWATER = { downPayment: "0", appreciation: "-5", stayYears: "2" };
const GENERAL_PROMPT = "Enter the rent, the home price, the down payment, the interest rate and how long you plan to stay to see the comparison.";
const DOWN_PROMPT = "The down payment is more than the home price.";
const MI_LINE = "With less than 20% down, most loans add mortgage insurance. It is not included here and would raise the cost of buying.";
const UNDERWATER_LINE = "On these numbers the sale would not cover the loan and the selling costs.";
const NOT_INCLUDED = "Not included: mortgage insurance, closing costs on the purchase, HOA dues, renters insurance and income taxes.";

describe("rent vs buy calculator page", () => {
  it("opens on buying ahead by the example's difference, pulling ahead in year 5", () => {
    const html = page();
    expect(formatUSD(EXAMPLE_DIFFERENCE)).toBe("$18,816");
    expect(html).toContain("Estimated difference after 7 years");
    expect(html).toContain("Buying comes out ahead by $18,816");
    expect(html).toContain("on these numbers, counting what is paid and what is left at the end");
    expect(html).toContain("Buying pulls ahead in year 5.");
    expect(html).toContain("$2,129");
    expect(html).toContain(NOTE);
    expect(html).toContain(DISCLAIMER);
  });

  it("never prints a broken number or a word that reads as a decision or advice, whatever the outcome", () => {
    for (const html of [page(), results(RENTING_AHEAD), results(ZERO_DOWN), results(EMPTY_COSTS), results(UNDERWATER), results({ stayYears: "1" }), results({ monthlyRent: "" })]) {
      expect(html).not.toMatch(BAD_OUTPUT);
      expect(html).not.toMatch(BAD_WORDS);
    }
  });

  it("labels every typed field and gives each choice a legend", () => {
    const html = page();
    for (const id of ["monthlyRent", "homePrice", "downPayment", "rate", "stayYears", "yearlyTax", "yearlyInsurance", "yearlyMaintenance", "appreciation", "rentIncrease", "sellingCosts", "investmentReturn"]) {
      expect(count(html, `id="rentbuy-${id}"`), id).toBe(1);
      expect(html, id).toContain(`for="rentbuy-${id}"`);
    }
    expect(html).toMatch(/<legend[^>]*>Down payment as<\/legend>/);
    expect(html).toMatch(/<legend[^>]*>Loan term<\/legend>/);
  });

  it("has the three cards and the line above the detail fields", () => {
    const html = page();
    for (const heading of ["Renting", "Buying", "How long"]) expect(html, heading).toMatch(new RegExp(`<h2[^>]*>${heading}</h2>`));
    expect(html).toContain("These are the assumptions behind the estimate. Change any that do not fit.");
  });

  it("shows every assumption outside the one Add detail panel", () => {
    const html = page();
    expect(count(html, "<details data-calc-panel")).toBe(1);
    const start = html.indexOf("<details");
    const panel = html.slice(start, html.indexOf("</details>", start));
    const outside = html.replace(panel, "");
    expect(panel).toContain("rentbuy-appreciation");
    expect(panel).not.toContain("Assumptions in this estimate");
    expect(outside).toContain("Assumptions in this estimate");
    expect(outside).toContain("Change these under Add detail.");
    const lines = assumptionLines(input());
    expect(lines).toHaveLength(9);
    for (const line of lines) {
      expect(outside, line).toContain(escaped(line));
      expect(panel, line).not.toContain(escaped(line));
    }
  });

  it("prints a summary with the headline, the assumptions and the disclaimer, not the form", () => {
    const html = page();
    expect(html).toMatch(/<form[^>]*class="[^"]*print:hidden/);
    expect(html).toMatch(/<section id="rentbuy-results"[^>]*class="[^"]*print:hidden/);
    const printed = html.slice(html.indexOf('aria-label="Estimate summary"'));
    expect(printed).toContain("Rent vs buy estimate");
    expect(printed).toContain("Buying comes out ahead by $18,816");
    expect(printed).toContain("Buying pulls ahead in year 5.");
    expect(printed).toContain("Assumptions in this estimate");
    for (const line of assumptionLines(input())) expect(printed, line).toContain(escaped(line));
    expect(printed).toContain(CAUTION);
    expect(printed).toContain(DISCLAIMER);
    expect(printed).not.toContain("Change these under Add detail.");
  });

  it("pins the headline to the bottom of a phone screen, linking to the results", () => {
    expect(page()).toMatch(/<a href="#rentbuy-results"[^>]*max-\[980px\]:flex[^>]*print:hidden[^>]*>.*After 7 years.*Buying comes out ahead by \$18,816/);
  });
});

describe("the printed summary", () => {
  it("lists the five front inputs with the payment, beside the estimate", () => {
    const i = input();
    const html = renderToStaticMarkup(<RentVsBuyPrintSummary input={i} result={calculateRentVsBuy(i)!} />);
    for (const text of ["The numbers", "Monthly rent", "$2,400", "Home price", "$400,000", "Down payment", "$80,000", "Interest rate", "7%", "Years you plan to stay", "Mortgage payment", "$2,129"]) {
      expect(html, text).toContain(text);
    }
    for (const text of ["The estimate", "Buying comes out ahead by $18,816", "Year 5", "Net cost of buying", "$169,295", "Net cost of renting", "$188,111", "Equity after selling", "$170,761"]) {
      expect(html, text).toContain(text);
    }
  });
});

describe("the headline", () => {
  it("names the path that comes out ahead, or a tie, and never tells the visitor what to do", () => {
    expect(headlineText(outcome("buying", 18816.32, 5))).toBe("Buying comes out ahead by $18,816");
    expect(headlineText(outcome("renting", -20817.02, null))).toBe("Renting comes out ahead by $20,817");
    expect(headlineText(outcome("even", 0, null))).toBe("The two come out even");
  });

  it("does not call a gap of a few cents $0", () => {
    expect(headlineText(outcome("buying", 0.4, 3))).toBe("Buying comes out ahead by less than $1");
    expect(headlineText(outcome("renting", -0.4, null))).toBe("Renting comes out ahead by less than $1");
  });

  it("reads renting ahead in the renting-ahead case", () => {
    const html = results(RENTING_AHEAD);
    expect(html).toContain("Estimated difference after 3 years");
    expect(html).toMatch(/Renting comes out ahead by \$[\d,]+/);
    expect(html).not.toContain("Buying comes out ahead");
  });

  it("uses one year in the singular", () => {
    expect(results({ stayYears: "1" })).toContain("Estimated difference after 1 year<");
  });
});

describe("the pull-ahead sentence", () => {
  it("has one sentence for each way the years can go", () => {
    expect(pullAheadSentence(outcome("buying", 100, 5), 7)).toBe("Buying pulls ahead in year 5.");
    expect(pullAheadSentence(outcome("buying", 100, 7), 7)).toBe("Buying pulls ahead in year 7.");
    expect(pullAheadSentence(outcome("buying", 100, 1), 7)).toBe("Buying is ahead from the first year.");
    expect(pullAheadSentence(outcome("renting", -100, 9), 7)).toBe("Buying would pull ahead in year 9, after the 7 years you plan to stay.");
    expect(pullAheadSentence(outcome("renting", -100, 4), 1)).toBe("Buying would pull ahead in year 4, after the 1 year you plan to stay.");
    expect(pullAheadSentence(outcome("renting", -100, null), 7)).toBe("Buying does not pull ahead within 40 years on these numbers.");
    expect(pullAheadSentence(outcome("renting", -100, 2), 7)).toBe("Buying is ahead in year 2 but is behind again by year 7.");
  });

  it("never contradicts a tie", () => {
    expect(pullAheadSentence(outcome("even", 0, 9), 7)).toBe("Buying would pull ahead in year 9, after the 7 years you plan to stay.");
    expect(pullAheadSentence(outcome("even", 0, null), 7)).toBe("Buying does not pull ahead within 40 years on these numbers.");
    expect(pullAheadSentence(outcome("even", 0, 2), 7)).toBe("Buying is ahead in year 2 but the two are even by year 7.");
  });

  it("agrees with the headline in real cases", () => {
    const later = calculateRentVsBuy(input(RENTING_AHEAD))!;
    expect(later).toMatchObject({ ahead: "renting", pullAheadYear: 20 });
    expect(results(RENTING_AHEAD)).toContain("Buying would pull ahead in year 20, after the 3 years you plan to stay.");

    const first = { monthlyRent: "6,000" };
    expect(calculateRentVsBuy(input(first))).toMatchObject({ ahead: "buying", pullAheadYear: 1 });
    expect(results(first)).toContain("Buying is ahead from the first year.");

    const never = { monthlyRent: "500", appreciation: "0", rentIncrease: "0" };
    expect(calculateRentVsBuy(input(never))).toMatchObject({ ahead: "renting", pullAheadYear: null });
    expect(results(never)).toContain("Buying does not pull ahead within 40 years on these numbers.");
  });
});

describe("the figures under the headline", () => {
  it("shows the rent now, the payment and the rent in the last year", () => {
    const html = results();
    for (const text of ["Monthly rent now", "$2,400", "Mortgage payment", "principal and interest", "Rent in year 7", "$2,866"]) expect(html, text).toContain(text);
  });

  it("leaves out the last-year rent and the chart for a one-year stay", () => {
    const html = results({ stayYears: "1" });
    expect(html).toContain("Monthly rent now");
    expect(html).not.toContain("Rent in year");
    expect(html).not.toContain("<figure");
    expect(html).not.toContain("Net cost of each path");
  });

  it("charts the net cost of each path, one point per year of the stay", () => {
    const html = results();
    expect(html).toContain("Net cost of each path");
    expect(html).toContain('aria-label="Net cost of each path: Buying, Renting, years 1 to 7"');
    expect(html).toContain("What each path has cost if you stopped at the end of that year. Lower is better.");
    expect(count(results({ stayYears: "2" }), "<polyline")).toBe(2);
  });

  it("lays out each path line by line down to its net cost", () => {
    const html = results();
    for (const text of [
      "Down payment", "$80,000", "Mortgage payments", "$178,833", "Property tax", "$36,780", "Homeowners insurance", "$13,792", "Maintenance", "$30,650",
      "Total paid", "$340,055", "Equity after selling", "-$170,761", "Net cost of buying", "$169,295",
      "Rent paid", "$220,679", "Growth on the down payment, invested", "-$32,568", "Net cost of renting", "$188,111",
    ]) expect(html, text).toContain(text);
  });

  it("shows what the buyer ends up owning", () => {
    const i = input();
    const r = calculateRentVsBuy(i)!;
    const html = results();
    expect(html).toContain("What the buyer ends up owning");
    for (const text of ["Home value", formatUSD(r.buying.homeValue), "Loan balance", formatUSD(-r.buying.loanBalance), "Selling costs", formatUSD(-r.buying.sellingCosts), "$170,761"]) {
      expect(html, text).toContain(text);
    }
  });

  it("says so when the sale would not cover the loan, and only then", () => {
    expect(calculateRentVsBuy(input(UNDERWATER))!.buying.equity).toBeLessThan(0);
    expect(results(UNDERWATER)).toContain(UNDERWATER_LINE);
    expect(results()).not.toContain(UNDERWATER_LINE);
  });

  it("adds the mortgage insurance line only under 20% down", () => {
    expect(results()).not.toContain(MI_LINE);
    expect(results({ downPayment: "19.9" })).toContain(MI_LINE);
    expect(results(ZERO_DOWN)).toContain(MI_LINE);
    expect(results({ downPayment: "" })).toContain(MI_LINE);
    expect(results({ downUnit: "usd", downPayment: "79,999" })).toContain(MI_LINE);
    expect(results({ downUnit: "usd", downPayment: "80,000" })).not.toContain(MI_LINE);
    expect(results({ downPayment: "100" })).not.toContain(MI_LINE);
  });

  it("always ends on the caution and the disclaimer", () => {
    expect(CAUTION).toBe("A comparison like this turns on its assumptions. Home values and rents do not rise at a steady rate, and small changes above can move the result.");
    for (const html of [results(), results(RENTING_AHEAD)]) {
      expect(html).toContain(CAUTION);
      expect(html).toContain(DISCLAIMER);
    }
  });
});

describe("the assumptions list", () => {
  it("states every assumption the example uses", () => {
    expect(assumptionLines(input())).toEqual([
      "Loan term: 30 years",
      "Property tax: $4,800 a year, rising with the home's value",
      "Homeowners insurance: $1,800 a year, rising 3% a year",
      "Maintenance: $4,000 a year, rising 3% a year",
      "Home value rises 3% a year",
      "Rent rises 3% a year",
      "Selling costs: 6% of the sale price",
      "The down payment would earn 5% a year if invested instead",
      NOT_INCLUDED,
    ]);
  });

  it("follows what was typed", () => {
    const lines = assumptionLines(input({ termYears: "15", yearlyTax: "6,000", appreciation: "4.5", rentIncrease: "0", sellingCosts: "5", investmentReturn: "7" }));
    expect(lines).toContain("Loan term: 15 years");
    expect(lines).toContain("Property tax: $6,000 a year, rising with the home's value");
    expect(lines).toContain("Home value rises 4.5% a year");
    expect(lines).toContain("Rent rises 0% a year");
    expect(lines).toContain("Selling costs: 5% of the sale price");
    expect(lines).toContain("The down payment would earn 7% a year if invested instead");
  });

  it("words a falling rate as a fall", () => {
    const lines = assumptionLines(input({ appreciation: "-2", rentIncrease: "-1", investmentReturn: "-3" }));
    expect(lines).toContain("Home value falls 2% a year");
    expect(lines).toContain("Rent falls 1% a year");
    expect(lines).toContain("The down payment would lose 3% a year if invested instead");
  });

  it("says none entered for a cost the math counts as zero", () => {
    const lines = assumptionLines(input({ yearlyTax: "", yearlyInsurance: "abc", yearlyMaintenance: "-50" }));
    expect(lines).toContain("Property tax: none entered");
    expect(lines).toContain("Homeowners insurance: none entered");
    expect(lines).toContain("Maintenance: none entered");
    const html = results(EMPTY_COSTS);
    expect(count(html, "none entered")).toBe(3);
  });
});

describe("nothing to compare", () => {
  it("asks for the five inputs", () => {
    const cases: Record<string, string>[] = [{ monthlyRent: "" }, { homePrice: "" }, { rate: "" }, { stayYears: "" }, { appreciation: "" }];
    for (const changes of cases) {
      const html = results(changes);
      expect(html).toContain(GENERAL_PROMPT);
      expect(html).toContain('role="status"');
      expect(html).not.toContain("comes out ahead");
      expect(html).not.toContain("Assumptions in this estimate");
    }
  });

  it("says so when the down payment is more than the price", () => {
    const cases: Record<string, string>[] = [{ downPayment: "120" }, { downUnit: "usd", downPayment: "500,000" }];
    for (const changes of cases) {
      const html = results(changes);
      expect(html).toContain(DOWN_PROMPT);
      expect(html).toContain('role="status"');
      expect(html).not.toContain(GENERAL_PROMPT);
    }
    // Without a price there is nothing for the down payment to be more than.
    expect(results({ homePrice: "", downUnit: "usd", downPayment: "50,000" })).toContain(GENERAL_PROMPT);
  });

  it("still gives a result with the down payment box empty: that is zero down", () => {
    expect(results({ downPayment: "" })).toContain("comes out ahead by");
  });
});
