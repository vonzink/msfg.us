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
  /**
   * For a choice whose options say enough on their own. The label is still the group's name for a
   * screen reader, but is not shown.
   */
  hideLabel?: boolean;
  /**
   * For a money box in which 0 is an answer ("no debts", "zero down"). The box normally empties
   * itself when focus leaves it holding 0; with this set a typed 0 stays in the box as "0".
   */
  keepZero?: boolean;
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
 * An amount where 0 is an answer and empty is "not entered". "$", "%", commas and spaces are
 * dropped; what is left must be one number. Empty or anything else ("2..5", "abc") is NaN and is
 * never read as 0.
 */
export function typedAmount(text: string | undefined): number {
  const cleaned = String(text ?? "").replace(/[$%,\s]/g, "");
  return /^-?(\d+\.?\d*|\.\d+)$/.test(cleaned) ? Number(cleaned) : Number.NaN;
}

/**
 * What a money box holds once focus has left it: the amount with its digits grouped, or empty
 * when it is 0 or unreadable. With `keepZero` (see FieldDef) a typed 0 stays as "0".
 */
export function moneyOnBlur(text: string, keepZero = false): string {
  const n = parseNumber(text);
  if (n) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return keepZero && typedAmount(text) === 0 ? "0" : "";
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
 * A box holding 0 clears as well, unless `keepZero` is set: where zero down is an answer, a typed
 * 0 is zero in either unit and stays.
 */
export function switchDownUnit(values: Values, unit: string, keepZero = false): Values {
  if (unit === values.downUnit) return values;
  const price = parseNumber(values.homePrice);
  const typed = parseNumber(values.downPayment);
  let downPayment = "";
  if (price > 0 && typed > 0) {
    downPayment =
      unit === "usd"
        ? Math.round((price * typed) / 100).toLocaleString("en-US")
        : String(Math.round((typed / price) * 10000) / 100);
  } else if (keepZero && typedAmount(values.downPayment) === 0) {
    downPayment = "0";
  }
  return { ...values, downUnit: unit, downPayment };
}
