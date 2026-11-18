import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { exampleValues, toInput } from "./fields";
import { calculateMortgage } from "./math";
import { PaymentBreakdown } from "./PaymentBreakdown";
import { PrintSummary } from "./PrintSummary";
import { PaymentRows, Schedule } from "./Schedule";

const START = { month: 0, year: 2027 };
const input = (changes: Record<string, string> = {}) => toInput({ ...exampleValues(7), ...changes }, START);
const result = (changes: Record<string, string> = {}) => calculateMortgage(input(changes))!;
const count = (html: string, needle: string) => html.split(needle).length - 1;

describe("amortization schedule", () => {
  it("lists every year with what was paid, closed, each with a button to show its payments", () => {
    const html = renderToStaticMarkup(<Schedule result={result()} start={START} />);
    expect(html).toMatch(/<caption[^>]*>Amortization schedule<\/caption>/);
    expect(count(html, 'aria-expanded="false"')).toBe(30);
    expect(count(html, 'aria-expanded="true"')).toBe(0);
    expect(html).toContain("Jan 2027 to Dec 2027");
    for (const head of ["Principal", "Interest", "Total paid", "Balance"]) expect(html).toContain(`>${head}</th>`);
    expect(html).toContain("Show every payment");
    expect(html).not.toContain(">Extra</th>");
  });

  it("adds extra principal and mortgage insurance columns only when they apply", () => {
    const html = renderToStaticMarkup(<Schedule result={result({ extraAmount: "200", downPayment: "5", monthlyPmi: "120" })} start={START} />);
    expect(html).toContain(">Extra</th>");
    expect(html).toContain(">Mortgage ins.</th>");
  });

  it("numbers years without dates until the start date is known", () => {
    const html = renderToStaticMarkup(<Schedule result={result()} start={null} />);
    expect(html).toContain("Payments 1 to 12");
    expect(html).not.toContain("2027");
  });

  it("shows each payment of a year with its date, split and balance", () => {
    const r = result();
    const html = renderToStaticMarkup(
      <table><tbody><PaymentRows rows={r.schedule.slice(0, 12)} start={START} showExtra={false} showPmi={false} /></tbody></table>,
    );
    expect(count(html, "<tr")).toBe(12);
    expect(html).toContain("Jan 2027");
    expect(html).toContain("Dec 2027");
    expect(html).toContain("$262.30"); // first month's principal
    expect(html).toContain("$1,866.67"); // first month's interest
  });
});

describe("payment breakdown slider", () => {
  it("opens on the first payment with principal against interest", () => {
    const html = renderToStaticMarkup(<PaymentBreakdown result={result()} start={START} />);
    expect(html).toMatch(/<input[^>]*type="range"[^>]*min="1"[^>]*max="360"/);
    expect(html).toMatch(/<label[^>]*for="mortgage-breakdown-month"/);
    expect(html).toContain("Payment 1 of 360");
    expect(html).toContain("Jan 2027");
    expect(html).toContain("12.3% principal");
    expect(html).toContain("87.7% interest");
    expect(html).toContain("Remaining balance");
  });
});

describe("print summary", () => {
  it("is print-only and states the inputs and the results", () => {
    const html = renderToStaticMarkup(<PrintSummary input={input()} result={result()} start={START} />);
    expect(html).toMatch(/^<section[^>]*class="[^"]*hidden[^"]*print:block/);
    for (const text of ["Home price", "$400,000", "Down payment", "$80,000 (20%)", "Loan amount", "$320,000", "Interest rate", "7%", "30 years", "Monthly payment", "$2,679", "Total interest", "Paid off", "Dec 2056"]) {
      expect(html, text).toContain(text);
    }
  });
});
