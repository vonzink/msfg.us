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

/**
 * A rate typed as a percent, as a decimal: "7" is 0.07. A decimal comma is read as a point.
 * Anything that is not one number (empty, "." mid-typing, "9..0", letters) is NaN, meaning "not
 * entered". It is never read as 0: a calculator must not show a 0% answer for a typing slip.
 */
export function parseRate(v: string | undefined): number {
  const text = String(v ?? "").trim().replace(/%$/, "").trim().replace(",", ".");
  return /^-?(\d+\.?\d*|\.\d+)$/.test(text) ? Number(text) / 100 : Number.NaN;
}
