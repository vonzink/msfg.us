// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BlendedRateCalculator } from "./BlendedRateCalculator";

afterEach(cleanup);
const open = () => render(<BlendedRateCalculator disclaimer="Estimate." breakevenHref={null} />);
const add = () => fireEvent.click(screen.getByRole("button", { name: "Add another debt" }));
const names = () => screen.getAllByLabelText("What is it?");

describe("keyboard focus when rows change", () => {
  it("moves to the new row's first field when a debt is added", () => {
    open();
    add();
    expect(names()).toHaveLength(3);
    expect(document.activeElement).toBe(names()[2]);
  });

  it("keeps focus on the page when the sixth row replaces the Add button", () => {
    open();
    for (let i = 0; i < 4; i++) add();
    expect(names()).toHaveLength(6);
    expect(screen.queryByRole("button", { name: "Add another debt" })).toBeNull();
    expect(document.activeElement).toBe(names()[5]);
  });

  it("moves to the Add button when a debt is removed", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Remove Home equity line" }));
    expect(names()).toHaveLength(1);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Add another debt" }));
  });
});

describe("monthly savings, typed in", () => {
  it("appears once every payment and a new rate are entered, and follows the new loan term", () => {
    open();
    const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
    type("First mortgage payment", "1123");
    type("A new rate to compare", "7");
    expect(screen.queryByText("Monthly savings")).toBeNull();
    expect(screen.getByText("Enter the current payment for every debt to see the monthly savings.")).toBeTruthy();

    type("Home equity line payment", "450");
    // On screen and again in the print summary.
    expect(screen.getAllByText("Monthly savings").length).toBeGreaterThan(0);
    expect(screen.getAllByText("-$489").length).toBeGreaterThan(0);
    expect(screen.getByText("The new payment would be higher.")).toBeTruthy();

    type("New loan amount", "350000");
    expect(screen.getAllByText("-$756").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$40,000").length).toBeGreaterThan(0);
    type("New loan amount", "");

    fireEvent.click(screen.getByLabelText("15 yr"));
    expect(screen.getAllByText("-$1,213").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Assumes one new 15-year loan for the full \$310,000 at 7%/).length).toBeGreaterThan(0);
  });
});
