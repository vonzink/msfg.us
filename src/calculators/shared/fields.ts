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

/**
 * The down payment box changes between dollars and percent with the unit switch beside it.
 * A calculator that uses it has the fields `homePrice`, `downPayment` and `downUnit` ("pct" or "usd").
 */
export function downPaymentField(unit: string): FieldDef {
  return unit === "usd"
    ? { id: "downPayment", label: "Down payment", type: "money", example: "80,000" }
    : { id: "downPayment", label: "Down payment", type: "pct", example: "20" };
}

/**
 * Changes the down payment unit and converts what is in the box, so 20% of a $400,000 home
 * becomes $80,000 and back. Without a price there is nothing to convert against, so the box clears.
 */
export function switchDownUnit(values: Values, unit: string): Values {
  if (unit === values.downUnit) return values;
  const price = parseNumber(values.homePrice);
  const typed = parseNumber(values.downPayment);
  let downPayment = "";
  if (price > 0 && typed > 0) {
    downPayment =
      unit === "usd"
        ? Math.round((price * typed) / 100).toLocaleString("en-US")
        : String(Math.round((typed / price) * 10000) / 100);
  }
  return { ...values, downUnit: unit, downPayment };
}
