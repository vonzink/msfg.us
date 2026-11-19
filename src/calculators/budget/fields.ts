import { roundCents } from "@/lib/finance";
import { parseRate, typedAmount, type FieldDef, type Values } from "../shared/fields";
import type { BudgetInput } from "./math";
import type { Row } from "./rows";

/**
 * Inputs of the Home budget calculator. Five are always visible. Behind "Add detail" each of
 * housing, debts and living costs can be itemized instead of typed as one total, and there is a
 * savings rate and five account balances. Every amount is monthly dollars, except the balances.
 *
 * A group is either one total or its lines, never both: its "Mode" value says which. Itemizing
 * leaves the typed total where it is and ignores it; switching back ignores the lines and keeps
 * them. `groupTotal` is the one place that decides which is used, so the box on the page and the
 * math always agree.
 *
 * Empty is "not entered", never $0 or 0%. A typed 0 is an answer in the tax rate and in every
 * amount but the income, so those money boxes are marked `keepZero` and keep a typed 0 on leaving
 * the field.
 */
export const FRONT_FIELDS: FieldDef[] = [
  { id: "grossIncome", label: "Gross monthly household income", type: "money", example: "9,000", hint: "Before tax." },
  {
    id: "taxRate", label: "Estimated tax rate", type: "pct", example: "22",
    hint: "Federal, state and payroll taxes together, as a share of gross income.",
  },
  { id: "housing", label: "Monthly housing payment", type: "money", example: "2,700", keepZero: true },
  {
    id: "debts", label: "Monthly debt payments", type: "money", example: "600", keepZero: true,
    hint: "Car loans, student loans, credit card minimums and the like.",
  },
  {
    id: "living", label: "Monthly living costs", type: "money", example: "2,500", keepZero: true,
    hint: "Utilities, groceries, transport, insurance, childcare and the rest.",
  },
];

/** The three parts of the month that are either one total or itemized. Each is also the id of its front box. */
export type Group = "housing" | "debts" | "living";
export type Mode = "total" | "itemized";
export const GROUPS: Group[] = ["housing", "debts", "living"];

const MODE_OPTIONS = [{ value: "total", label: "One total" }, { value: "itemized", label: "Itemize" }];
/** The "One total / Itemize" switch of each group. Its value is a Mode. */
export const MODE_FIELDS: FieldDef[] = [
  { id: "housingMode", label: "Enter housing as", type: "choice", example: "total", options: MODE_OPTIONS },
  { id: "debtsMode", label: "Enter debts as", type: "choice", example: "total", options: MODE_OPTIONS },
  { id: "livingMode", label: "Enter living costs as", type: "choice", example: "total", options: MODE_OPTIONS },
];

const line = (id: string, label: string, hint?: string): FieldDef => ({ id, label, type: "money", example: "", keepZero: true, ...(hint ? { hint } : {}) });

/** Housing, line by line. The dashboard's flood insurance and "other housing" lines are left out. */
export const HOUSING_LINES: FieldDef[] = [
  line("housingPi", "Principal and interest"),
  line("housingTax", "Property tax"),
  line("housingInsurance", "Homeowners insurance"),
  line("housingMi", "Mortgage insurance"),
  line("housingHoa", "HOA dues"),
];

/** Living costs by category: the dashboard's eight. */
export const LIVING_LINES: FieldDef[] = [
  line("livingUtilities", "Utilities", "Electric, gas and water."),
  line("livingPhone", "Phone, internet and cable"),
  line("livingGroceries", "Groceries"),
  line("livingTransport", "Transport and fuel"),
  line("livingInsurance", "Insurance", "Auto, health and life. Not homeowners insurance."),
  line("livingChildcare", "Childcare and education"),
  line("livingEntertainment", "Subscriptions and entertainment"),
  line("livingOther", "Other living costs"),
];

/** Optional: empty means nothing is set aside. */
export const SAVINGS_RATE_FIELD: FieldDef = {
  id: "savingsRate", label: "Share of income set aside as savings", type: "pct", example: "",
  hint: "Optional. A share of gross income, taken off before the bills.",
};

const balance = (id: string, label: string, hint?: string): FieldDef => ({ id, label, type: "money", example: "", ...(hint ? { hint } : {}) });

/** Account balances, the dashboard's five. Optional: they only say how many months of housing they would cover. */
export const BALANCE_FIELDS: FieldDef[] = [
  balance("balanceChecking", "Checking accounts"),
  balance("balanceSavings", "Savings accounts"),
  balance("balanceRetirement", "Retirement accounts", "401(k), IRA and the like."),
  balance("balanceInvestments", "Stocks and investments"),
  balance("balanceOther", "Other assets"),
];

const ALL = [...FRONT_FIELDS, ...MODE_FIELDS, ...HOUSING_LINES, ...LIVING_LINES, SAVINGS_RATE_FIELD, ...BALANCE_FIELDS];

/** The worked example the page opens with. The debt rows open as `blankRows()`. */
export function exampleValues(): Values {
  return Object.fromEntries(ALL.map((f) => [f.id, f.example]));
}

/** Cleared form: every typed box empty, every group back to one total. The debt rows clear to `blankRows()`. */
export const BLANK: Values = Object.fromEntries(ALL.map((f) => [f.id, f.type === "choice" ? f.example : ""]));

const isEmpty = (text: string | undefined): boolean => String(text ?? "").trim() === "";

/**
 * Adds up a set of boxes of which any may be left empty. NaN, meaning "not entered", when every
 * box is empty, and also when one holds something unreadable: a sum is never shown with a line
 * silently left out. A typed 0 is an entry.
 */
function sumEntered(texts: (string | undefined)[]): number {
  const typed = texts.filter((t) => !isEmpty(t));
  if (typed.length === 0) return Number.NaN;
  return roundCents(typed.reduce((sum, t) => sum + typedAmount(t), 0));
}

export function isItemized(values: Values, group: Group): boolean {
  return values[`${group}Mode`] === "itemized";
}

/**
 * The monthly amount of a group as the math uses it: the sum of its lines (for debts, of the
 * rows' payments) when the group is itemized, otherwise the total typed in its front box. NaN when
 * that is not entered. The page shows this in the front box while the group is itemized.
 */
export function groupTotal(values: Values, debtRows: Row[], group: Group): number {
  if (!isItemized(values, group)) return typedAmount(values[group]);
  if (group === "debts") return sumEntered(debtRows.map((r) => r.payment));
  return sumEntered((group === "housing" ? HOUSING_LINES : LIVING_LINES).map((f) => values[f.id]));
}

/** The account balances added up. NaN when none is entered or one is unreadable. */
export function balancesTotal(values: Values): number {
  return sumEntered(BALANCE_FIELDS.map((f) => values[f.id]));
}

/**
 * True when the savings rate box holds something that is not a number. The box is optional, so the
 * model counts that as "not entered", which is 0; the page can use this to say so under the box.
 */
export function savingsRateUnreadable(values: Values): boolean {
  return !isEmpty(values.savingsRate) && Number.isNaN(parseRate(values.savingsRate));
}

/** Turns what was typed into the model's input. */
export function toInput(values: Values, debtRows: Row[]): BudgetInput {
  return {
    // Empty or unreadable is "not entered" (NaN), which the model turns down.
    grossIncome: typedAmount(values.grossIncome),
    // A rate that is not one number is NaN. A typed 0 is a real 0%.
    taxRate: parseRate(values.taxRate),
    // Optional: NaN here is "not entered", which the model counts as 0.
    savingsRate: parseRate(values.savingsRate),
    housing: groupTotal(values, debtRows, "housing"),
    debts: groupTotal(values, debtRows, "debts"),
    living: groupTotal(values, debtRows, "living"),
    balances: balancesTotal(values),
  };
}
