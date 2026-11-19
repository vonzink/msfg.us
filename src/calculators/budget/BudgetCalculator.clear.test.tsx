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
  it("C1: shows no figure until the income and the housing payment are in; the rest count as 0 until typed", () => {
    open();
    expect(results()).toContain(EXAMPLE);
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(status()).toBe("Enter the gross monthly household income and the monthly housing payment to see what is left each month.");
    expect(results()).not.toContain("$");
    type(INCOME, "9000");
    expect(status()).toBe("Enter the monthly housing payment to see what is left each month.");
    expect(results()).not.toContain("$");
    expect(results()).not.toContain("%");
    expect(document.body.textContent).not.toContain("Home budget estimate");
    type(HOUSING, "2700");
    expect(status()).toBeNull();
    expect(results()).toContain("$6,300 left each month");
    expect(results()).toContain("after housing");
    expect(results()).not.toContain("after housing,");
    expect(results()).toContain("30.00%");
    for (const label of [TAX, DEBTS, LIVING]) expect(box(label).value, label).toBe("");
    type(TAX, "22");
    expect(results()).toContain("$4,320 left each month");
    type(DEBTS, "600");
    type(LIVING, "2500");
    expect(status()).toBeNull();
    expect(results()).toContain(EXAMPLE);
    expect(results()).toContain("30.00%");
    expect(results()).toContain("36.67%");
    expect(results()).toContain("$5,700");
    expect(box(INCOME).value).toBe("9,000");
  });

  it("Load example brings the example back, with every group as one total", () => {
    open();
    mode("Enter housing as", "Itemize");
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    fireEvent.click(screen.getByRole("button", { name: "Load example" }));
    expect(results()).toContain(EXAMPLE);
    expect(box(HOUSING).readOnly).toBe(false);
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
    expect(results()).toContain("0.00%");
    // C1: deleting the 0 by hand empties the box again, and an empty box still counts as 0.
    type(DEBTS, "");
    expect(box(DEBTS).value).toBe("");
    expect(status()).toBeNull();
    expect(results()).toContain("$9,000 left each month");
    // Something that is not a number is named, never counted as 0.
    fireEvent.change(box(TAX), { target: { value: "2..2" } });
    expect(status()).toBe("Enter a number for the estimated tax rate, or leave it empty.");
    type(TAX, "");
    expect(status()).toBeNull();
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
    // B4: read-only and still reachable, with no placeholder that looks like a typed 0.
    expect(box(HOUSING).disabled).toBe(false);
    expect(box(HOUSING).readOnly).toBe(true);
    expect(box(HOUSING).getAttribute("aria-readonly")).toBe("true");
    expect(box(HOUSING).tabIndex).toBe(0);
    expect(box(HOUSING).placeholder).toBe("");
    expect(box(HOUSING).value).toBe("");
    expect(document.getElementById("budget-housing-hint")!.textContent).toBe("Total of the lines under Add detail");
    expect(box(HOUSING).getAttribute("aria-describedby")).toBe("budget-housing-hint");
    expect(status()).toBe("Enter at least one housing line, or switch back to one total.");
    expect(results()).not.toContain("$");

    type("Principal and interest", "1900");
    type("Property tax", "400");
    expect(box(HOUSING).value).toBe("2,300");
    expect(status()).toBeNull();
    // 9,000 less 22% tax is 7,020; less 2,300, 600 and 2,500 leaves 1,620.
    expect(results()).toContain("$1,620 left each month");
    expect(results()).toContain("25.56%");
    type("Homeowners insurance", "150");
    type("Mortgage insurance", "120");
    type("HOA dues", "130");
    expect(box(HOUSING).value).toBe("2,700");
    expect(results()).toContain(EXAMPLE);
    type("HOA dues", "0");
    expect(box("HOA dues").value).toBe("0");
    expect(box(HOUSING).value).toBe("2,570");

    // Leaving the read-only box does not write the sum over the typed total.
    fireEvent.focus(box(HOUSING));
    fireEvent.change(box(HOUSING), { target: { value: "99" } });
    fireEvent.blur(box(HOUSING));
    expect(box(HOUSING).value).toBe("2,570");

    mode("Enter housing as", "One total");
    expect(box(HOUSING).readOnly).toBe(false);
    expect(box(HOUSING).getAttribute("aria-readonly")).toBeNull();
    expect(box(HOUSING).placeholder).toBe("0");
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
    // C1: no lines yet is $0 of living costs.
    expect(status()).toBeNull();
    expect(box(LIVING).value).toBe("0");
    expect(results()).toContain("$3,720 left each month");
    type("Groceries", "900");
    type("Insurance", "350");
    expect(box(LIVING).readOnly).toBe(true);
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
    // C1: no debts yet is $0 of debts.
    expect(status()).toBeNull();
    expect(box(DEBTS).value).toBe("0");
    expect(results()).toContain("$1,820 left each month");
    expect(screen.getAllByLabelText("What is it?")).toHaveLength(2);

    fireEvent.change(screen.getAllByLabelText("What is it?")[0], { target: { value: "Car loan" } });
    type("Car loan monthly payment", "350");
    type("Debt 2 monthly payment", "0");
    expect(box("Debt 2 monthly payment").value).toBe("0");
    expect(box(DEBTS).readOnly).toBe(true);
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

describe("B5: negative amounts and lines that are not numbers", () => {
  it("a negative housing line gives no result and is named", () => {
    open();
    mode("Enter housing as", "Itemize");
    type("Principal and interest", "1900");
    type("Property tax", "-50");
    expect(box("Property tax").value).toBe("-50");
    expect(status()).toBe("Property tax must be $0 or more.");
    expect(results()).not.toContain("each month");
    type("Property tax", "50");
    expect(status()).toBeNull();
    expect(results()).toContain("$1,970 left each month");
  });

  it("a negative debt payment gives no result and is named", () => {
    open();
    mode("Enter debts as", "Itemize");
    type("Debt 1 monthly payment", "350");
    type("Debt 2 monthly payment", "-20");
    expect(status()).toBe("Debt 2 monthly payment must be $0 or more.");
    expect(results()).not.toContain("each month");
  });

  it("a negative balance gives no result, no reserves card, and is named", () => {
    open();
    type("Savings accounts", "25000");
    expect(results()).toContain("9 months of housing");
    type("Checking accounts", "-100");
    expect(status()).toBe("Checking accounts must be $0 or more.");
    expect(results()).not.toContain("Savings cover");
    expect(results()).not.toContain("each month");
  });

  it("a line that is not a number, mid-typing, is said to be that and not a missing line", () => {
    open();
    mode("Enter housing as", "Itemize");
    type("Principal and interest", "1900");
    fireEvent.change(box("Property tax"), { target: { value: "4..0" } });
    expect(status()).toBe("One of the housing lines is not a number.");
    mode("Enter living costs as", "Itemize");
    fireEvent.change(box("Property tax"), { target: { value: "400" } });
    fireEvent.change(box("Groceries"), { target: { value: "." } });
    expect(status()).toBe("One of the living costs is not a number.");
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
