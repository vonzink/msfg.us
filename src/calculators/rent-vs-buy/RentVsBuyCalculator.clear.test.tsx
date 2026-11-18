// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RentVsBuyCalculator } from "./RentVsBuyCalculator";

afterEach(cleanup);

const COSTS_PROMPT = "Add closing costs, property tax, homeowners insurance and maintenance under Add detail to see the comparison. Enter 0 for any that do not apply.";
const GENERAL_PROMPT = "Enter the rent, the home price, the down payment, the interest rate and how long you plan to stay to see the comparison.";
const open = () => render(<RentVsBuyCalculator exampleRatePct={7} exampleRateNote="Example rate." disclaimer="Estimate." />);
const box = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
/** Types into a box and leaves it, as a visitor does. */
const type = (label: string, text: string) => {
  const input = box(label);
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: text } });
  fireEvent.blur(input);
};
const status = () => screen.queryByRole("status")?.textContent ?? null;
const results = () => document.getElementById("rentbuy-results")!.textContent!;
const typeFive = () => {
  type("Monthly rent", "2400");
  type("Home price", "400000");
  type("Down payment", "20");
  type("Interest rate", "7");
  type("Years you plan to stay", "7");
};

describe("F1: Clear, then the example's five numbers", () => {
  it("asks for the four costs and shows no comparison", () => {
    open();
    expect(results()).toContain("Buying comes out ahead by $10,816");
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(status()).toBe(GENERAL_PROMPT);
    typeFive();
    expect(status()).toBe(COSTS_PROMPT);
    expect(results()).not.toContain("comes out ahead");
    expect(document.body.textContent).not.toContain("$100,038");
  });

  it("shows the example's result again once the four costs are typed", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    typeFive();
    type("Closing costs", "8000");
    type("Property tax", "4800");
    type("Homeowners insurance", "1800");
    expect(status()).toBe(COSTS_PROMPT);
    type("Maintenance", "4000");
    expect(status()).toBeNull();
    expect(results()).toContain("Buying comes out ahead by $10,816");
    expect(results()).toContain("Buying pulls ahead in year 6.");
    expect(results()).toContain("Closing costs on the purchase: $8,000");
  });

  it("takes a typed 0 as entered, and keeps it in the box after leaving the field", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    typeFive();
    for (const label of ["Closing costs", "Property tax", "Homeowners insurance", "Maintenance"]) {
      type(label, "0");
      expect(box(label).value, label).toBe("0");
    }
    expect(status()).toBeNull();
    expect(results()).toContain("Buying comes out ahead by $100,038");
    expect(results()).toContain("Property tax: $0 a year");
    expect(results()).toContain("Closing costs on the purchase: $0");
    // Deleting the 0 by hand empties the box again.
    fireEvent.change(box("Maintenance"), { target: { value: "" } });
    expect(box("Maintenance").value).toBe("");
    expect(status()).toBe(COSTS_PROMPT);
  });
});

describe("F2: the down payment box", () => {
  it("empty is not entered; a typed 0 is zero down, in dollars too", () => {
    open();
    fireEvent.change(box("Down payment"), { target: { value: "" } });
    expect(status()).toBe(GENERAL_PROMPT);
    type("Down payment", "0");
    expect(status()).toBeNull();
    fireEvent.click(screen.getByLabelText("Dollars"));
    type("Down payment", "0");
    expect(box("Down payment").value).toBe("0");
    expect(status()).toBeNull();
    expect(results()).toContain("comes out ahead by");
  });
});
