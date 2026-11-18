/** Field definitions and parsing shared by every calculator. */

/** Raw form state: every field is the text the user typed. */
export type Values = Record<string, string>;

export type FieldDef = {
  id: string;
  label: string;
  type: "money" | "pct" | "num" | "text" | "choice";
  /** Value used when the page opens and by "Load example". */
  example: string;
  suffix?: string;
  hint?: string;
  /** Live hint computed from the current values. */
  hintFn?: (n: Numbers) => string;
  /** A problem with the value as entered, shown under the field; null when it looks fine. */
  warnFn?: (n: Numbers) => string | null;
  slider?: { min: number; max: number; step: number };
  options?: { value: string; label: string }[];
  wide?: boolean;
};

export type Numbers = Record<string, number>;

export function parseNumber(v: string | undefined): number {
  const x = Number(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(x) ? x : 0;
}
