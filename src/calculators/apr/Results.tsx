import { formatUSD, formatUSDCents, roundCents } from "@/lib/finance";
import { cn } from "@/lib/cn";
import type { FieldDef } from "../shared/fields";
import { DETAIL_FIELDS, FRONT_FIELDS, type EntryFaults } from "./fields";
import { MI_END_LTV, MIN_LOAN_AMOUNT, POINTS_LIMIT, PREPAID_INTEREST_DAYS, RATE_LIMIT, type AprInput, type AprResult } from "./math";

/** A rate without trailing zeros, for a limit or the points entered: 0.3 is "30%". */
const plainPercent = (rate: number) => `${Number((rate * 100).toFixed(3))}%`;
/** A rate or an APR as the page shows it, to three decimals: 0.07 is "7.000%". */
export const percentText = (rate: number) => `${(rate * 100).toFixed(3)}%`;
/** Whole dollars. A figure that rounds to nothing is "$0", never "-$0". */
export const usd = (x: number) => formatUSD(Math.round(x) === 0 ? 0 : x);
/** "139 months", "1 month". */
export const monthsText = (n: number) => `${n} month${n === 1 ? "" : "s"}`;

export const LOAN_ESTIMATE_LINE = "This is an estimate. The APR for your loan is the one on your Loan Estimate.";
export const WHAT_APR_IS =
  "APR stands for annual percentage rate. It is a yearly rate that counts certain fees along with the interest, so loans with different rates and fees can be compared. It does not change the monthly payment.";
export const MI_NOT_COUNTED = `Mortgage insurance is not counted: the loan is already at or under ${plainPercent(MI_END_LTV)} of the home value.`;
export const FEES_HEADING = "Fees the APR counts";
const UNUSED_CREDIT = "of the lender credit is not used here. A credit lowers the lender fees and prepaid interest to zero at most.";
const CREDIT_AND_POINTS = "It does not come off discount points.";
/** After the gap sentence while the lender fees box is empty. */
export const NO_LENDER_FEES = "No lender fees are entered.";
export const LOAN_ABOVE_VALUE = "The loan amount is larger than the home value entered.";

const GENERAL_PROMPT = "Enter the loan amount and the interest rate to see the estimated APR.";
const HOME_VALUE_PROMPT = "Enter the home value to count mortgage insurance. It decides when the insurance ends.";
const MINIMUM_PROMPT = `Enter a loan amount of ${formatUSD(MIN_LOAN_AMOUNT)} or more.`;
const FEES_PROMPT = "The fees are too large for this loan amount to estimate an APR.";
const RATE_PROMPT = `Interest rate must be from ${plainPercent(RATE_LIMIT.low)} to under ${plainPercent(RATE_LIMIT.high)}.`;
const POINTS_PROMPT = `Discount points must be between ${plainPercent(POINTS_LIMIT.low)} and ${plainPercent(POINTS_LIMIT.high)}.`;
const NO_FAULTS: EntryFaults = { unreadable: null, negative: null };
/** The two boxes that have to be entered. The rest may be left empty. */
const REQUIRED = ["loanAmount", "rate"];
const OPTIONAL = [...FRONT_FIELDS, ...DETAIL_FIELDS].filter((f) => f.type !== "choice" && !REQUIRED.includes(f.id));

/**
 * What to say when there is no result: the first thing that is wrong, in the order a visitor would
 * fix it, naming the box. The limits are the model's own constants, so a message cannot drift from
 * the check behind it. `faults` comes from `entryFaults`, which tells an empty box from junk.
 */
export function promptText(input: AprInput, faults: EntryFaults = NO_FAULTS): string {
  const junk = (id: string) => faults.unreadable?.id === id;
  // Not entered: an empty box. Junk in either box is named below.
  if ((Number.isNaN(input.loanAmount) && !junk("loanAmount")) || (Number.isNaN(input.rate) && !junk("rate"))) return GENERAL_PROMPT;
  if (faults.unreadable) {
    const { id, label } = faults.unreadable;
    return `Enter a number for ${label.toLowerCase()}${REQUIRED.includes(id) ? "" : ", or leave it empty"}.`;
  }
  // A loan amount of zero or below is asked for in the same words as one that is too small.
  if (input.loanAmount < MIN_LOAN_AMOUNT) return MINIMUM_PROMPT;
  if (faults.negative) return `${faults.negative.label} must be ${faults.negative.type === "pct" ? "0%" : "$0"} or more.`;
  if (!(input.rate >= RATE_LIMIT.low && input.rate < RATE_LIMIT.high)) return RATE_PROMPT;
  if (input.points > POINTS_LIMIT.high) return POINTS_PROMPT;
  if (input.monthlyMi > 0 && !(input.homeValue > 0)) return HOME_VALUE_PROMPT;
  // Everything typed is usable, so what is left is the fees: nothing financed, or next to nothing.
  const usable = (f: FieldDef) => {
    const figure = input[f.id as keyof AprInput];
    return f.id === "prepaidInterest" ? Number.isNaN(figure) || (Number.isFinite(figure) && figure >= 0) : Number.isFinite(figure) && figure >= 0;
  };
  return input.loanAmount >= MIN_LOAN_AMOUNT && OPTIONAL.every(usable) ? FEES_PROMPT : GENERAL_PROMPT;
}

/**
 * The sentence under the headline: how far the APR is above the interest rate, in percentage
 * points to three decimals, and what it counts. It never reads "0.000 percentage points above".
 */
export function gapSentence(r: AprResult): string {
  if (r.fees.total === 0 && r.miMonths === 0) return "With no fees counted, the APR is the same as the interest rate.";
  const points = gapText(r);
  // Something is counted, and it moves the APR by less than the page shows.
  if (Number(points) === 0) return "To three decimals, the APR is the same as the interest rate.";
  const fees = `${usd(r.fees.total)} in fees`;
  const insurance = `${monthsText(r.miMonths)} of mortgage insurance`;
  const counted = r.miMonths === 0 ? fees : r.fees.total === 0 ? insurance : `${fees} and ${insurance}`;
  return `The APR is ${points} percentage points above the interest rate, because it counts ${counted}.`;
}
/** The gap between the APR and the interest rate in percentage points, to three decimals. */
export const gapText = (r: AprResult) => (r.spread * 100).toFixed(3);

/** The gap sentence, followed by a note while the lender fees box is empty: an empty box counts as $0. */
export const gapLine = (r: AprResult, lenderFeesEmpty: boolean) => (lenderFeesEmpty ? `${gapSentence(r)} ${NO_LENDER_FEES}` : gapSentence(r));
/** True when mortgage insurance is counted on a loan larger than the home value entered. */
export const loanAboveValue = (input: AprInput, r: AprResult) => r.miMonths > 0 && input.loanAmount > input.homeValue;
/** True when mortgage insurance was entered and no payment carries it. */
export const mortgageInsuranceNotCounted = (input: AprInput, r: AprResult) => input.monthlyMi > 0 && r.miMonths === 0;
/** "$160 a month for 139 months". */
export const mortgageInsuranceText = (input: AprInput, r: AprResult) => `${usd(input.monthlyMi)} a month for ${monthsText(r.miMonths)}`;
/** The part of a lender credit that had nothing left to come off, to the cent. */
const unusedCredit = (input: AprInput, r: AprResult) => roundCents(input.lenderCredit - r.fees.lenderCreditApplied);

type Row = { label: string; value: string; total?: boolean };

/**
 * The fees behind the APR, line by line and to the cent, so the lines add up to the total as
 * shown. Lender fees and prepaid interest are always listed, at $0.00 too. Points and the credit
 * are listed only when above zero. The credit carries a minus sign, and is never "-$0".
 */
export function feeRows(input: AprInput, r: AprResult): Row[] {
  const { fees } = r;
  return [
    { label: "Lender fees", value: formatUSDCents(fees.lenderFees) },
    ...(fees.pointsAmount > 0 ? [{ label: `Discount points (${plainPercent(input.points)} of the loan)`, value: formatUSDCents(fees.pointsAmount) }] : []),
    { label: fees.prepaidInterestIsAutomatic ? `Prepaid interest (${PREPAID_INTEREST_DAYS} days)` : "Prepaid interest", value: formatUSDCents(fees.prepaidInterest) },
    ...(fees.lenderCreditApplied > 0 ? [{ label: "Lender credit", value: `-${formatUSDCents(fees.lenderCreditApplied)}` }] : []),
    { label: "Fees counted", value: formatUSDCents(fees.total), total: true },
  ];
}

/** The loan beside its APR. Mortgage insurance is listed when payments carry it. */
export function loanRows(input: AprInput, r: AprResult): Row[] {
  return [
    { label: "Interest rate", value: percentText(input.rate) },
    { label: "Estimated APR", value: percentText(r.apr) },
    { label: "Monthly principal and interest", value: usd(r.principalAndInterest) },
    ...(r.miMonths > 0 ? [{ label: "Mortgage insurance", value: mortgageInsuranceText(input, r) }] : []),
    { label: "Amount financed", value: usd(r.amountFinanced) },
    { label: "Finance charge over the loan", value: usd(r.financeCharge) },
  ];
}

function Rows({ rows }: { rows: Row[] }) {
  return (
    <dl className="m-0 mt-3 text-[14px]">
      {rows.map((row) => (
        <div key={row.label} className={cn("flex items-baseline justify-between gap-3 border-t border-line py-2", row.total && "font-bold")}>
          <dt className={row.total ? undefined : "text-muted"}>{row.label}</dt><dd className="m-0 whitespace-nowrap text-right font-semibold tabular-nums">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The fees table with the line on an unused credit under it. On screen it sits in a card; the printed page uses it bare. */
export function FeesCounted({ input, result, className }: { input: AprInput; result: AprResult; className?: string }) {
  const unused = unusedCredit(input, result);
  return (
    <section className={className}>
      <h2 className="text-[15px] font-bold">{FEES_HEADING}</h2>
      <Rows rows={feeRows(input, result)} />
      {unused > 0 && (
        <p className="mt-2 text-[13px] text-ink">{`${formatUSDCents(unused)} ${UNUSED_CREDIT}${result.fees.pointsAmount > 0 ? ` ${CREDIT_AND_POINTS}` : ""}`}</p>
      )}
    </section>
  );
}

const card = "rounded-xl border border-line bg-white p-5 shadow-card max-[600px]:p-4 print:break-inside-avoid";

/**
 * The results column of the APR calculator. `result` is null until the model has what it needs;
 * until then one sentence names what is missing or out of range. The APR is worked out from the
 * numbers typed on this page. It is an estimate, and the line under the cards says where the
 * APR for the loan is.
 */
export function AprResults({ input, result: r, disclaimer, faults = NO_FAULTS, lenderFeesEmpty = false }: {
  input: AprInput;
  result: AprResult | null;
  disclaimer: string;
  /** From `entryFaults`: the box holding junk or a negative number, for the prompt to name. */
  faults?: EntryFaults;
  /** True while the lender fees box is empty, which the input number cannot say: empty and a typed 0 are both 0. */
  lenderFeesEmpty?: boolean;
}) {
  if (!r) {
    return (
      <div role="status" className="rounded-xl border border-line bg-white p-6 text-[16px] text-muted shadow-card">
        {promptText(input, faults)}
      </div>
    );
  }

  return (
    <>
      <div className="rounded-xl bg-green-800 p-6 text-on-dark shadow-card">
        <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-mint">Estimated APR</p>
        <p aria-live="polite" className="mt-1 text-[clamp(32px,4vw,44px)] font-extrabold leading-[1.1] tracking-[-0.02em] tabular-nums text-white">{percentText(r.apr)}</p>
        <p className="mt-1.5 text-[16px] tabular-nums text-on-dark-2">Interest rate {percentText(input.rate)}</p>
      </div>

      <p className="mx-1 text-[16px] text-ink">{gapLine(r, lenderFeesEmpty)}</p>
      {mortgageInsuranceNotCounted(input, r) && <p className="mx-1 text-[14px] text-ink">{MI_NOT_COUNTED}</p>}

      <FeesCounted input={input} result={r} className={card} />

      <section className={card}>
        <h2 className="text-[15px] font-bold">The loan in numbers</h2>
        <Rows rows={loanRows(input, r)} />
        {loanAboveValue(input, r) && <p className="mt-2 text-[13px] text-ink">{LOAN_ABOVE_VALUE}</p>}
      </section>

      <section className={card}>
        <h2 className="text-[15px] font-bold">What APR is</h2>
        <p className="mt-2 text-[14px] text-muted">{WHAT_APR_IS}</p>
      </section>

      <p className="mx-1 text-[15px] font-semibold text-ink">{LOAN_ESTIMATE_LINE}</p>
      <p className="mx-1 text-[13px] text-muted">{disclaimer}</p>
    </>
  );
}
