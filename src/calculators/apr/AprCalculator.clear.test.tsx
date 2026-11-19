// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AprCalculator } from "./AprCalculator";

afterEach(cleanup);

const GENERAL_PROMPT = "Enter the loan amount and the interest rate to see the estimated APR.";
const open = () => render(<AprCalculator exampleRatePct={7} exampleRateNote="Example rate." disclaimer="Estimate." />);
const box = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
/** Types into a box and leaves it, as a visitor does. */
const type = (label: string, text: string) => {
  const input = box(label);
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: text } });
  fireEvent.blur(input);
};
const status = () => screen.queryByRole("status")?.textContent ?? null;
const results = () => document.getElementById("apr-results")!.textContent!;

describe("Clear, then the two boxes that have to be entered", () => {
  it("opens on the example", () => {
    open();
    expect(status()).toBeNull();
    expect(results()).toContain("Estimated APR7.154%");
    expect(results()).not.toContain("No lender fees are entered.");
    expect(screen.getByRole("link", { name: /See results/ }).textContent).toContain("Estimated APR7.154%");
    expect(box("Loan amount").value).toBe("320,000");
    expect(box("Interest rate").value).toBe("7");
    expect(box("Lender fees").value).toBe("4,000");
    for (const label of ["Discount points", "Lender credit", "Mortgage insurance", "Home value", "Prepaid interest"]) expect(box(label).value, label).toBe("");
  });

  it("asks for both, then gives a result on the loan amount and the rate alone", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(status()).toBe(GENERAL_PROMPT);
    expect(results()).not.toContain("Estimated APR");
    expect((screen.getByRole("radio", { name: "30 yr" }) as HTMLInputElement).checked).toBe(true);
    type("Loan amount", "320000");
    expect(status()).toBe(GENERAL_PROMPT);
    type("Interest rate", "7");
    expect(status()).toBeNull();
    // Empty lender fees count as $0; the 15 days of prepaid interest, $920.55, are all that is counted.
    expect(results()).toContain("Lender fees$0.00");
    expect(results()).toContain("Prepaid interest (15 days)$920.55");
    expect(results()).toContain("Fees counted$920.55");
    expect(results()).toContain("Interest rate 7.000%");
    // A3: the box was left empty, and the page says so beside the figure and on the phone bar.
    expect(results()).toContain("The APR is 0.029 percentage points above the interest rate, because it counts $921 in fees. No lender fees are entered.");
    expect(screen.getByRole("link", { name: /See results/ }).textContent).toContain("Estimated APR, no lender fees entered7.029%");
    type("Lender fees", "0");
    expect(results()).not.toContain("No lender fees are entered.");
    expect(screen.getByRole("link", { name: /See results/ }).textContent).toContain("Estimated APR7.029%");
    expect(document.body.textContent).not.toMatch(/NaN|Infinity|undefined|-\$0/);
  });

  it("Load example brings the example back", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    fireEvent.click(screen.getByRole("button", { name: "Load example" }));
    expect(results()).toContain("Estimated APR7.154%");
  });
});

describe("a typed 0", () => {
  it("in prepaid interest survives leaving the box and counts as none", () => {
    open();
    type("Prepaid interest", "0");
    expect(box("Prepaid interest").value).toBe("0");
    expect(status()).toBeNull();
    expect(results()).toContain("Prepaid interest$0.00");
    expect(results()).not.toContain("(15 days)");
    expect(results()).toContain("Fees counted$4,000.00");
    // Deleting the 0 brings the automatic 15 days back.
    fireEvent.change(box("Prepaid interest"), { target: { value: "" } });
    expect(results()).toContain("Prepaid interest (15 days)$920.55");
    expect(results()).toContain("Fees counted$4,920.55");
  });

  it("in lender fees stays in the box, and with no prepaid interest the APR is the interest rate", () => {
    open();
    type("Lender fees", "0");
    type("Prepaid interest", "0");
    expect(box("Lender fees").value).toBe("0");
    expect(results()).toContain("Estimated APR7.000%");
    expect(results()).toContain("With no fees counted, the APR is the same as the interest rate.");
  });

  it("in the interest rate is a 0% loan, not a missing rate", () => {
    open();
    type("Interest rate", "0");
    expect(status()).toBeNull();
    expect(results()).toContain("Interest rate 0.000%");
    expect(results()).toContain("Prepaid interest (15 days)$0.00");
  });
});

describe("what is typed under Add detail", () => {
  it("mortgage insurance asks for the home value, then counts", () => {
    open();
    type("Mortgage insurance", "160");
    expect(status()).toBe("Enter the home value to count mortgage insurance. It decides when the insurance ends.");
    type("Home value", "340000");
    expect(status()).toBeNull();
    expect(results()).toMatch(/Mortgage insurance\$160 a month for \d+ months/);
    type("Home value", "500000");
    expect(results()).toContain("Mortgage insurance is not counted: the loan is already at or under 78% of the home value.");
  });

  it("junk in a box is named and gives no result", () => {
    open();
    // Letters in a money box are named while they are there, and emptied on leaving it.
    fireEvent.change(box("Lender credit"), { target: { value: "abc" } });
    expect(status()).toBe("Enter a number for lender credit, or leave it empty.");
    fireEvent.blur(box("Lender credit"));
    expect(box("Lender credit").value).toBe("");
    expect(status()).toBeNull();
    fireEvent.change(box("Discount points"), { target: { value: "1.." } });
    expect(status()).toBe("Enter a number for discount points, or leave it empty.");
    expect(results()).not.toContain("Estimated APR");
  });
});
