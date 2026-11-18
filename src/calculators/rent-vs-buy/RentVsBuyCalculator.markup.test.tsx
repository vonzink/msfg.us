import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { formatUSD } from "@/lib/finance";
import { BLANK, exampleValues, toInput } from "./fields";
import golden from "./golden.json";
import { calculateRentVsBuy, type RentVsBuyInput, type RentVsBuyResult, type YearPoint } from "./math";
import { RentVsBuyPrintDetails, RentVsBuyPrintSummary } from "./PrintSummary";
import { RentVsBuyCalculator } from "./RentVsBuyCalculator";
import { assumptionLines, CAUTION, headlineText, promptText, pullAheadSentence, RentVsBuyResults } from "./Results";

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
const outcome = (ahead: RentVsBuyResult["ahead"], difference: number, pullAheadYear: number | null, differences: number[] = []) =>
  ({ ahead, difference, pullAheadYear, years: differences.map((d, i): YearPoint => ({ year: i + 1, netCostBuying: 0, netCostRenting: d, difference: d })) }) as RentVsBuyResult;

const BAD_OUTPUT = /NaN|Infinity|undefined/;
const BAD_WORDS = /qualif|approved|eligible|your rate|should/i;
const EXAMPLE_DIFFERENCE = golden.cases.find((c) => c.name === "example")!.expected.differenceByYear[6];
const RENTING_AHEAD = { monthlyRent: "1,600", stayYears: "3" };
const ZERO_DOWN = { downPayment: "0" };
const EMPTY_COSTS = { closingCosts: "", yearlyTax: "", yearlyInsurance: "", yearlyMaintenance: "" };
const UNDERWATER = { downPayment: "0", appreciation: "-5", stayYears: "2" };
const GENERAL_PROMPT = "Enter the rent, the home price, the down payment, the interest rate and how long you plan to stay to see the comparison.";
const DOWN_PROMPT = "The down payment is more than the home price.";
const MI_LINE = "With less than 20% down, most loans add mortgage insurance. Enter the monthly amount under Add detail to count it.";
const TAX_NOTE = "The tax saving assumes you itemize deductions and that all of the interest is deductible. Many households take the standard deduction instead, and then there is no saving. This is not tax advice.";
const NOT_INCLUDED = "Not included: renters insurance, and investing any monthly difference between the two payments.";
/** 10% down with mortgage insurance, HOA dues and the interest deduction: figures hand-checked in math.test.ts. */
const FULLER = { downPayment: "10", monthlyMi: "150", monthlyHoa: "200", incomeTaxRate: "22" };
/** The breakdown box under the three figures, from its heading to its closing note. */
const breakdown = (html: string) => {
  const start = html.indexOf("What is in the monthly payment to own");
  expect(start).toBeGreaterThan(-1);
  return html.slice(start, html.indexOf("not in this payment.", start));
};
const UNDERWATER_LINE = "On these numbers the sale would not cover the loan and the selling costs.";
const COSTS_PROMPT = "Add closing costs, property tax, homeowners insurance and maintenance under Add detail to see the comparison. Enter 0 for any that do not apply.";
const ZERO_COSTS = { closingCosts: "0", yearlyTax: "0", yearlyInsurance: "0", yearlyMaintenance: "0" };
const FIVE = { monthlyRent: "2,400", homePrice: "400,000", downPayment: "20", rate: "7", stayYears: "7" };
/** The reviewer's case: buying ahead after 35 years, but behind in years 7 to 20. */
const SLIPS_BACK = {
  monthlyRent: "5,894", homePrice: "462,086", downUnit: "usd", downPayment: "16,173", rate: "11.75", termYears: "20", stayYears: "35",
  closingCosts: "0", yearlyTax: "544", yearlyInsurance: "4,621", yearlyMaintenance: "8,156", appreciation: "1", rentIncrease: "-4", sellingCosts: "6", investmentReturn: "-4",
};
const printDetails = (changes: Record<string, string> = {}) => {
  const i = input(changes);
  return renderToStaticMarkup(<RentVsBuyPrintDetails input={i} result={calculateRentVsBuy(i)!} disclaimer={DISCLAIMER} />);
};

describe("rent vs buy calculator page", () => {
  it("opens on buying ahead by the example's difference less $8,000 of closing costs, pulling ahead in year 6", () => {
    const html = page();
    expect(formatUSD(EXAMPLE_DIFFERENCE)).toBe("$18,816");
    expect(formatUSD(EXAMPLE_DIFFERENCE - 8000)).toBe("$10,816");
    expect(html).toContain("Estimated difference after 7 years");
    expect(html).toContain("Buying comes out ahead by $10,816");
    expect(html).not.toContain("$18,816");
    expect(html).toContain("on these numbers, counting what is paid and what is left at the end");
    expect(html).toContain("Buying pulls ahead in year 6.");
    expect(html).not.toContain("year 5");
    expect(html).toContain("$2,129");
    expect(html).toContain(NOTE);
    expect(html).toContain(DISCLAIMER);
  });

  it("never prints a broken number or a word that reads as a decision or advice, whatever the outcome", () => {
    const all = [
      page(), results(RENTING_AHEAD), results(ZERO_DOWN), results(EMPTY_COSTS), results(ZERO_COSTS), results(UNDERWATER), results(SLIPS_BACK),
      results({ stayYears: "1" }), results({ monthlyRent: "" }), results({ downPayment: "" }), results({ rate: "45" }), results({ stayYears: "50" }),
      results({ appreciation: "" }), results({ rentIncrease: "99" }), results({ sellingCosts: "25" }), results({ investmentReturn: "-3" }),
      printDetails(), printDetails(UNDERWATER), printDetails(SLIPS_BACK),
      results(FULLER), printDetails(FULLER), results({ monthlyMi: "150" }), results({ incomeTaxRate: "abc" }), results({ monthlyHoa: "abc" }), results({ incomeTaxRate: "60" }),
    ];
    for (const html of all) {
      expect(html).not.toMatch(BAD_OUTPUT);
      expect(html).not.toMatch(BAD_WORDS);
      expect(html).not.toMatch(/[—–]/);
      expect(html).not.toContain("-$0");
    }
  });

  it("labels every typed field and gives each choice a legend", () => {
    const html = page();
    for (const id of ["monthlyRent", "homePrice", "downPayment", "rate", "stayYears", "closingCosts", "yearlyTax", "yearlyInsurance", "monthlyMi", "monthlyHoa", "yearlyMaintenance", "incomeTaxRate", "appreciation", "rentIncrease", "sellingCosts", "investmentReturn"]) {
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

  it("no longer lists the assumptions on screen: the fields under Add detail are where they live", () => {
    const html = page();
    expect(count(html, "<details data-calc-panel")).toBe(1);
    const screen = html.slice(0, html.indexOf('aria-label="Estimate summary"'));
    expect(screen).toContain("rentbuy-appreciation");
    expect(screen).not.toContain("Assumptions in this estimate");
    expect(html).not.toContain("Change these under Add detail.");
    expect(count(html, "Assumptions in this estimate")).toBe(1);
    for (const changes of [{}, RENTING_AHEAD, FULLER, UNDERWATER]) {
      const shown = results(changes);
      expect(shown).not.toContain("Assumptions in this estimate");
      expect(shown).not.toContain("Change these under Add detail.");
      expect(shown).not.toContain("Not included");
      expect(shown).not.toContain("Loan term:");
    }
    // The line above the detail fields stays.
    expect(html).toContain("These are the assumptions behind the estimate. Change any that do not fit.");
  });

  it("prints a summary with the headline, the assumptions and the disclaimer, not the form", () => {
    const html = page();
    expect(html).toMatch(/<form[^>]*class="[^"]*print:hidden/);
    expect(html).toMatch(/<section id="rentbuy-results"[^>]*class="[^"]*print:hidden/);
    const printed = html.slice(html.indexOf('aria-label="Estimate summary"'));
    expect(printed).toContain("Rent vs buy estimate");
    expect(printed).toContain("Buying comes out ahead by $10,816");
    expect(printed).toContain("Buying pulls ahead in year 6.");
    expect(printed).toContain("Assumptions in this estimate");
    const lines = assumptionLines(input());
    expect(lines).toHaveLength(12);
    for (const line of lines) expect(printed, line).toContain(escaped(line));
    expect(printed).toContain(CAUTION);
    expect(printed).toContain(DISCLAIMER);
    expect(printed).not.toContain("Change these under Add detail.");
  });

  it("pins the headline to the bottom of a phone screen, linking to the results", () => {
    expect(page()).toMatch(/<a href="#rentbuy-results"[^>]*max-\[980px\]:flex[^>]*print:hidden[^>]*>.*After 7 years.*Buying comes out ahead by \$10,816/);
  });
});

describe("the printed summary", () => {
  it("lists the five front inputs with the payment, beside the estimate", () => {
    const i = input();
    const html = renderToStaticMarkup(<RentVsBuyPrintSummary input={i} result={calculateRentVsBuy(i)!} />);
    for (const text of ["The numbers", "Monthly rent", "$2,400", "Home price", "$400,000", "Down payment", "$80,000", "Closing costs", "$8,000", "Interest rate", "7%", "Years you plan to stay", "Monthly payment to own", "$2,679", "Principal and interest", "$2,129"]) {
      expect(html, text).toContain(text);
    }
    expect(html).not.toContain("Mortgage payment");
    expect(html).not.toContain("Income tax saved");
    for (const text of ["The estimate", "Buying comes out ahead by $10,816", "Year 6", "Net cost of buying", "$177,295", "Net cost of renting", "$188,111", "Equity after selling", "$170,761"]) {
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

  it("F7: says so when buying is ahead at the end but was not ahead in every year since it first was", () => {
    expect(pullAheadSentence(outcome("buying", 100, 2, [-5, 3, -1, -1, 2, 50, 100]), 7)).toBe("Buying is first ahead in year 2, but not in every year after.");
    expect(pullAheadSentence(outcome("buying", 100, 1, [3, 0, 100]), 3)).toBe("Buying is first ahead in year 1, but not in every year after.");
    // Ahead in every year from the first one: the plain sentences stand.
    expect(pullAheadSentence(outcome("buying", 100, 2, [-5, 3, 4, 5, 6, 50, 100]), 7)).toBe("Buying pulls ahead in year 2.");
    expect(pullAheadSentence(outcome("buying", 100, 1, [3, 4, 100]), 3)).toBe("Buying is ahead from the first year.");
    // Renting ahead at the end keeps its own sentence.
    expect(pullAheadSentence(outcome("renting", -100, 2, [-5, 3, -1, -100]), 4)).toBe("Buying is ahead in year 2 but is behind again by year 4.");
  });

  it("F7: the reviewer's case reads first ahead in year 5, on screen and in print", () => {
    const sentence = "Buying is first ahead in year 5, but not in every year after.";
    const html = results(SLIPS_BACK);
    expect(html).toMatch(/Buying comes out ahead by \$[\d,]+/);
    expect(html).toContain(sentence);
    expect(html).not.toContain("Buying pulls ahead in year 5.");
    expect(printDetails(SLIPS_BACK)).toContain(sentence);
  });

  it("never contradicts a tie", () => {
    expect(pullAheadSentence(outcome("even", 0, 9), 7)).toBe("Buying would pull ahead in year 9, after the 7 years you plan to stay.");
    expect(pullAheadSentence(outcome("even", 0, null), 7)).toBe("Buying does not pull ahead within 40 years on these numbers.");
    expect(pullAheadSentence(outcome("even", 0, 2), 7)).toBe("Buying is ahead in year 2 but the two are even by year 7.");
  });

  it("agrees with the headline in real cases", () => {
    // Pinned without closing costs, as recorded before the field existed.
    const laterCase = { ...RENTING_AHEAD, closingCosts: "0" };
    const later = calculateRentVsBuy(input(laterCase))!;
    expect(later).toMatchObject({ ahead: "renting", pullAheadYear: 20 });
    expect(results(laterCase)).toContain("Buying would pull ahead in year 20, after the 3 years you plan to stay.");

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
    for (const text of ["Monthly rent now", "$2,400", "Monthly payment to own", "$2,679", "Rent in year 7", "$2,866"]) expect(html, text).toContain(text);
    expect(html).toContain(">principal, interest, tax and insurance<");
    expect(html).not.toContain("Mortgage payment<");
  });

  it("names mortgage insurance and HOA dues in the payment to own when they are in it", () => {
    expect(results(FULLER)).toContain("$3,295");
    expect(results(FULLER)).toContain(">principal, interest, tax and insurance, mortgage insurance, HOA dues<");
    expect(results({ monthlyHoa: "200" })).toContain(">principal, interest, tax and insurance, HOA dues<");
    expect(results({ downPayment: "10", monthlyMi: "150" })).toContain(">principal, interest, tax and insurance, mortgage insurance<");
    // Typed with 20% down, mortgage insurance is not charged and not named.
    expect(results({ monthlyMi: "150" })).toContain(">principal, interest, tax and insurance<");
    expect(results({ monthlyMi: "150" })).toContain("$2,679");
  });

  it("breaks the payment to own into its parts, with their total", () => {
    const box = breakdown(results());
    const line = (label: string, value: string) => new RegExp(`<dt>${label}</dt><dd[^>]*>\\${value}</dd>`);
    expect(box).toMatch(line("Principal and interest", "$2,129"));
    expect(box).toMatch(line("Property tax", "$400"));
    expect(box).toMatch(line("Homeowners insurance", "$150"));
    expect(box).toMatch(line("Monthly payment to own", "$2,679"));
    expect(box).not.toContain("Mortgage insurance");
    expect(box).not.toContain("HOA dues");
    expect(box).not.toContain("Maintenance<");
    expect(results()).toContain("Maintenance is counted in the totals below, not in this payment.");
    expect(results()).not.toContain("the tax saving");

    const fuller = breakdown(results(FULLER));
    expect(fuller).toMatch(line("Principal and interest", "$2,395"));
    expect(fuller).toMatch(line("Mortgage insurance", "$150"));
    expect(fuller).toMatch(line("HOA dues", "$200"));
    expect(fuller).toMatch(line("Monthly payment to own", "$3,295"));
    expect(fuller.indexOf("Homeowners insurance")).toBeLessThan(fuller.indexOf("Mortgage insurance"));
    expect(fuller.indexOf("Mortgage insurance")).toBeLessThan(fuller.indexOf("HOA dues"));
    expect(results(FULLER)).toContain("Maintenance and the tax saving are counted in the totals below, not in this payment.");
    // The breakdown is there for a one-year stay too.
    expect(breakdown(results({ stayYears: "1" }))).toMatch(line("Monthly payment to own", "$2,679"));
  });

  it("adds mortgage insurance and HOA dues to the Buying column when entered, and only then", () => {
    const html = results(FULLER);
    const column = html.slice(html.indexOf(">Buying</h2>"), html.indexOf(">Renting</h2>"));
    for (const text of ["Down payment", "$40,000", "Mortgage insurance", "$12,600", "HOA dues", "$18,390", "Total paid", "$361,399", "Net cost of buying", "$189,848"]) {
      expect(column, text).toContain(text);
    }
    expect(column).toMatch(/<dt>Homeowners insurance<\/dt>.*<dt>Mortgage insurance<\/dt>.*<dt>HOA dues<\/dt>.*<dt>Maintenance<\/dt>.*<dt>Total paid<\/dt>/);
    const plain = results();
    const plainColumn = plain.slice(plain.indexOf(">Buying</h2>"), plain.indexOf(">Renting</h2>"));
    expect(plainColumn).not.toContain("Mortgage insurance");
    expect(plainColumn).not.toContain("HOA dues");
    expect(plainColumn).not.toContain("Income tax saved");
  });

  it("takes the income tax saved on the interest off after Total paid, with the sentence about itemizing", () => {
    const html = results(FULLER);
    const column = html.slice(html.indexOf(">Buying</h2>"), html.indexOf(">Renting</h2>"));
    expect(column).toMatch(/<dt>Total paid<\/dt><dd[^>]*>\$361,399<\/dd><\/div><div[^>]*><dt>Income tax saved on mortgage interest<\/dt><dd[^>]*>-\$37,250<\/dd>/);
    expect(column).toContain(TAX_NOTE);
    expect(html).toContain("Buying comes out ahead by $14,547");
    expect(html).toContain("Buying pulls ahead in year 6.");
    expect(results({ incomeTaxRate: "22" })).toContain("Buying comes out ahead by $43,927");
    for (const off of [results(), results({ incomeTaxRate: "0" }), results({ incomeTaxRate: "" })]) {
      expect(off).not.toContain("Income tax saved");
      expect(off).not.toContain(TAX_NOTE);
      expect(off).toContain("Buying comes out ahead by $10,816");
    }
    // A rate with no interest to deduct takes nothing off and never prints "-$0".
    const noLoan = results({ downPayment: "100", incomeTaxRate: "22" });
    expect(noLoan).toMatch(/<dt>Income tax saved on mortgage interest<\/dt><dd[^>]*>\$0<\/dd>/);
  });

  it("prints the tax saving and its sentence when the deduction is counted, and only then", () => {
    expect(printDetails(FULLER)).toContain(TAX_NOTE);
    expect(printDetails()).not.toContain(TAX_NOTE);
    const i = input(FULLER);
    const summary = renderToStaticMarkup(<RentVsBuyPrintSummary input={i} result={calculateRentVsBuy(i)!} />);
    for (const text of ["Monthly payment to own", "$3,295", "Principal and interest", "$2,395", "Income tax saved on mortgage interest", "$37,250", "Buying comes out ahead by $14,547"]) {
      expect(summary, text).toContain(text);
    }
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
      "Down payment", "$80,000", "Closing costs", "$8,000", "Mortgage payments", "$178,833", "Property tax", "$36,780", "Homeowners insurance", "$13,792", "Maintenance", "$30,650",
      "Total paid", "$348,055", "Equity after selling", "-$170,761", "Net cost of buying", "$177,295",
      "Rent paid", "$220,679", "Growth on the down payment, invested", "-$32,568", "Net cost of renting", "$188,111",
    ]) expect(html, text).toContain(text);
    // Closing costs sit directly after the down payment in the Buying column.
    expect(html).toMatch(/<dt>Down payment<\/dt><dd[^>]*>\$80,000<\/dd><\/div><div[^>]*><dt>Closing costs<\/dt><dd[^>]*>\$8,000<\/dd>/);
    expect(results({ closingCosts: "0" })).toMatch(/<dt>Closing costs<\/dt><dd[^>]*>\$0<\/dd>/);
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

  it("F4: says so on the printed page too, and only then", () => {
    expect(printDetails(UNDERWATER)).toContain(UNDERWATER_LINE);
    expect(printDetails()).not.toContain(UNDERWATER_LINE);
  });

  it("F4: a negative equity is a shortfall added to the cost of buying, as a positive figure", () => {
    const { buying } = calculateRentVsBuy(input(UNDERWATER))!;
    const shortfall = formatUSD(-buying.equity);
    expect(shortfall).toMatch(/^\$[\d,]+$/);
    expect(buying.netCost).toBeCloseTo(buying.totalPaid - buying.equity, 2);
    const html = results(UNDERWATER);
    expect(html).toMatch(new RegExp(`<dt>Shortfall after selling, added</dt><dd[^>]*>${shortfall.replace("$", "\\$")}</dd>`));
    // "Equity after selling" is left only as the total of the box that works it out.
    expect(count(html, "<dt>Equity after selling</dt>")).toBe(1);
    expect(count(results(), "<dt>Equity after selling</dt>")).toBe(2);
    expect(results()).not.toContain("Shortfall after selling");
  });

  it("F4: a loss on the down payment is added to the cost of renting, as a positive figure", () => {
    const changes = { investmentReturn: "-3" };
    const { renting } = calculateRentVsBuy(input(changes))!;
    expect(renting.downPaymentGrowth).toBeLessThan(0);
    const loss = formatUSD(-renting.downPaymentGrowth);
    const html = results(changes);
    expect(html).toMatch(new RegExp(`<dt>Loss on the down payment, added</dt><dd[^>]*>${loss.replace("$", "\\$")}</dd>`));
    expect(html).not.toContain("Growth on the down payment, invested");
    expect(results()).not.toContain("Loss on the down payment");
  });

  it("F4: never prints -$0 for a line that takes nothing off", () => {
    // Nothing down: no growth. All cash: no loan balance. No selling costs.
    const nothingDown = results(ZERO_DOWN);
    expect(nothingDown).toMatch(/<dt>Growth on the down payment, invested<\/dt><dd[^>]*>\$0<\/dd>/);
    const allCash = results({ downPayment: "100", sellingCosts: "0" });
    expect(allCash).toMatch(/<dt>Loan balance<\/dt><dd[^>]*>\$0<\/dd>/);
    expect(allCash).toMatch(/<dt>Selling costs<\/dt><dd[^>]*>\$0<\/dd>/);
    for (const html of [nothingDown, allCash]) expect(html).not.toContain("-$0");
  });

  it("asks for the mortgage insurance amount only under 20% down with none entered", () => {
    expect(MI_LINE).not.toMatch(BAD_WORDS);
    for (const changes of [{ downPayment: "10", monthlyMi: "150" }, FULLER, { downPayment: "0", monthlyMi: "1" }]) {
      expect(results(changes), JSON.stringify(changes)).not.toContain("most loans add mortgage insurance");
      expect(printDetails(changes), JSON.stringify(changes)).not.toContain("most loans add mortgage insurance");
    }
    expect(results({ downPayment: "10", monthlyMi: "0" })).toContain(MI_LINE);
    expect(results({ downPayment: "10", monthlyMi: "-5" })).toContain(MI_LINE);
    expect(printDetails({ downPayment: "10" })).toContain(MI_LINE);
    expect(results()).not.toContain(MI_LINE);
    expect(results({ downPayment: "19.9" })).toContain(MI_LINE);
    expect(results(ZERO_DOWN)).toContain(MI_LINE);
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

describe("the assumptions list, on the printed page only", () => {
  it("states every assumption the example uses", () => {
    expect(assumptionLines(input())).toEqual([
      "Loan term: 30 years",
      "Closing costs on the purchase: $8,000",
      "Property tax: $4,800 a year, rising with the home's value",
      "Homeowners insurance: $1,800 a year, rising 3% a year",
      "Mortgage insurance: none",
      "HOA dues: none",
      "Maintenance: $4,000 a year, rising 3% a year",
      "Home value rises 3% a year",
      "Rent rises 3% a year",
      "Selling costs: 6% of the sale price",
      "The down payment would earn 5% a year if invested instead",
      NOT_INCLUDED,
    ]);
  });

  it("states mortgage insurance, HOA dues and the income tax rate when they are used", () => {
    const lines = assumptionLines(input(FULLER));
    expect(lines).toHaveLength(13);
    expect(lines).toContain("Mortgage insurance: $150 a month until the loan balance reaches 78% of the home price");
    expect(lines).toContain("HOA dues: $200 a month, rising 3% a year");
    expect(lines.at(-2)).toBe("Income tax rate for the interest deduction: 22%");
    expect(lines.at(-1)).toBe(NOT_INCLUDED);
    const printed = printDetails(FULLER);
    for (const line of lines) expect(printed, line).toContain(escaped(line));
  });

  it("says mortgage insurance is not counted when it was typed with 20% or more down", () => {
    expect(assumptionLines(input({ monthlyMi: "150" }))).toContain("Mortgage insurance: not counted, the down payment is 20% or more");
    expect(assumptionLines(input({ downPayment: "19.9", monthlyMi: "150" }))).toContain("Mortgage insurance: $150 a month until the loan balance reaches 78% of the home price");
    expect(assumptionLines(input({ downPayment: "10", monthlyMi: "-150" }))).toContain("Mortgage insurance: none");
    expect(assumptionLines(input({ monthlyHoa: "-20" }))).toContain("HOA dues: none");
    expect(assumptionLines(input({ incomeTaxRate: "0" })).join(" ")).not.toContain("Income tax rate");
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

  it("F1: reads $0 a year for a typed 0, and never none entered", () => {
    const lines = assumptionLines(input({ closingCosts: "0", yearlyTax: "0", yearlyInsurance: "0", yearlyMaintenance: "-50" }));
    expect(lines).toContain("Closing costs on the purchase: $0");
    expect(assumptionLines(input({ closingCosts: "-900" }))).toContain("Closing costs on the purchase: $0");
    expect(assumptionLines(input({ closingCosts: "12,500" }))).toContain("Closing costs on the purchase: $12,500");
    expect(lines).toContain("Property tax: $0 a year");
    expect(lines).toContain("Homeowners insurance: $0 a year");
    expect(lines).toContain("Maintenance: $0 a year");
    expect(results(ZERO_COSTS)).toContain("comes out ahead by");
    const printed = printDetails(ZERO_COSTS);
    expect(count(printed, "$0 a year")).toBe(3);
    expect(printed).not.toContain("none entered");
  });

  it("says what is not included, in print and not on screen", () => {
    expect(printDetails()).toContain(NOT_INCLUDED);
    expect(printDetails()).not.toContain("Not included on the");
    expect(results()).not.toContain("Not included");
  });
});

describe("nothing to compare", () => {
  const prompt = (changes: Record<string, string>) => promptText(input(changes));
  const promptFor = (changes: Partial<RentVsBuyInput>) => promptText({ ...input(), ...changes });

  it("F3: asks for the five inputs when one of them is missing", () => {
    const cases: Record<string, string>[] = [
      { monthlyRent: "" }, { monthlyRent: "0" }, { homePrice: "" }, { downPayment: "" }, { downPayment: "2..5" }, { rate: "" }, { rate: "7..5" },
      { stayYears: "" }, { stayYears: "abc" }, BLANK,
    ];
    for (const changes of cases) {
      expect(prompt(changes), JSON.stringify(changes)).toBe(GENERAL_PROMPT);
      const html = results(changes);
      expect(html).toContain(GENERAL_PROMPT);
      expect(html).toContain('role="status"');
      expect(html).not.toContain("comes out ahead");
      expect(html).not.toContain("Assumptions in this estimate");
    }
  });

  it("F3: says so when the down payment is more than the price", () => {
    const cases: Record<string, string>[] = [{ downPayment: "120" }, { downUnit: "usd", downPayment: "500,000" }];
    for (const changes of cases) {
      expect(prompt(changes)).toBe(DOWN_PROMPT);
      const html = results(changes);
      expect(html).toContain(DOWN_PROMPT);
      expect(html).toContain('role="status"');
      expect(html).not.toContain(GENERAL_PROMPT);
    }
    // Without a price there is nothing for the down payment to be more than.
    expect(results({ homePrice: "", downUnit: "usd", downPayment: "50,000" })).toContain(GENERAL_PROMPT);
  });

  it("F3: names an interest rate outside 0% to under 30%", () => {
    const message = "Enter an interest rate from 0% to under 30%.";
    for (const rate of ["30", "99", "-1"]) expect(prompt({ rate }), rate).toBe(message);
    expect(results({ rate: "30" })).toContain(message);
    expect(results({ rate: "29.99" })).toContain("comes out ahead by");
  });

  it("F3: names a stay outside 1 to 40 years", () => {
    const message = "Enter a stay from 1 to 40 years.";
    for (const stayYears of ["0", "41", "100", "-3"]) expect(prompt({ stayYears }), stayYears).toBe(message);
    expect(promptFor({ stayYears: 7.5 })).toBe(message);
    expect(results({ stayYears: "41" })).toContain(message);
  });

  it("F1: asks for the four costs when they are the only thing missing", () => {
    const cases: Record<string, string>[] = [EMPTY_COSTS, { closingCosts: "" }, { closingCosts: "8..0" }, { yearlyTax: "" }, { yearlyInsurance: "abc" }, { yearlyMaintenance: "4..0" }];
    for (const changes of cases) {
      expect(prompt(changes), JSON.stringify(changes)).toBe(COSTS_PROMPT);
    }
    const html = results(EMPTY_COSTS);
    expect(html).toContain(COSTS_PROMPT);
    expect(html).toContain('role="status"');
    expect(html).not.toContain("comes out ahead");
    // A front field still missing comes first.
    expect(prompt({ ...EMPTY_COSTS, monthlyRent: "" })).toBe(GENERAL_PROMPT);
  });

  it("F1: Clear, then the example's five numbers, asks for the costs and shows no comparison", () => {
    const i = toInput({ ...BLANK, ...FIVE });
    const html = renderToStaticMarkup(<RentVsBuyResults input={i} result={calculateRentVsBuy(i)} disclaimer={DISCLAIMER} />);
    expect(html).toContain(COSTS_PROMPT);
    expect(html).not.toContain("comes out ahead");
    expect(html).not.toContain("$100,038");
    const filled = toInput({ ...BLANK, ...FIVE, closingCosts: "8,000", yearlyTax: "4,800", yearlyInsurance: "1,800", yearlyMaintenance: "4,000" });
    expect(renderToStaticMarkup(<RentVsBuyResults input={filled} result={calculateRentVsBuy(filled)} disclaimer={DISCLAIMER} />)).toContain("Buying comes out ahead by $10,816");
  });

  it("F3: names an assumption rate that is empty or not a number", () => {
    const labels: Record<string, string> = {
      appreciation: "Home value rises", rentIncrease: "Rent rises", sellingCosts: "Selling costs", investmentReturn: "Return if the down payment were invested",
    };
    for (const [id, label] of Object.entries(labels)) {
      for (const text of ["", ".", "abc"]) expect(prompt({ [id]: text }), `${id} ${JSON.stringify(text)}`).toBe(`Enter a number for ${label}. 0 is allowed.`);
    }
    expect(results({ appreciation: "" })).toContain("Enter a number for Home value rises. 0 is allowed.");
    expect(results({ appreciation: "" })).toContain('role="status"');
  });

  it("F3: names an assumption rate that is out of range, with the range", () => {
    expect(prompt({ appreciation: "31" })).toBe("Home value rises must be between -20% and 30%.");
    expect(prompt({ appreciation: "-21" })).toBe("Home value rises must be between -20% and 30%.");
    expect(prompt({ rentIncrease: "45" })).toBe("Rent rises must be between -20% and 30%.");
    expect(prompt({ investmentReturn: "-25" })).toBe("Return if the down payment were invested must be between -20% and 30%.");
    expect(prompt({ sellingCosts: "21" })).toBe("Selling costs must be between 0% and 20%.");
    expect(prompt({ sellingCosts: "-1" })).toBe("Selling costs must be between 0% and 20%.");
    expect(results({ sellingCosts: "21" })).toContain("Selling costs must be between 0% and 20%.");
  });

  it("names unreadable mortgage insurance or HOA dues, which may be left empty", () => {
    expect(prompt({ monthlyMi: "abc" })).toBe("Enter a number for Mortgage insurance, or leave it empty.");
    expect(prompt({ monthlyHoa: "2..0" })).toBe("Enter a number for HOA dues, or leave it empty.");
    expect(results({ monthlyHoa: "abc" })).toContain("Enter a number for HOA dues, or leave it empty.");
    expect(results({ monthlyHoa: "abc" })).toContain('role="status"');
    expect(results({ monthlyMi: "", monthlyHoa: "" })).toContain("comes out ahead by");
  });

  it("names an income tax rate that is unreadable or outside 0% to 50%", () => {
    expect(prompt({ incomeTaxRate: "abc" })).toBe("Enter a number for Income tax rate, or leave it empty.");
    expect(prompt({ incomeTaxRate: "." })).toBe("Enter a number for Income tax rate, or leave it empty.");
    expect(prompt({ incomeTaxRate: "51" })).toBe("Income tax rate must be between 0% and 50%.");
    expect(prompt({ incomeTaxRate: "-5" })).toBe("Income tax rate must be between 0% and 50%.");
    expect(results({ incomeTaxRate: "60" })).toContain("Income tax rate must be between 0% and 50%.");
    expect(results({ incomeTaxRate: "50" })).toContain("comes out ahead by");
    // The must-enter costs and the four assumption rates come first.
    expect(prompt({ incomeTaxRate: "abc", monthlyMi: "abc", yearlyTax: "" })).toBe(COSTS_PROMPT);
    expect(prompt({ incomeTaxRate: "abc", monthlyMi: "abc" })).toBe("Enter a number for Mortgage insurance, or leave it empty.");
    expect(prompt({ incomeTaxRate: "abc", appreciation: "" })).toBe("Enter a number for Home value rises. 0 is allowed.");
    expect(prompt({ incomeTaxRate: "60", sellingCosts: "50" })).toBe("Selling costs must be between 0% and 20%.");
  });

  it("F3: gives the first message that applies, in the pinned order", () => {
    const everything = { downPayment: "120", monthlyRent: "", rate: "45", stayYears: "50", ...EMPTY_COSTS, appreciation: "", rentIncrease: "99" };
    expect(prompt(everything)).toBe(DOWN_PROMPT);
    expect(prompt({ ...everything, downPayment: "20" })).toBe(GENERAL_PROMPT);
    expect(prompt({ ...everything, downPayment: "20", monthlyRent: "2,400" })).toBe("Enter an interest rate from 0% to under 30%.");
    expect(prompt({ ...everything, downPayment: "20", monthlyRent: "2,400", rate: "7" })).toBe("Enter a stay from 1 to 40 years.");
    expect(prompt({ ...EMPTY_COSTS, appreciation: "", rentIncrease: "99" })).toBe(COSTS_PROMPT);
    expect(prompt({ appreciation: "", rentIncrease: "99" })).toBe("Enter a number for Home value rises. 0 is allowed.");
    expect(prompt({ rentIncrease: "99", sellingCosts: "" })).toBe("Enter a number for Selling costs. 0 is allowed.");
    expect(prompt({ rentIncrease: "99", sellingCosts: "50" })).toBe("Rent rises must be between -20% and 30%.");
  });

  it("F3: has a message for every input the model turns down", () => {
    expect(promptFor({ downPayment: -1 })).toBe(GENERAL_PROMPT);
    expect(promptFor({ termMonths: 0 })).toBe(GENERAL_PROMPT);
  });

  it("F2: gives no result with the down payment box empty; a typed 0 is zero down", () => {
    expect(results({ downPayment: "" })).not.toContain("comes out ahead");
    expect(results({ downPayment: "0" })).toContain("comes out ahead by");
  });
});
