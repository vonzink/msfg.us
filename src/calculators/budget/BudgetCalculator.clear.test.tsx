// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BudgetCalculator } from "./BudgetCalculator";

afterEach(cleanup);

const open = () => render(<BudgetCalculator disclaimer="Estimate." mortgageHref="/calculators/mortgage" />);
const box = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
/** Types into a box and leaves it, as a visitor does. */
const type = (label: string, text: string) => {
  const input = box(label);
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: text } });
  fireEvent.blur(input);
};
const status = () => screen.queryByRole("status")?.textContent ?? null;
const results = () => document.getElementById("budget-results")!.textContent!;
const mode = (legend: string, option: "One total" | "Itemize") =>
  fireEvent.click(within(screen.getByRole("group", { name: legend })).getByLabelText(option));
const EXAMPLE = "$1,220 left each month";
const INCOME = "Gross monthly household income";
const TAX = "Estimated tax rate";
const HOUSING = "Monthly housing payment";
const DEBTS = "Monthly debt payments";
const LIVING = "Monthly living costs";
const SAVINGS = "Share of income set aside as savings";

describe("Clear, then the example's five numbers", () => {
  it("shows no figure until all five are in, then the example's result", () => {
    open();
    expect(results()).toContain(EXAMPLE);
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(status()).toContain("Enter the gross monthly household income, the estimated tax rate");
    expect(results()).not.toContain("$");
    type(INCOME, "9000");
    type(TAX, "22");
    type(HOUSING, "2700");
    type(DEBTS, "600");
    expect(status()).toBe("Enter the monthly living costs to see what is left each month. Enter 0 for any cost that does not apply.");
    expect(results()).not.toContain("$");
    expect(results()).not.toContain("%");
    expect(document.body.textContent).not.toContain("Home budget estimate");
    type(LIVING, "2500");
    expect(status()).toBeNull();
    expect(results()).toContain(EXAMPLE);
    expect(results()).toContain("30.0%");
    expect(results()).toContain("36.7%");
    expect(results()).toContain("$5,700");
    expect(box(INCOME).value).toBe("9,000");
  });

  it("Load example brings the example back, with every group as one total", () => {
    open();
    mode("Enter housing as", "Itemize");
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    fireEvent.click(screen.getByRole("button", { name: "Load example" }));
    expect(results()).toContain(EXAMPLE);
    expect(box(HOUSING).disabled).toBe(false);
    expect(box(HOUSING).value).toBe("2,700");
  });

  it("takes a typed 0 as entered and keeps it in the box after leaving the field", () => {
    open();
    for (const label of [HOUSING, DEBTS, LIVING]) {
      type(label, "0");
      expect(box(label).value, label).toBe("0");
    }
    type(TAX, "0");
    expect(box(TAX).value).toBe("0");
    expect(status()).toBeNull();
    expect(results()).toContain("$9,000 left each month");
    expect(results()).toContain("0.0%");
    // Deleting the 0 by hand empties the box again, and the figure goes.
    type(DEBTS, "");
    expect(box(DEBTS).value).toBe("");
    expect(status()).toBe("Enter the monthly debt payments to see what is left each month. Enter 0 for any cost that does not apply.");
    // The income is the one box where 0 is not an answer.
    type(DEBTS, "0");
    type(INCOME, "0");
    expect(box(INCOME).value).toBe("");
    expect(status()).toBe("Enter the gross monthly household income to see what is left each month.");
    expect(results()).not.toContain("$");
  });
});

describe("one total or the lines, never both", () => {
  it("itemizing housing uses the lines, shows their sum in the front box, and keeps the typed total for the way back", () => {
    open();
    expect(screen.queryByLabelText("Property tax")).toBeNull();
    mode("Enter housing as", "Itemize");
    expect(box(HOUSING).disabled).toBe(true);
    expect(box(HOUSING).value).toBe("");
    expect(document.body.textContent).toContain("Total of the lines under Add detail");
    expect(status()).toBe("Enter at least one housing line, or switch back to one total.");
    expect(results()).not.toContain("$");

    type("Principal and interest", "1900");
    type("Property tax", "400");
    expect(box(HOUSING).value).toBe("2,300");
    expect(status()).toBeNull();
    // 9,000 less 22% tax is 7,020; less 2,300, 600 and 2,500 leaves 1,620.
    expect(results()).toContain("$1,620 left each month");
    expect(results()).toContain("25.6%");
    type("Homeowners insurance", "150");
    type("Mortgage insurance", "120");
    type("HOA dues", "130");
    expect(box(HOUSING).value).toBe("2,700");
    expect(results()).toContain(EXAMPLE);
    type("HOA dues", "0");
    expect(box("HOA dues").value).toBe("0");
    expect(box(HOUSING).value).toBe("2,570");

    mode("Enter housing as", "One total");
    expect(box(HOUSING).disabled).toBe(false);
    expect(box(HOUSING).value).toBe("2,700");
    expect(results()).toContain(EXAMPLE);
    expect(screen.queryByLabelText("Property tax")).toBeNull();
    // The lines were kept.
    mode("Enter housing as", "Itemize");
    expect(box("Property tax").value).toBe("400");
    expect(box(HOUSING).value).toBe("2,570");
  });

  it("itemizing living costs works the same way", () => {
    open();
    mode("Enter living costs as", "Itemize");
    expect(status()).toBe("Enter at least one living cost, or switch back to one total.");
    type("Groceries", "900");
    type("Insurance", "350");
    expect(box(LIVING).disabled).toBe(true);
    expect(box(LIVING).value).toBe("1,250");
    expect(results()).toContain("$2,470 left each month");
    mode("Enter living costs as", "One total");
    expect(box(LIVING).value).toBe("2,500");
    expect(results()).toContain(EXAMPLE);
  });

  it("itemizing debts uses the rows: add, type, a 0 that stays, remove, and no more than eight", () => {
    open();
    expect(screen.queryByRole("button", { name: "Add another debt" })).toBeNull();
    mode("Enter debts as", "Itemize");
    expect(status()).toBe("Enter at least one debt, or switch back to one total.");
    expect(screen.getAllByLabelText("What is it?")).toHaveLength(2);

    fireEvent.change(screen.getAllByLabelText("What is it?")[0], { target: { value: "Car loan" } });
    type("Car loan monthly payment", "350");
    type("Debt 2 monthly payment", "0");
    expect(box("Debt 2 monthly payment").value).toBe("0");
    expect(box(DEBTS).disabled).toBe(true);
    expect(box(DEBTS).value).toBe("350");
    expect(results()).toContain("$1,470 left each month");

    fireEvent.click(screen.getByRole("button", { name: "Add another debt" }));
    expect(screen.getAllByLabelText("What is it?")).toHaveLength(3);
    expect(document.activeElement).toBe(screen.getAllByLabelText("What is it?")[2]);
    type("Debt 3 monthly payment", "250");
    expect(box(DEBTS).value).toBe("600");
    expect(results()).toContain(EXAMPLE);

    fireEvent.click(screen.getByRole("button", { name: "Remove Debt 3" }));
    expect(screen.getAllByLabelText("What is it?")).toHaveLength(2);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Add another debt" }));
    expect(box(DEBTS).value).toBe("350");

    for (let i = 0; i < 6; i++) fireEvent.click(screen.getByRole("button", { name: "Add another debt" }));
    expect(screen.getAllByLabelText("What is it?")).toHaveLength(8);
    expect(screen.queryByRole("button", { name: "Add another debt" })).toBeNull();

    mode("Enter debts as", "One total");
    expect(box(DEBTS).value).toBe("600");
    expect(results()).toContain(EXAMPLE);
    // Clear empties the rows too.
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    mode("Enter debts as", "Itemize");
    expect(screen.getAllByLabelText("What is it?")).toHaveLength(2);
    expect(box("Debt 1 monthly payment").value).toBe("");
  });

  it("prints the lines of an itemized group", () => {
    open();
    expect(document.body.textContent).not.toContain("Housing, line by line: Property tax");
    mode("Enter housing as", "Itemize");
    type("Property tax", "400");
    const printed = screen.getByLabelText("Itemized lines").textContent!;
    expect(printed).toContain("Housing, line by line");
    expect(printed).toContain("Property tax");
    expect(printed).toContain("$400");
    expect(printed).not.toContain("HOA dues");
  });
});

describe("savings", () => {
  it("takes a share of income off before the bills, and shows what the balances cover", () => {
    open();
    type(SAVINGS, "10");
    expect(results()).toContain("$320 left each month");
    expect(results()).not.toContain("Savings cover");
    type("Savings accounts", "25000");
    expect(results()).toContain("9 months of housing");
    type(SAVINGS, "");
    expect(results()).toContain(EXAMPLE);
  });

  it("an unreadable savings rate shows no result and says so, instead of counting as 0%", () => {
    open();
    type(SAVINGS, "abc");
    expect(status()).toBe("Enter a number for the share of income set aside as savings, or leave it empty.");
    expect(results()).not.toContain("left each month");
    expect(results()).not.toContain("$");
    expect(box(SAVINGS).getAttribute("aria-describedby")).toContain("budget-savingsRate-warn");
    type(SAVINGS, "0");
    expect(status()).toBeNull();
    expect(results()).toContain(EXAMPLE);
  });
});
