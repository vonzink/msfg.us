import type { Step } from "@/content/flows";
import type { AnswerValue, CurrencyAmount } from "@/lib/leads";

/** True when an answer is the {value,unit} currency shape (toggle steps). */
export function isCurrencyAmount(v: AnswerValue | undefined): v is CurrencyAmount {
  return !!v && typeof v === "object" && "unit" in v && "value" in v;
}

/** Format a CurrencyAmount as a labeled string for the LO/LOS, e.g. "20%" / "$85,000". */
function formatCurrencyAmount(a: CurrencyAmount): string {
  return a.unit === "%" ? `${a.value}%` : `$${(a.value ?? 0).toLocaleString("en-US")}`;
}

/** Parse a user-typed currency string to a whole number, or null. */
export function parseCurrency(input: string): number | null {
  const digits = input.replace(/[^0-9]/g, "");
  if (!digits) return null;
  return Number(digits);
}

/** Parse a user-typed percentage to a 0–100 whole number, or null. */
export function parsePercent(input: string): number | null {
  const digits = input.replace(/[^0-9]/g, "");
  if (!digits) return null;
  return Math.min(100, Number(digits));
}

/** Format a number with thousands separators for display; null → "". */
export function formatCurrency(n: number | null): string {
  return n == null ? "" : n.toLocaleString("en-US");
}

/**
 * Reformat a `$`/`%` input after an edit, preserving the caret by *digit count*
 * rather than character index. CurrencyStep applies this on every keystroke so
 * live thousands-grouping never shifts the cursor — which is what made fast
 * typing swallow digits (QA #2). Pure; the caller restores `caret`.
 */
export function reformatAmount(
  raw: string,
  caret: number,
  unit: "$" | "%",
): { text: string; value: number | null; caret: number } {
  const digitsLeft = raw.slice(0, caret).replace(/[^0-9]/g, "").length;
  const value = unit === "%" ? parsePercent(raw) : parseCurrency(raw);
  const text = value == null ? "" : unit === "%" ? String(value) : value.toLocaleString("en-US");

  let pos = 0;
  if (digitsLeft > 0) {
    let seen = 0;
    pos = text.length;
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      if (c >= 48 && c <= 57) {
        seen += 1;
        if (seen === digitsLeft) { pos = i + 1; break; }
      }
    }
  }
  return { text, value, caret: pos };
}

/** Progressive US phone display formatting: digits → "303-555-1234" (caps at 10). */
export function formatPhone(input: string): string {
  const d = input.replace(/\D/g, "").slice(0, 10);
  if (d.length > 6) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length > 3) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return d;
}

/** True for values that should not be written to the lead (blank/absent). */
function isEmpty(v: AnswerValue | undefined): boolean {
  if (isCurrencyAmount(v)) return v.value == null;
  return v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
}

/**
 * Normalize index-keyed wizard answers into named lead fields, using each
 * step's `field` key. Steps without a `field` (e.g. `form`, `finish`) are
 * skipped, as are empty answers. Pure.
 */
export function buildLeadFields(
  steps: Step[],
  answers: Record<number, AnswerValue>,
): Record<string, AnswerValue> {
  const out: Record<string, AnswerValue> = {};
  steps.forEach((step, i) => {
    const field = "field" in step ? step.field : undefined;
    if (!field) return;
    const v = answers[i];
    if (isEmpty(v)) return;
    out[field] = isCurrencyAmount(v) ? formatCurrencyAmount(v) : (v as AnswerValue);
  });
  return out;
}
