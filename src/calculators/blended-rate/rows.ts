import { parseNumber } from "../shared/fields";
import type { Debt } from "./math";

/**
 * The debt rows of the Blended rate calculator: what is typed, and how rows are added and removed.
 * Pure functions, so the row handling is tested without rendering anything.
 */

/** What is typed into one debt row. `id` is stable for the life of the row, so removing a row never shifts another row's values. */
export type Row = { id: number; name: string; balance: string; rate: string; payment: string };

export const MAX_ROWS = 6;

/** The worked example the page opens with: a low-rate first mortgage and a higher-rate credit line. */
export const EXAMPLE_ROWS: Row[] = [
  { id: 1, name: "First mortgage", balance: "250,000", rate: "3.5", payment: "" },
  { id: 2, name: "Home equity line", balance: "60,000", rate: "9", payment: "" },
];

const blank = (id: number): Row => ({ id, name: "", balance: "", rate: "", payment: "" });

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

/** A percent typed as text, as a decimal. Text with no digit in it is "not entered". */
const rate = (text: string): number => (/\d/.test(text) ? parseNumber(text) / 100 : Number.NaN);

export function toDebts(rows: Row[]): Debt[] {
  return rows.map((row, i) => ({
    name: rowName(row, i),
    balance: parseNumber(row.balance),
    rate: rate(row.rate),
    payment: parseNumber(row.payment),
  }));
}

export function parseCompareRate(text: string): number {
  return rate(text);
}
