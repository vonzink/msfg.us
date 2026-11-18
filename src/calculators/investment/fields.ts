import type { AmortType, ReoInput, ReoResult, SaleTaxMode } from "./math";
import { formatUSD } from "@/lib/finance";

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
  /** Only used when there is a loan: disabled while "All cash" is picked. */
  loanOnly?: boolean;
  slider?: { min: number; max: number; step: number };
  options?: { value: string; label: string }[];
  wide?: boolean;
};

export type GroupDef = {
  id: string;
  title: string;
  lead: string;
  /** Always open, no disclosure. */
  fixed?: boolean;
  /** Shown beside the title so a closed group still says what it holds. */
  summary?: (n: Numbers, r: ReoResult) => string;
  fields: FieldDef[];
};

export type Numbers = Record<string, number>;

export function parseNumber(v: string | undefined): number {
  const x = Number(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(x) ? x : 0;
}

const RENO = ["renoPaint", "renoFloor", "renoAppl", "renoRoof", "renoPest", "renoFireplace", "renoOther"];
export const renoTotal = (n: Numbers): number => RENO.reduce((t, id) => t + n[id], 0);

export const GROUPS: GroupDef[] = [
  {
    id: "deal",
    title: "The deal",
    fixed: true,
    lead: "Start here. These six numbers drive most of the result.",
    fields: [
      { id: "purchasePrice", label: "Purchase price", type: "money", example: "500,000" },
      { id: "grossRents", label: "Monthly rent", type: "money", example: "3,780" },
      {
        id: "downPct", label: "Down payment", type: "pct", example: "20", loanOnly: true,
        slider: { min: 0, max: 100, step: 1 },
        hintFn: (n) => `${formatUSD((n.purchasePrice * n.downPct) / 100)} down`,
      },
      { id: "rate", label: "Interest rate", type: "pct", example: "7", loanOnly: true },
      { id: "termYears", label: "Loan term", type: "num", example: "30", suffix: "yrs", loanOnly: true },
      {
        id: "amortType", label: "Loan type", type: "choice", example: "cash", wide: true,
        options: [
          { value: "pi", label: "Principal + interest" },
          { value: "io", label: "Interest only" },
          { value: "cash", label: "All cash" },
        ],
      },
    ],
  },
  {
    id: "upfront",
    title: "Closing and renovation",
    lead: "Paid in cash up front, so these count toward the cash you invest.",
    summary: (n) => `${formatUSD(n.acqCosts + renoTotal(n))} up front`,
    fields: [
      { id: "acqCosts", label: "Closing costs", type: "money", example: "6,000" },
      { id: "renoPaint", label: "Paint", type: "money", example: "3,000" },
      { id: "renoFloor", label: "Flooring", type: "money", example: "6,000" },
      { id: "renoAppl", label: "Appliances", type: "money", example: "2,500" },
      { id: "renoRoof", label: "Roof", type: "money", example: "" },
      { id: "renoPest", label: "Pest repairs", type: "money", example: "" },
      { id: "renoFireplace", label: "Fireplace cleaning", type: "money", example: "" },
      { id: "renoOther", label: "Other repairs", type: "money", example: "1,500" },
      { id: "renoMonths", label: "Months to renovate", type: "num", example: "2", suffix: "mo", hint: "No rent during these months." },
      {
        id: "renoValue", label: "Value after renovation", type: "money", example: "",
        hint: "Leave blank to use the purchase price.",
        warnFn: (n) =>
          n.renoValue > 0 && n.renoValue < n.purchasePrice
            ? `That's ${formatUSD(n.purchasePrice - n.renoValue)} below the purchase price, so the projection starts with that loss. Double-check it.`
            : null,
      },
    ],
  },
  {
    id: "expenses",
    title: "Monthly expenses",
    lead: "What it costs to own and run the property each month, not counting the mortgage.",
    summary: (_n, r) => `${formatUSD(r.expensesMonthly)} / mo`,
    fields: [
      { id: "propTaxRate", label: "Property tax rate", type: "pct", example: "1.1", hint: "Per year, on the purchase price." },
      { id: "ins", label: "Insurance", type: "money", example: "110" },
      { id: "hoa", label: "HOA dues", type: "money", example: "" },
      { id: "propMaint", label: "Maintenance", type: "money", example: "120" },
      { id: "mgmt", label: "Management fees", type: "money", example: "190" },
      { id: "landscape", label: "Landscaping", type: "money", example: "" },
      { id: "adv", label: "Advertising", type: "money", example: "" },
      { id: "autoTravel", label: "Auto and travel", type: "money", example: "" },
      { id: "otherExp", label: "Other", type: "money", example: "" },
      {
        id: "vacancy", label: "Vacancy", type: "pct", example: "5",
        slider: { min: 0, max: 25, step: 1 }, hint: "Share of the year the home sits empty.",
      },
    ],
  },
  {
    id: "growth",
    title: "Growth and sale",
    lead: "Yearly changes used for the five-year projection.",
    summary: (n) => `${n.appreciation}% appreciation`,
    fields: [
      { id: "appreciation", label: "Home appreciation", type: "pct", example: "3", slider: { min: 0, max: 10, step: 0.5 } },
      { id: "rentIncrease", label: "Rent increase", type: "pct", example: "2.5" },
      { id: "expIncrease", label: "Expense increase", type: "pct", example: "2.5" },
      { id: "sellCostPct", label: "Selling costs", type: "pct", example: "6", hint: "Agent fees and closing when you sell." },
    ],
  },
  {
    id: "taxes",
    title: "Income taxes",
    lead: "Used to estimate the tax you owe, or save, on the rental each year.",
    summary: (n) => `${n.taxBracket}% bracket`,
    fields: [
      { id: "taxBracket", label: "Your tax bracket", type: "pct", example: "24" },
      { id: "improvePct", label: "Building share of value", type: "pct", example: "80", hint: "Land cannot be depreciated. 70 to 85 is typical." },
      { id: "deprYears", label: "Depreciation period", type: "num", example: "27.5", suffix: "yrs", hint: "27.5 years for residential rentals." },
      {
        id: "lossesNow", label: "Can you deduct rental losses from your other income?", type: "choice", example: "no",
        hint: "Usually only if your income is under $150,000, and in full only under $100,000. If not, a loss waits for later rental profit or the sale. Ask your tax advisor.",
        options: [
          { value: "yes", label: "Yes, each year" },
          { value: "no", label: "No, hold them" },
        ],
      },
      {
        id: "saleTax", label: "Tax when you sell", type: "choice", example: "long",
        hint: "Long-term rates need more than a year of ownership. Either way, the depreciation you took is taxed again when you sell.",
        options: [
          { value: "none", label: "Leave out" },
          { value: "long", label: "Long-term gain" },
          { value: "short", label: "Short-term gain" },
        ],
      },
      { id: "capGainsRate", label: "Long-term gains rate", type: "pct", example: "15", hint: "0, 15 or 20 for most people." },
    ],
  },
  {
    id: "compare",
    title: "Opportunity cost",
    lead: "See how the property stacks up against putting the same cash somewhere else.",
    summary: (n) => (n.compareOn ? `vs ${n.altReturn}% a year` : "Off"),
    fields: [
      {
        id: "compareAlt", label: "Compare with another investment", type: "choice", example: "on",
        options: [
          { value: "off", label: "Off" },
          { value: "on", label: "On" },
        ],
      },
      { id: "altReturn", label: "Return elsewhere", type: "pct", example: "4", hint: "Yearly after-tax return you could expect, such as from an index fund." },
    ],
  },
];

export const FIELDS: FieldDef[] = GROUPS.flatMap((g) => g.fields);

export const EXAMPLE: Values = Object.fromEntries(FIELDS.map((f) => [f.id, f.example]));
/** Cleared form. Switches keep their setting; the rates behind them keep a usable default. */
const KEEP_ON_CLEAR = new Set(["capGainsRate", "altReturn"]);
export const BLANK: Values = Object.fromEntries(
  FIELDS.map((f) => [f.id, f.type === "choice" || KEEP_ON_CLEAR.has(f.id) ? f.example : ""]),
);

/** Numeric view of the form (percent fields stay in percent units). */
export function toNumbers(values: Values): Numbers {
  const n: Numbers = Object.fromEntries(
    FIELDS.filter((f) => f.type !== "choice" && f.type !== "text").map((f) => [f.id, parseNumber(values[f.id])]),
  );
  // 1 when the opportunity-cost comparison is switched on, so summaries and results can read it.
  n.compareOn = values.compareAlt === "on" ? 1 : 0;
  return n;
}

export function toModel(values: Values, n: Numbers): ReoInput {
  return {
    purchasePrice: n.purchasePrice,
    downPct: n.downPct / 100,
    rate: n.rate / 100,
    termYears: n.termYears,
    amortType: (values.amortType || "pi") as AmortType,
    acqCosts: n.acqCosts,
    renoTotal: renoTotal(n),
    renoMonths: n.renoMonths,
    renoValue: n.renoValue,
    sellCostPct: n.sellCostPct / 100,
    grossRents: n.grossRents,
    vacancy: n.vacancy / 100,
    carryMonthly: n.ins + n.hoa,
    operatingMonthly: n.adv + n.autoTravel + n.landscape + n.propMaint + n.mgmt + n.otherExp,
    propTaxRate: n.propTaxRate / 100,
    appreciation: n.appreciation / 100,
    rentIncrease: n.rentIncrease / 100,
    expIncrease: n.expIncrease / 100,
    improvePct: n.improvePct / 100,
    taxBracket: n.taxBracket / 100,
    deprYears: n.deprYears,
    useLossesNow: values.lossesNow === "yes",
    saleTax: (values.saleTax || "none") as SaleTaxMode,
    capGainsRate: n.capGainsRate / 100,
    altReturn: n.compareOn ? n.altReturn / 100 : 0,
  };
}

/** Plain-English read of the result. States facts only; not a recommendation. */
export function verdict(n: Numbers, r: ReoResult): string {
  if (n.purchasePrice <= 0) return "Enter a purchase price and monthly rent to see your numbers, or load the example.";
  if (n.grossRents <= 0) return "Add the monthly rent to see cash flow.";
  const monthly = r.cashFlow[0] / 12;
  const first =
    monthly >= 0
      ? `The rent covers the bills with about ${formatUSD(monthly)} a month left over in year 1.`
      : `You would add about ${formatUSD(-monthly)} a month out of pocket in year 1.`;
  return first + payback(r) + beatsAlt(n, r);
}

/** When selling would first return more than the cash put in. */
function payback(r: ReoResult): string {
  const year = r.cumulativeReturn.findIndex((x) => x >= 0);
  if (year < 0) return " Selling within five years would not get back the cash you put in.";
  return ` Selling after ${yearText(year)} would get back more than you put in.`;
}

/** When the property first beats the same cash invested elsewhere. Empty when the comparison is off. */
function beatsAlt(n: Numbers, r: ReoResult): string {
  if (!n.compareOn || n.altReturn <= 0) return "";
  const year = r.vsAlt.findIndex((x) => x >= 0);
  if (year < 0) return ` It would not beat ${n.altReturn}% a year within five years.`;
  return ` It would beat ${n.altReturn}% a year after ${yearText(year)}.`;
}

const yearText = (i: number) => (i === 0 ? "the first year" : `year ${i + 1}`);
