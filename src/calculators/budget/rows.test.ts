import { describe, expect, it } from "vitest";
import { addRow, blankRows, MAX_ROWS, removeRow, rowName, updateRow } from "./rows";

describe("debt rows", () => {
  it("start as two empty rows", () => {
    expect(blankRows()).toEqual([{ id: 1, name: "", payment: "" }, { id: 2, name: "", payment: "" }]);
  });

  it("adds rows up to eight, each with its own id", () => {
    expect(MAX_ROWS).toBe(8);
    let rows = blankRows();
    for (let i = 0; i < 12; i++) rows = addRow(rows);
    expect(rows).toHaveLength(8);
    expect(new Set(rows.map((r) => r.id)).size).toBe(8);
    expect(addRow(rows)).toBe(rows);
  });

  it("adds an empty row and leaves the others as they were", () => {
    const two = updateRow(blankRows(), 1, "payment", "350");
    const three = addRow(two);
    expect(three.slice(0, 2)).toEqual(two);
    expect(three[2]).toEqual({ id: 3, name: "", payment: "" });
  });

  it("removes the chosen row and leaves the others as they were", () => {
    const three = updateRow(addRow(blankRows()), 3, "payment", "70");
    const left = removeRow(three, 2);
    expect(left.map((r) => r.id)).toEqual([1, 3]);
    expect(left[1].payment).toBe("70");
  });

  it("gives a row added after a removal an id no other row has", () => {
    const again = addRow(removeRow(addRow(blankRows()), 2));
    expect(new Set(again.map((r) => r.id)).size).toBe(3);
  });

  it("never removes the last row", () => {
    const one = removeRow(blankRows(), 1);
    expect(one).toHaveLength(1);
    expect(removeRow(one, one[0].id)).toBe(one);
  });

  it("changes one field of one row", () => {
    const rows = updateRow(updateRow(blankRows(), 2, "name", "Car loan"), 2, "payment", "350");
    expect(rows).toEqual([{ id: 1, name: "", payment: "" }, { id: 2, name: "Car loan", payment: "350" }]);
  });

  it("names an unnamed row by its position", () => {
    const rows = updateRow(blankRows(), 1, "name", " Car loan ");
    expect(rows.map(rowName)).toEqual(["Car loan", "Debt 2"]);
    expect(rowName({ id: 9, name: "  ", payment: "" }, 0)).toBe("Debt 1");
  });
});
