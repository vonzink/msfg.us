import { describe, expect, it } from "vitest";
import { calculateBlended } from "./math";
import { addRow, blankRows, EXAMPLE_ROWS, MAX_ROWS, parseCompareRate, removeRow, toDebts, updateRow } from "./rows";

const blended = (rows = EXAMPLE_ROWS) => calculateBlended(toDebts(rows), Number.NaN);

describe("debt rows", () => {
  it("opens on a first mortgage and a home equity line that blend to 4.565%", () => {
    expect(EXAMPLE_ROWS.map((r) => r.name)).toEqual(["First mortgage", "Home equity line"]);
    expect((blended()!.blendedRate * 100).toFixed(3)).toBe("4.565");
  });

  it("clears to two empty rows", () => {
    const rows = blankRows();
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.name === "" && r.balance === "" && r.rate === "" && r.payment === "")).toBe(true);
    expect(blended(rows)).toBeNull();
  });

  it("adds rows up to six, each with its own id", () => {
    let rows = EXAMPLE_ROWS;
    for (let i = 0; i < 10; i++) rows = addRow(rows);
    expect(rows).toHaveLength(MAX_ROWS);
    expect(new Set(rows.map((r) => r.id)).size).toBe(MAX_ROWS);
    expect(rows.slice(0, 2)).toEqual(EXAMPLE_ROWS);
  });

  it("removes the chosen row and leaves the others as they were", () => {
    const three = updateRow(addRow(EXAMPLE_ROWS), addRow(EXAMPLE_ROWS)[2].id, "balance", "9,000");
    const left = removeRow(three, three[1].id);
    expect(left.map((r) => r.id)).toEqual([three[0].id, three[2].id]);
    expect(left[0]).toEqual(three[0]);
    expect(left[1].balance).toBe("9,000");
  });

  it("gives a row added after a removal an id no other row has", () => {
    const three = addRow(EXAMPLE_ROWS);
    const again = addRow(removeRow(three, three[1].id));
    expect(new Set(again.map((r) => r.id)).size).toBe(3);
  });

  it("never removes the last row", () => {
    const one = removeRow(EXAMPLE_ROWS, EXAMPLE_ROWS[0].id);
    expect(removeRow(one, one[0].id)).toHaveLength(1);
  });

  it("changes one field of one row", () => {
    const rows = updateRow(EXAMPLE_ROWS, EXAMPLE_ROWS[1].id, "rate", "10");
    expect(rows[1].rate).toBe("10");
    expect(rows[0]).toEqual(EXAMPLE_ROWS[0]);
  });
});

describe("turning rows into debts", () => {
  it("reads the numbers typed, with commas", () => {
    expect(toDebts(EXAMPLE_ROWS)[0]).toEqual({ name: "First mortgage", balance: 250000, rate: 0.035, payment: 0 });
  });

  it("names an unnamed row by its position", () => {
    expect(toDebts(updateRow(EXAMPLE_ROWS, EXAMPLE_ROWS[1].id, "name", "  ")).map((d) => d.name)).toEqual(["First mortgage", "Debt 2"]);
  });

  it("treats a rate with no digit as not entered", () => {
    const debts = toDebts(updateRow(EXAMPLE_ROWS, EXAMPLE_ROWS[1].id, "rate", "."));
    expect(Number.isNaN(debts[1].rate)).toBe(true);
    expect(calculateBlended(debts, Number.NaN)!.debts[1].missingRate).toBe(true);
  });

  it("gives no result when every balance is junk or empty", () => {
    const rows = EXAMPLE_ROWS.map((r, i) => ({ ...r, balance: i ? "" : "abc" }));
    expect(blended(rows)).toBeNull();
  });
});

describe("the comparison rate", () => {
  it("is a decimal, or NaN when nothing usable was typed", () => {
    expect(parseCompareRate("7")).toBeCloseTo(0.07, 12);
    expect(parseCompareRate("6.875%")).toBeCloseTo(0.06875, 12);
    expect(Number.isNaN(parseCompareRate(""))).toBe(true);
    expect(Number.isNaN(parseCompareRate("."))).toBe(true);
    expect(Number.isNaN(parseCompareRate("abc"))).toBe(true);
  });
});
