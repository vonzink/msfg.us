/**
 * The debt rows of the Home budget calculator, shown when debts are itemized: what is typed, and
 * how rows are added and removed. Pure functions, so the row handling is tested without rendering
 * anything. A debt here is a name and a monthly payment; the dashboard's balance, months left,
 * omit and payoff flags are left out.
 */

/** What is typed into one debt row. `id` is stable for the life of the row, so removing a row never shifts another row's values. */
export type Row = { id: number; name: string; payment: string };

export const MAX_ROWS = 8;

const blank = (id: number): Row => ({ id, name: "", payment: "" });

/** The rows the page opens with and clears to: two, both empty. */
export function blankRows(): Row[] {
  return [blank(1), blank(2)];
}

/** No change once there are MAX_ROWS rows. */
export function addRow(rows: Row[]): Row[] {
  if (rows.length >= MAX_ROWS) return rows;
  return [...rows, blank(Math.max(0, ...rows.map((r) => r.id)) + 1)];
}

/** Never drops below one row. */
export function removeRow(rows: Row[], id: number): Row[] {
  return rows.length <= 1 ? rows : rows.filter((r) => r.id !== id);
}

export function updateRow(rows: Row[], id: number, field: keyof Omit<Row, "id">, value: string): Row[] {
  return rows.map((r) => (r.id === id ? { ...r, [field]: value } : r));
}

/** The name shown for a row: what was typed, or "Debt N" by its position. */
export function rowName(row: Row, index: number): string {
  return row.name.trim() || `Debt ${index + 1}`;
}
