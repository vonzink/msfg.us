import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Field } from "../shared/Field";
import { BlendedRateCalculator } from "./BlendedRateCalculator";
import { BlendedPrintSummary } from "./PrintSummary";
import { BlendedResults } from "./Results";
import { calculateBlended } from "./math";
import { EXAMPLE_ROWS, parseCompareRate, toDebts, updateRow, type Row } from "./rows";

const DISCLAIMER = "This is an estimate based on the numbers you entered.";
const page = () => renderToStaticMarkup(<BlendedRateCalculator disclaimer={DISCLAIMER} breakevenHref={null} />);
const calc = (rows: Row[] = EXAMPLE_ROWS, compare = "") => calculateBlended(toDebts(rows), parseCompareRate(compare));
const results = (rows: Row[] = EXAMPLE_ROWS, compare = "", breakevenHref: string | null = null) =>
  renderToStaticMarkup(<BlendedResults result={calc(rows, compare)} disclaimer={DISCLAIMER} breakevenHref={breakevenHref} />);
const count = (html: string, needle: string) => html.split(needle).length - 1;
const set = (index: number, field: "name" | "balance" | "rate" | "payment", value: string, rows = EXAMPLE_ROWS) =>
  updateRow(rows, rows[index].id, field, value);

const BAD_OUTPUT = /NaN|Infinity|\$-|undefined/;
const BAD_WORDS = /qualif|approved|eligible|your rate/i;
const CAUTION = "A lower rate is not the whole decision. Moving a short-term debt into a 30-year loan can lower the rate and still raise the total interest you pay.";

describe("blended rate calculator page", () => {
  it("opens on two debts that blend to 4.565% across $310,000", () => {
    const html = page();
    expect(html).toContain("4.565%");
    expect(html).toContain("$310,000");
    expect(html).toContain(DISCLAIMER);
  });

  it("never prints a broken number or a loan-decision word", () => {
    const html = page();
    expect(html).not.toMatch(BAD_OUTPUT);
    expect(html).not.toMatch(BAD_WORDS);
  });

  it("groups each debt, labels every input, and offers another row", () => {
    const html = page();
    expect(html).toMatch(/<legend[^>]*>Debt 1<\/legend>/);
    expect(html).toMatch(/<legend[^>]*>Debt 2<\/legend>/);
    const ids = [...html.matchAll(/<input[^>]*\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThanOrEqual(9); // 2 rows x (name, balance, rate) + 2 payments + compare
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(html, id).toContain(`for="${id}"`);
    expect(html).toContain("Add another debt");
    expect(count(html, ">Remove<")).toBe(2);
    expect(count(html, "<details data-calc-panel")).toBe(1);
  });

  it("prints a summary, not the form", () => {
    const html = page();
    expect(html).toMatch(/<form[^>]*class="[^"]*print:hidden/);
    expect(html).toContain("Blended rate estimate");
  });
});

describe("shared Field", () => {
  it("gives a text field the normal keyboard and a number field the number pad", () => {
    const render = (type: "text" | "money") =>
      renderToStaticMarkup(<Field def={{ id: "x", label: "X", type, example: "" }} idPrefix="t" values={{}} numbers={{}} onChange={() => {}} />);
    expect(render("text")).toContain('inputMode="text"');
    expect(render("money")).toContain('inputMode="decimal"');
  });
});

describe("blended rate results", () => {
  it("lists each debt with its share of the balance", () => {
    const html = results();
    expect(html).toContain("First mortgage");
    expect(html).toContain("81%");
    expect(html).toContain("19%");
  });

  it("always carries the caution, and links to the breakeven calculator only when it is live", () => {
    expect(results()).toContain(CAUTION);
    expect(results()).not.toContain("Check the breakeven on a refinance");
    expect(results(EXAMPLE_ROWS, "", "/calculators/refinance-breakeven")).toMatch(/href="\/calculators\/refinance-breakeven"[^>]*>Check the breakeven on a refinance/);
  });

  it("compares one new rate in plain words", () => {
    expect(results(EXAMPLE_ROWS, "7")).toContain("A new rate of 7% is 2.435 percentage points above this blended rate.");
    expect(results(EXAMPLE_ROWS, "3")).toContain("A new rate of 3% is 1.565 percentage points below this blended rate.");
    expect(results(set(1, "balance", ""), "3.5")).toContain("A new rate of 3.5% is the same as this blended rate.");
    expect(results()).not.toContain("A new rate of");
    expect(results(EXAMPLE_ROWS, "abc")).not.toContain("A new rate of");
  });

  it("shows the total monthly payment only when a payment was entered", () => {
    expect(results()).not.toContain("Total monthly payment");
    const html = results(set(1, "payment", "450", set(0, "payment", "1,123")));
    expect(html).toContain("Total monthly payment");
    expect(html).toContain("$1,573");
  });

  it("says when a debt has no rate and was counted at 0%", () => {
    expect(results(set(1, "rate", ""))).toContain("Home equity line has no rate entered, so it is counted at 0%.");
    expect(results()).not.toContain("has no rate entered");
  });

  it("asks for a debt when there is no result", () => {
    const html = results(set(1, "balance", "", set(0, "balance", "")));
    expect(html).toMatch(/role="status"[^>]*>Enter a balance and a rate for at least one debt to see the blended rate\./);
    expect(html).not.toMatch(BAD_OUTPUT);
  });
});

describe("blended rate print summary", () => {
  it("lists the debts beside the result", () => {
    const html = renderToStaticMarkup(<BlendedPrintSummary result={calc(EXAMPLE_ROWS, "7")!} />);
    expect(html).toMatch(/^<section[^>]*class="[^"]*hidden[^"]*print:block/);
    for (const text of ["First mortgage", "$250,000 at 3.5%", "Home equity line", "$60,000 at 9%", "Blended rate", "4.565%", "Total balance", "$310,000", "Compared with", "7%"]) {
      expect(html, text).toContain(text);
    }
  });
});
