// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { InvestmentCalculator } from "./InvestmentCalculator";
import fixture from "./InvestmentCalculator.results.fixture.json";

afterEach(cleanup);

const NOTE = "Example rate for illustration, not an offer.";
const DISCLAIMER = "Tenant disclaimer for this test";
const CAUTION_END = "Talk with your tax and investment advisors before you buy.";
const ALL_CASH_HINT = "Not used when paying all cash.";
const calculator = <InvestmentCalculator exampleRatePct={7} exampleRateNote={NOTE} disclaimer={DISCLAIMER} />;
const page = () => renderToStaticMarkup(calculator);
const count = (html: string, needle: string) => html.split(needle).length - 1;
/** Markup with every tag replaced by a space and runs of white space folded into one. */
const textOf = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

// Pins the server-rendered markup so a refactor of the shared kit cannot change what the page shows.
it("renders the same markup as before the shared-kit extraction", () => {
  expect(page()).toMatchSnapshot();
});

describe("the figures for the worked example", () => {
  // The fixture was written from the page before the "Add detail" regrouping, at an example rate of 7.
  // Two regions are compared, as text (see `textOf`):
  //   results: the results column, from the opening tag of <section id="reo-results"> to its closing tag.
  //   below:   everything from the opening tag of <section aria-label="Five-year projection"> to the end
  //            of the markup (the year-by-year table, its notes, the page's own caution and the phone bar),
  //            after cutting out the one <p> element whose whole content is the tenant disclaimer.
  // The tenant disclaimer is new text and sits in `below`, so it is cut before comparing; nothing else is.
  const html = page();
  const resultsStart = html.indexOf('<section id="reo-results"');
  const results = html.slice(resultsStart, html.indexOf("</section>", resultsStart));
  const below = html.slice(html.indexOf('<section aria-label="Five-year projection"')).replace(new RegExp(`<p[^>]*>${DISCLAIMER}</p>`), "");

  it("keeps the results column's text unchanged", () => {
    expect(resultsStart).toBeGreaterThan(-1);
    expect(results).not.toContain(DISCLAIMER);
    expect(textOf(results)).toBe(fixture.results);
  });

  it("keeps the year-by-year table, its notes, the caution and the phone bar unchanged", () => {
    expect(below).not.toContain(DISCLAIMER);
    expect(textOf(below)).toBe(fixture.below);
  });

  it("shows no broken figure", () => {
    expect(textOf(html)).not.toMatch(/NaN|Infinity|undefined/);
  });

  it("has no word that reads as a loan decision or as advice", () => {
    expect(textOf(html)).not.toMatch(/qualif|approved|eligible|your rate|should/i);
  });
});

describe("Add detail", () => {
  const form = () => screen.getByRole("form", { name: "Deal details" });
  /** Titles of the panels in the form, in page order: fixed cards by heading, the rest by summary. */
  const titles = () => Array.from(form().querySelectorAll("h2, summary > span:first-child")).map((e) => e.textContent);
  const addDetail = () => {
    const panels = Array.from(form().querySelectorAll("details")).filter((d) => d.querySelector(":scope > summary > span")?.textContent === "Add detail");
    expect(panels).toHaveLength(1);
    return panels[0];
  };
  const title = (panel: Element) => panel.querySelector(":scope > summary > span")?.textContent;
  const summary = (panel: Element) => panel.querySelector(":scope > summary > span:nth-child(2)")?.textContent;

  it("keeps the deal, closing and expenses up front and puts growth, taxes and opportunity cost behind one closed panel", () => {
    render(calculator);
    expect(titles()).toEqual(["The deal", "Closing and renovation", "Monthly expenses", "Add detail", "Growth and sale", "Income taxes", "Opportunity cost"]);
    const outer = addDetail();
    expect(outer.open).toBe(false);
    expect(outer.parentElement).toBe(form());
    const inner = Array.from(outer.querySelectorAll("details"));
    expect(inner.map(title)).toEqual(["Growth and sale", "Income taxes", "Opportunity cost"]);
    expect(inner.map(summary)).toEqual(["3% appreciation", "24% bracket", "vs 4% a year"]);
    for (const panel of inner) expect(panel.open).toBe(false);
    for (const label of ["Purchase price", "Closing costs", "Insurance"]) expect(outer.contains(screen.getByLabelText(label)), label).toBe(false);
    for (const label of ["Rent increase", "Your tax bracket", "Return elsewhere"]) expect(outer.contains(screen.getByLabelText(label)), label).toBe(true);
  });

  it("marks the outer panel and the three inside it for printing, and the printout opens them all", () => {
    render(calculator);
    const outer = addDetail();
    const panels = [outer, ...Array.from(outer.querySelectorAll("details"))];
    expect(panels).toHaveLength(4);
    for (const panel of panels) expect(panel.matches("details[data-calc-panel]"), title(panel) ?? "").toBe(true);
    fireEvent(window, new Event("beforeprint"));
    for (const panel of Array.from(document.querySelectorAll("details"))) expect(panel.open, title(panel) ?? "").toBe(true);
    fireEvent(window, new Event("afterprint"));
    for (const panel of panels) expect(panel.open, title(panel) ?? "").toBe(false);
  });

  it("turns each inner panel's arrow with its own panel, not with Add detail", () => {
    render(calculator);
    for (const panel of Array.from(addDetail().querySelectorAll("details"))) {
      expect(panel.classList.contains("group/detail"), title(panel) ?? "").toBe(true);
      expect(panel.classList.contains("group"), title(panel) ?? "").toBe(false);
      expect(panel.querySelector(":scope > summary > span[aria-hidden]")!.className).toContain("group-open/detail:-rotate-135");
    }
  });
});

describe("R1: the line under a closed Add detail", () => {
  const line = () => {
    const panels = Array.from(screen.getByRole("form", { name: "Deal details" }).querySelectorAll("details")).filter((d) => d.querySelector(":scope > summary > span")?.textContent === "Add detail");
    expect(panels).toHaveLength(1);
    return panels[0].nextElementSibling as HTMLElement;
  };

  it("joins the three panels' summaries for the worked example, and is left off the printout", () => {
    render(calculator);
    expect(line().tagName).toBe("P");
    expect(line().textContent).toBe("3% appreciation, 24% bracket, vs 4% a year");
    // The printout opens every panel, and each one prints its own summary beside its title.
    expect(line().classList.contains("print:hidden")).toBe(true);
    expect(line().classList.contains("text-muted")).toBe(true);
  });

  it("says Off when the comparison is switched off", () => {
    render(calculator);
    fireEvent.click(screen.getByLabelText("Off"));
    expect(line().textContent).toBe("3% appreciation, 24% bracket, Off");
  });

  it("follows the form after Clear", () => {
    render(calculator);
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(line().textContent).toBe("0% appreciation, 0% bracket, vs 4% a year");
  });
});

describe("R3: the printout's title", () => {
  it("is in the markup once, before the calculator, hidden on screen and shown in print", () => {
    const html = page();
    expect(count(textOf(html), "Investment property estimate")).toBe(1);
    expect(html.startsWith('<h2 class="hidden text-[18px] font-extrabold tracking-[-0.01em] print:block">Investment property estimate</h2>')).toBe(true);
  });
});

describe("O2: the four gauges", () => {
  const TIPS = [
    "Rent collected minus expenses and the mortgage payment, averaged over year 1, before income tax. Dial: Higher keeps 10% or more of the rent, Middle keeps less than that, Lower loses money.",
    "Year-1 cash flow divided by the cash you put in. It ignores appreciation and loan paydown. Dial: Higher is 8% or more, Middle 4% to 8%, Lower under 4%.",
    "A full rented year of net operating income divided by the purchase price. It measures the property itself, ignoring the loan. Dial: Higher is 7% or more, Middle 5% to 7%, Lower under 5%. What's normal varies by market.",
    "Net operating income divided by the yearly mortgage payments. Dial: Higher is 1.25 or more; Middle is 1.00 to 1.25; Lower is under 1.00, where the rent doesn't cover the loan.",
  ];

  it("explains each dial with its definition and its band edges, in neutral words", () => {
    render(calculator);
    expect(screen.getAllByRole("tooltip", { hidden: true }).map((t) => t.textContent)).toEqual(TIPS);
    const labels = ["Monthly cash flow", "Cash-on-cash", "Cap rate", "Debt coverage"];
    labels.forEach((label, i) => expect(screen.getByRole("button", { name: `${label}: ${TIPS[i]}` })).toBeTruthy());
  });

  it("names the worked example's zones Higher, Middle and Middle, with no dial for a cash purchase's debt coverage", () => {
    render(calculator);
    const results = document.getElementById("reo-results")!;
    expect(Array.from(results.querySelectorAll("span.sr-only")).map((s) => s.parentElement!.textContent)).toEqual(["Rating:Higher", "Rating:Middle", "Rating:Middle"]);
  });

  it("uses no grade word and no lender or savings comparison anywhere on the page", () => {
    const html = page();
    expect(html).not.toMatch(/\b(Good|Fair|Poor)\b|most lenders|savings account/);
  });
});

describe("the interest rate field", () => {
  const hint = () => document.getElementById("reo-rate-hint")?.textContent;

  it("says it is not used while All cash is picked, and shows no example-rate note", () => {
    render(calculator);
    expect(hint()).toBe(ALL_CASH_HINT);
    expect(document.body.textContent).not.toContain(NOTE);
  });

  it.each(["Principal + interest", "Interest only"])("shows the tenant's example-rate note under the field for %s", (loanType) => {
    render(calculator);
    fireEvent.click(screen.getByLabelText(loanType));
    expect(hint()).toBe(NOTE);
    expect(screen.getByLabelText("Interest rate").getAttribute("aria-describedby")).toBe("reo-rate-hint");
    expect(count(document.body.textContent!, NOTE)).toBe(1);
  });
});

describe("the tenant disclaimer", () => {
  it("appears once, right after the page's own caution", () => {
    const html = page();
    expect(count(html, DISCLAIMER)).toBe(1);
    expect(count(html, CAUTION_END)).toBe(1);
    expect(textOf(html)).toContain(`${CAUTION_END} ${DISCLAIMER}`);
  });
});
