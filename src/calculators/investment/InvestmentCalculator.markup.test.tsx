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
