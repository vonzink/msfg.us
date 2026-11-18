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
