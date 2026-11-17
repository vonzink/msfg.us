import type { AmortType, ReoInput, ReoResult } from "@/lib/calculators/reoMath";
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
      { id: "purchasePrice", label: "Purchase price", type: "money", example: "250,000" },
      { id: "grossRents", label: "Monthly rent", type: "money", example: "2,400" },
      {
        id: "downPct", label: "Down payment", type: "pct", example: "25",
        slider: { min: 0, max: 100, step: 1 },
        hintFn: (n) => `${formatUSD((n.purchasePrice * n.downPct) / 100)} down`,
      },
      { id: "rate", label: "Interest rate", type: "pct", example: "7" },
      { id: "termYears", label: "Loan term", type: "num", example: "30", suffix: "yrs" },
      {
        id: "amortType", label: "Loan type", type: "choice", example: "pi", wide: true,
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
      { id: "renoValue", label: "Value after renovation", type: "money", example: "280,000", hint: "Leave blank to use the purchase price." },
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
    ],
  },
];

export const FIELDS: FieldDef[] = GROUPS.flatMap((g) => g.fields);

export const EXAMPLE: Values = Object.fromEntries(FIELDS.map((f) => [f.id, f.example]));
export const BLANK: Values = Object.fromEntries(
  FIELDS.map((f) => [f.id, f.type === "choice" ? f.example : ""]),
);

/** Numeric view of the form (percent fields stay in percent units). */
export function toNumbers(values: Values): Numbers {
  return Object.fromEntries(
    FIELDS.filter((f) => f.type !== "choice" && f.type !== "text").map((f) => [f.id, parseNumber(values[f.id])]),
  );
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
  const ahead = r.cumulativeReturn.findIndex((x) => x >= 0);
  const second =
    ahead === 0
      ? " You would be ahead if you sold after the first year."
      : ahead > 0
        ? ` You would be ahead if you sold after year ${ahead + 1}.`
        : " Selling within five years would not recover the cash you put in.";
  return first + second;
}
