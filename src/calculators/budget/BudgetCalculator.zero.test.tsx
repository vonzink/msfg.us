// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BudgetCalculator } from "./BudgetCalculator";

afterEach(cleanup);

const open = () => render(<BudgetCalculator disclaimer="Estimate." mortgageHref="/calculators/mortgage" />);
const box = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const status = () => screen.queryByRole("status")?.textContent ?? null;
const results = () => document.getElementById("budget-results")!.textContent!;
/**
 * Types as a visitor does, one key at a time: focus, select what is there and delete it, a change
 * event for every character, then leave the box. Each event reads the box as React last rendered it.
 */
const keyIn = (label: string, text: string) => {
  fireEvent.focus(box(label));
  for (let n = box(label).value.length - 1; n >= 0; n--) fireEvent.change(box(label), { target: { value: box(label).value.slice(0, n) } });
  for (const key of text) {
    fireEvent.keyDown(box(label), { key });
    fireEvent.change(box(label), { target: { value: box(label).value + key } });
    fireEvent.keyUp(box(label), { key });
  }
  fireEvent.blur(box(label));
};
const INCOME = "Gross monthly household income";
const TAX = "Estimated tax rate";
const HOUSING = "Monthly housing payment";
const DEBTS = "Monthly debt payments";
const LIVING = "Monthly living costs";

describe("C1: a typed 0 in the monthly boxes, key by key", () => {
  it.each([[[DEBTS, LIVING]], [[LIVING, DEBTS]]])("from the example, in the order %j", (order) => {
    open();
    for (const label of order) keyIn(label, "0");
    expect(box(DEBTS).value).toBe("0");
    expect(box(LIVING).value).toBe("0");
    expect(status()).toBeNull();
    // 9,000 less 22% tax is 7,020; less 2,700 of housing leaves 4,320.
    expect(results()).toContain("$4,320 left each month");
  });

  it.each([[[DEBTS, LIVING]], [[LIVING, DEBTS]]])("from Clear, in the order %j", (order) => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    keyIn(INCOME, "9000");
    keyIn(TAX, "22");
    keyIn(HOUSING, "2700");
    for (const label of order) keyIn(label, "0");
    expect(box(DEBTS).value).toBe("0");
    expect(box(LIVING).value).toBe("0");
    expect(status()).toBeNull();
    expect(results()).toContain("$4,320 left each month");
  });
});
