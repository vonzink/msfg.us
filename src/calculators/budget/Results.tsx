import { formatUSD } from "@/lib/finance";
import { cn } from "@/lib/cn";
import { GaugeDial } from "../shared/Gauge";
import type { Scale } from "../shared/gaugeScale";
import { Stat } from "../shared/Stat";
import { FRONT_FIELDS, SAVINGS_RATE_FIELD, type Group } from "./fields";
import { BACK_BANDS, FRONT_BANDS, RATE_RANGE, roundShare, type Band, type BudgetInput, type BudgetResult } from "./math";

export const PRIVACY_LINE = "Your numbers stay in this browser. They are not saved or sent anywhere.";
export const RATIO_NOTE =
  "These ratios are a way to see how much of your income is spoken for. A lender looks at more than these, and this page is not a loan decision.";
/** Under the front box of a group while it is itemized. */
export const ITEMIZED_HINT = "Total of the lines under Add detail";
const SAVINGS_UNREADABLE_PROMPT = "Enter a number for the share of income set aside as savings, or leave it empty.";

/** Whole dollars. A figure that rounds to nothing is "$0", never "-$0". */
export const usd = (x: number) => formatUSD(Math.round(x) === 0 ? 0 : x);
/**
 * A share of income to two decimals: 0.36667 is "36.67%". It is rounded the way the model rounds
 * it to read the band, so the figure and the band word beside it always agree.
 */
export const shareText = (ratio: number) => `${(roundShare(ratio) * 100).toFixed(2)}%`;
/** A part of the income bar to one decimal. A part of nothing is "0.0%", never "-0.0%". */
const partShareText = (share: number) => `${(Math.max(0, share) * 100).toFixed(1)}%`;
const RESERVES_NOTE = "A lender counts reserves in its own way, so this is not that figure.";
const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const listText = (items: string[]) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);

/** What comes off the income, in the order of the form: only the parts above zero. */
function partsTaken(input: BudgetInput, r: BudgetResult): string[] {
  const parts: [string, number][] = [
    ["tax", r.taxAmount], ["savings", r.savingsAmount], ["housing", input.housing], ["debts", input.debts], ["living costs", input.living],
  ];
  return parts.filter(([, amount]) => amount > 0).map(([name]) => name);
}
/** The line under the headline: "after tax, housing, debts and living costs", naming only what was taken off. */
export function afterText(input: BudgetInput, r: BudgetResult): string {
  const parts = partsTaken(input, r);
  return parts.length > 0 ? `after ${listText(parts)}` : "with nothing taken off";
}
/**
 * Under the two shares when the month is short: they can read well while the month does not add
 * up. It names what the shares leave out, tax, savings and living costs, where those are above zero.
 */
export function shortNote(input: BudgetInput, r: BudgetResult): string {
  const outside = partsTaken(input, r).filter((part) => part !== "housing" && part !== "debts");
  const start = "These shares are of income before tax. On these numbers the month";
  return outside.length > 0 ? `${start} still falls short once ${listText(outside)} are counted.` : `${start} falls short.`;
}
/** After the amount the month is short by: what comes to more than the income. */
export function shortfallCause(input: BudgetInput, r: BudgetResult): string {
  const parts = partsTaken(input, r);
  return `${capitalized(listText(parts))} ${parts.length === 1 ? "comes" : "come"} to more than the income.`;
}
/** A rate or a band edge without trailing zeros: 0.22 is "22%". */
export const percentText = (rate: number) => `${Number((rate * 100).toFixed(3))}%`;

export const BAND_LABEL: Record<Band, string> = { comfortable: "Comfortable", stretching: "Stretching", high: "High" };
const BAND_DOT: Record<Band, string> = { comfortable: "bg-chart-3", stretching: "bg-chart-4", high: "bg-loss" };
type Bands = { comfortable: number; stretching: number };

/**
 * The scale of the shared dial for a share of income. The dial rates a higher value as better and
 * gives a value on a cutoff the better zone. A share is better when lower, so the dial is fed the
 * share with its sign turned and drawn mirrored: the cutoffs are the model's band edges, a share
 * on an edge lands in the band below it as `bandFor` has it, and the needle moves to the right as
 * the share rises, from nothing at the far left to the whole income at the far right.
 */
export function dialScale(bands: Bands): Scale {
  return { min: -1, fair: -bands.stretching, good: -bands.comfortable, max: 0 };
}

/** The headline: what is left each month, or how far the month falls short. Never "-$0". */
export function headlineText(cashFlow: number): string {
  const whole = Math.round(cashFlow);
  return whole < 0 ? `${formatUSD(-whole)} short each month` : `${usd(whole)} left each month`;
}
/** True when the month falls short by a dollar or more. */
export const fallsShort = (cashFlow: number) => Math.round(cashFlow) < 0;
/** "9 months of housing", "1 month of housing". */
export const reserveText = (months: number) => `${months} month${months === 1 ? "" : "s"} of housing`;

/** What the page knows that the model's input does not say: which groups are itemized, and a savings box that cannot be read. */
export type FormState = {
  itemized: Group[];
  savingsUnreadable: boolean;
  /** The label of a box behind Add detail holding a negative amount. */
  negative?: string | null;
  /** An itemized group with a line that is not a number. */
  unreadable?: Group | null;
};
const PLAIN_FORM: FormState = { itemized: [], savingsUnreadable: false };

/** The front boxes as the prompts name them. */
const NAME = {
  grossIncome: "the gross monthly household income",
  taxRate: "the estimated tax rate",
  housing: "the monthly housing payment",
  debts: "the monthly debt payments",
  living: "the monthly living costs",
} as const;
/** The two boxes that have to be entered. The other three count as 0 while they are empty. */
const REQUIRED = ["grossIncome", "housing"] as const;
const OPTIONAL = ["taxRate", "debts", "living"] as const;
const EMPTY_HOUSING = "Enter at least one housing line, or switch back to one total.";
const UNREADABLE_GROUP: Record<Group, string> = {
  housing: "One of the housing lines is not a number.",
  debts: "One of the debts is not a number.",
  living: "One of the living costs is not a number.",
};
const frontLabel = (id: string) => FRONT_FIELDS.find((f) => f.id === id)!.label;
const rateRangeText = `between ${percentText(RATE_RANGE.low)} and ${percentText(RATE_RANGE.high)}`;

/**
 * What to say when there is no result: the first thing that is wrong, in the order a visitor would
 * fix it, naming the box and its range. The range is the model's own constant, so a message cannot
 * drift from the check behind it.
 */
export function promptText(input: BudgetInput, form: FormState = PLAIN_FORM): string {
  const isItemized = (id: string) => (form.itemized as string[]).includes(id);
  // The two boxes that must be entered. Itemized housing is not typed there, so it is named below.
  const missing = REQUIRED.filter((id) => Number.isNaN(input[id]) && !isItemized(id));
  if (missing.length > 0) return `Enter ${listText(missing.map((id) => NAME[id]))} to see what is left each month.`;
  // Empty counts as 0 in the other three, so NaN there is something typed that is not a number.
  const junk = OPTIONAL.find((id) => Number.isNaN(input[id]) && !isItemized(id));
  if (junk) return `Enter a number for ${NAME[junk]}, or leave it empty.`;
  if (form.negative) return `${form.negative} must be $0 or more.`;
  if (form.unreadable) return UNREADABLE_GROUP[form.unreadable];
  if (isItemized("housing") && Number.isNaN(input.housing)) return EMPTY_HOUSING;
  if (!(input.grossIncome > 0) || !Number.isFinite(input.grossIncome)) return `${frontLabel("grossIncome")} must be above $0.`;
  const negative = (["housing", "debts", "living"] as const).find((id) => !(input[id] >= 0) || !Number.isFinite(input[id]));
  if (negative) return `${frontLabel(negative)} must be $0 or more.`;
  if (!(input.taxRate >= RATE_RANGE.low && input.taxRate <= RATE_RANGE.high)) return `${frontLabel("taxRate")} must be ${rateRangeText}.`;
  if (form.savingsUnreadable) return SAVINGS_UNREADABLE_PROMPT;
  if (!Number.isNaN(input.savingsRate) && !(input.savingsRate >= RATE_RANGE.low && input.savingsRate <= RATE_RANGE.high)) {
    return `${SAVINGS_RATE_FIELD.label} must be ${rateRangeText}.`;
  }
  return `Enter ${listText(REQUIRED.map((id) => NAME[id]))} to see what is left each month.`;
}

const box = "rounded-xl border border-line bg-white p-5 shadow-card max-[600px]:p-4";

/** The band in words with a matching dot, so the dial never rests on colour alone. */
function BandWord({ band }: { band: Band }) {
  return (
    <span data-band={band} className="inline-flex items-center gap-1.5 text-[14px] font-bold">
      <span className="sr-only">Band:</span>
      <i aria-hidden="true" className={cn("inline-block size-2.5 rounded-full", BAND_DOT[band])} />
      <span>{BAND_LABEL[band]}</span>
    </span>
  );
}

/** One share of income: the shared dial with the band edges written on it, the percent and the band in words. */
function ShareCard({ label, secondary, ratio, band, bands }: { label: string; secondary: string; ratio: number; band: Band; bands: Bands }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-0.5 rounded-lg border border-line bg-white p-3.5 text-center print:break-inside-avoid">
      <h2 className="text-[14px] font-bold">{label}</h2>
      <span className="text-[12px] text-muted">{secondary}</span>
      <div className="mt-2 flex w-full justify-center">
        <GaugeDial value={-roundShare(ratio)} scale={dialScale(bands)} mirror edgeLabels={[percentText(bands.comfortable), percentText(bands.stretching)]} />
      </div>
      <span className="mt-1 text-[22px] font-extrabold tabular-nums tracking-[-0.01em]">{shareText(ratio)}</span>
      <BandWord band={band} />
    </div>
  );
}

/**
 * The scale of the shared two-zone dial for a dollar figure. There are no bands for dollars, only
 * above or below zero, so the dial has one line, $0 at the top centre. The needle is placed by the
 * figure as a share of gross income and pinned at half of the income either way.
 */
export const MONEY_SCALE: Scale = { min: -0.5, fair: 0, good: 0, max: 0.5 };

type Side = "above" | "zero" | "below";
const SIDE_DOT: Record<Side, string> = { above: "bg-chart-3", zero: "bg-chart-axis", below: "bg-loss" };
/** Which side of zero a figure is on, as it is shown: a few cents either way is zero. */
const sideOf = (amount: number): Side => (Math.round(amount) > 0 ? "above" : Math.round(amount) < 0 ? "below" : "zero");
export const RESIDUAL_STATUS: Record<Side, string> = {
  above: "Income covers housing and debts",
  zero: "Housing and debts take all of the income",
  below: "Housing and debts come to more than the income",
};
export const CASH_FLOW_STATUS: Record<Side, string> = {
  above: "Money left over",
  zero: "Nothing left over",
  below: "Costs come to more than the income",
};
/** An amount taken off: a minus sign only when it is not zero, so never "-$0". */
const taken = (amount: number) => (Math.round(amount) === 0 ? "$0" : `-${formatUSD(amount)}`);

type MoneyRow = { label: string; value: string; note?: string; total?: boolean };

/**
 * A dollar figure as a gauge card: the two-zone dial, the figure, which side of zero it is on in
 * words with a dot, and a small table of how it is reached.
 */
function MoneyCard({ label, secondary, amount, income, status, rows }: {
  label: string;
  secondary: string;
  amount: number;
  income: number;
  status: Record<Side, string>;
  rows: MoneyRow[];
}) {
  const side = sideOf(amount);
  return (
    <div className="flex min-w-0 flex-col items-center gap-0.5 rounded-lg border border-line bg-white p-3.5 text-center print:break-inside-avoid">
      <h2 className="text-[14px] font-bold">{label}</h2>
      <span className="text-[12px] text-muted">{secondary}</span>
      <div className="mt-2 flex w-full justify-center">
        <GaugeDial value={side === "zero" ? 0 : amount / income} scale={MONEY_SCALE} twoZone centerLabel="$0" />
      </div>
      <span className={cn("mt-1 text-[22px] font-extrabold tabular-nums tracking-[-0.01em]", side === "below" && "text-loss")}>{usd(amount)}</span>
      <span data-status={side} className="inline-flex items-center gap-1.5 text-[13px] font-bold">
        <span className="sr-only">Status:</span>
        <i aria-hidden="true" className={cn("inline-block size-2.5 flex-none rounded-full", SIDE_DOT[side])} />
        <span>{status[side]}</span>
      </span>
      <dl className="m-0 mt-3 w-full text-left text-[13px]">
        {rows.map((row) => (
          <div key={row.label} className={cn("flex items-baseline justify-between gap-3 border-t border-line py-1.5", row.total && "font-bold")}>
            <dt className={row.total ? undefined : "text-muted"}>
              {row.label}
              {row.note && <span className="block text-[11px] font-normal text-muted">{row.note}</span>}
            </dt><dd className="m-0 whitespace-nowrap font-semibold tabular-nums">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** The rows of the residual card: the income, what housing and debts take, and what is left after living costs too. */
export function residualRows(input: BudgetInput, r: BudgetResult): MoneyRow[] {
  return [
    { label: "Gross income", value: formatUSD(input.grossIncome) },
    { label: "Housing payment", value: taken(input.housing) },
    { label: "Debt payments", value: taken(input.debts) },
    { label: "After housing and debts", value: usd(r.residual), total: true },
    { label: "After all expenses", value: usd(r.residualAfterLiving), note: "before tax and savings" },
  ];
}

/** The rows of the cash flow card. Tax and savings only when above zero; the three costs always, so the table keeps its shape. */
export function cashFlowRows(input: BudgetInput, r: BudgetResult): MoneyRow[] {
  const short = fallsShort(r.cashFlow);
  return [
    { label: "Gross income", value: formatUSD(input.grossIncome) },
    ...(r.taxAmount > 0 ? [{ label: "Tax", value: taken(r.taxAmount) }] : []),
    ...(r.savingsAmount > 0 ? [{ label: "Savings set aside", value: taken(r.savingsAmount) }] : []),
    { label: "Housing payment", value: taken(input.housing) },
    { label: "Debt payments", value: taken(input.debts) },
    { label: "Living costs", value: taken(input.living) },
    { label: short ? "Short each month" : "Left each month", value: usd(Math.abs(Math.round(r.cashFlow))), total: true },
  ];
}

type Part = { label: string; amount: number; swatch: string };

/** The parts the income is split into, in the order of the form. A part of nothing is left off, except what is left over. */
export function incomeParts(input: BudgetInput, r: BudgetResult): Part[] {
  const parts: Part[] = [
    { label: "Tax", amount: r.taxAmount, swatch: "bg-chart-axis" },
    { label: "Savings", amount: r.savingsAmount, swatch: "bg-chart-1" },
    { label: "Housing", amount: input.housing, swatch: "bg-green-800" },
    { label: "Debts", amount: input.debts, swatch: "bg-chart-2" },
    { label: "Living costs", amount: input.living, swatch: "bg-chart-4" },
    { label: "Left over", amount: r.cashFlow, swatch: "bg-chart-3" },
  ];
  return parts.filter((p) => p.amount > 0 || p.label === "Left over");
}

/** The income as one bar, with every part listed beside its amount and share so it reads without colour. */
function IncomeBar({ input, result }: { input: BudgetInput; result: BudgetResult }) {
  const parts = incomeParts(input, result);
  const share = (amount: number) => amount / input.grossIncome;
  return (
    <div className={box}>
      <h2 className="text-[17px] font-bold">Where the income goes</h2>
      <p className="mt-1 text-[14px] text-muted">Each part of {formatUSD(input.grossIncome)} of monthly income, before tax.</p>
      <div aria-hidden="true" className="mt-3 flex h-3 overflow-hidden rounded-full bg-paper-2">
        {parts.map((p) => <span key={p.label} className={p.swatch} style={{ width: `${Math.max(0, share(p.amount)) * 100}%` }} />)}
      </div>
      <ul className="m-0 mt-3 grid list-none gap-2 p-0 text-[14px]">
        {parts.map((p) => (
          <li key={p.label} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <i aria-hidden="true" className={cn("inline-block size-2.5 flex-none rounded-[2px]", p.swatch)} />
            <span className="font-semibold">{p.label}</span>
            <span className="ml-auto font-semibold tabular-nums">{usd(p.amount)}</span>
            <span className="w-[52px] text-right tabular-nums text-muted">{partShareText(share(p.amount))}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2.5 text-[12px] text-muted">Figures are rounded.</p>
    </div>
  );
}

/**
 * The results column of the Home budget calculator. `result` is null until the model has all it
 * needs; until then one sentence names what is missing or out of range. The two shares are bands
 * of income, read in three words, and nothing here says what a lender would decide.
 */
export function BudgetResults({ input, result: r, disclaimer, form = PLAIN_FORM }: {
  input: BudgetInput;
  result: BudgetResult | null;
  disclaimer: string;
  form?: FormState;
}) {
  if (!r) {
    return (
      <div role="status" className="rounded-xl border border-line bg-white p-6 text-[16px] text-muted shadow-card">
        {promptText(input, form)}
      </div>
    );
  }

  const short = fallsShort(r.cashFlow);

  return (
    <>
      <div className="rounded-xl bg-green-800 p-6 text-on-dark shadow-card">
        <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-mint">Estimated monthly cash flow</p>
        <p aria-live="polite" className="mt-1 text-[clamp(28px,3.6vw,40px)] font-extrabold leading-[1.1] tracking-[-0.02em] tabular-nums text-white">
          {headlineText(r.cashFlow)}
        </p>
        <p className="mt-1.5 text-[16px] text-on-dark-2">{afterText(input, r)}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 max-[600px]:grid-cols-1">
        <ShareCard label="Housing as a share of income" secondary="front-end ratio" ratio={r.frontRatio} band={r.frontBand} bands={FRONT_BANDS} />
        <ShareCard label="Housing and debts as a share of income" secondary="back-end ratio" ratio={r.backRatio} band={r.backBand} bands={BACK_BANDS} />
        <MoneyCard
          label="Left after housing and debts" secondary="monthly residual"
          amount={r.residual} income={input.grossIncome} status={RESIDUAL_STATUS} rows={residualRows(input, r)}
        />
        <MoneyCard
          label="Monthly cash flow" secondary="after tax, savings and all costs"
          amount={r.cashFlow} income={input.grossIncome} status={CASH_FLOW_STATUS} rows={cashFlowRows(input, r)}
        />
      </div>

      {short && <p className="mx-1 text-[14px] font-semibold text-ink">{shortNote(input, r)}</p>}

      {r.reserveMonths !== null && (
        <Stat
          label="Savings cover"
          value={reserveText(r.reserveMonths)}
          sub={`from ${usd(input.balances)} in account balances`}
          tip={`The balances entered under Add detail, divided by the monthly housing payment and rounded down to whole months. ${RESERVES_NOTE}`}
        />
      )}

      {short ? (
        <p className="mx-1 text-[16px] font-semibold text-ink">
          On these numbers the month falls short by {formatUSD(-Math.round(r.cashFlow))}. {shortfallCause(input, r)}
        </p>
      ) : (
        <IncomeBar input={input} result={r} />
      )}

      <p className="mx-1 text-[14px] text-ink">{RATIO_NOTE}</p>
      <p className="mx-1 text-[13px] text-muted">{disclaimer}</p>
    </>
  );
}
