import { formatUSD } from "@/lib/finance";
import { cn } from "@/lib/cn";
import { SeriesChart } from "../shared/Charts";
import { Stat } from "../shared/Stat";
import { DETAIL_FIELDS } from "./fields";
import {
  ASSUMPTION_RANGE, buyingSlipsBack, COST_INFLATION, INCOME_TAX_RANGE, MAX_YEARS, mortgageInsuranceApplies, RATE_LIMIT, SELLING_COSTS_RANGE,
  type RentVsBuyInput, type RentVsBuyResult,
} from "./math";

export const CAUTION =
  "A comparison like this turns on its assumptions. Home values and rents do not rise at a steady rate, and small changes above can move the result.";
export const MORTGAGE_INSURANCE_NOTE =
  "With less than 20% down, most loans add mortgage insurance. Enter the monthly amount under Add detail to count it.";
export const UNDERWATER_NOTE = "On these numbers the sale would not cover the loan and the selling costs.";
export const TAX_NOTE =
  "The tax saving assumes you itemize deductions and that all of the interest is deductible. Many households take the standard deduction instead, and then there is no saving. This is not tax advice.";
/** Shown under the mortgage insurance box when an amount is typed that the model does not charge. */
export const MI_NOT_COUNTED = "Not counted: the down payment is 20% or more.";
const NOT_INCLUDED = "Not included: renters insurance, and investing any monthly difference between the two payments.";

const DOWN_ABOVE_PRICE_PROMPT = "The down payment is more than the home price.";
const GENERAL_PROMPT =
  "Enter the rent, the home price, the down payment, the interest rate and how long you plan to stay to see the comparison.";
const COSTS_PROMPT =
  "Add closing costs, property tax, homeowners insurance and maintenance under Add detail to see the comparison. Enter 0 for any that do not apply.";

/** "7 years", "1 year". */
export const yearsText = (n: number) => `${n} year${n === 1 ? "" : "s"}`;
/** A decimal rate as a percent: 0.045 is "4.5%". */
export const percentText = (rate: number) => `${Number((rate * 100).toFixed(3))}%`;

/** Whole dollars. A figure that rounds to nothing is "$0", never "-$0". */
export const usd = (x: number) => formatUSD(Math.round(x) === 0 ? 0 : x);

/** The four assumption rates, in the order of the form, each with the range the model allows. */
const ASSUMPTION_RATES = [
  { id: "appreciation", range: ASSUMPTION_RANGE },
  { id: "rentIncrease", range: ASSUMPTION_RANGE },
  { id: "sellingCosts", range: SELLING_COSTS_RANGE },
  { id: "investmentReturn", range: ASSUMPTION_RANGE },
] as const;
const fieldLabel = (id: string) => DETAIL_FIELDS.find((f) => f.id === id)!.label;

/**
 * What to say when there is no result: the first thing that is wrong, in the order a visitor
 * would fix it. The limits are the model's own constants, so a message cannot drift from the
 * check behind it. Anything else the model turns down (a negative down payment, a broken loan
 * term) gets the general prompt.
 */
export function promptText(input: RentVsBuyInput): string {
  const { monthlyRent, homePrice, downPayment, rate, stayYears } = input;
  if (homePrice > 0 && downPayment > homePrice) return DOWN_ABOVE_PRICE_PROMPT;
  const missing = (x: number) => !Number.isFinite(x) || x <= 0;
  if (missing(monthlyRent) || missing(homePrice) || !Number.isFinite(downPayment) || downPayment < 0 || Number.isNaN(rate) || Number.isNaN(stayYears)) {
    return GENERAL_PROMPT;
  }
  if (!Number.isFinite(rate) || rate < 0 || rate >= RATE_LIMIT) return `Enter an interest rate from 0% to under ${percentText(RATE_LIMIT)}.`;
  if (!Number.isInteger(stayYears) || stayYears < 1 || stayYears > MAX_YEARS) return `Enter a stay from 1 to ${MAX_YEARS} years.`;
  if ([input.closingCosts, input.yearlyTax, input.yearlyInsurance, input.yearlyMaintenance].some(Number.isNaN)) return COSTS_PROMPT;
  // Optional boxes: empty is fine, something unreadable is named.
  const unreadable = (["monthlyMi", "monthlyHoa"] as const).find((id) => Number.isNaN(input[id]));
  if (unreadable) return `Enter a number for ${fieldLabel(unreadable)}, or leave it empty.`;
  const notEntered = ASSUMPTION_RATES.find(({ id }) => Number.isNaN(input[id]));
  if (notEntered) return `Enter a number for ${fieldLabel(notEntered.id)}. 0 is allowed.`;
  const outside = ASSUMPTION_RATES.find(({ id, range }) => !(input[id] >= range.low && input[id] <= range.high));
  if (outside) return `${fieldLabel(outside.id)} must be between ${percentText(outside.range.low)} and ${percentText(outside.range.high)}.`;
  const { incomeTaxRate } = input;
  if (Number.isNaN(incomeTaxRate)) return "Enter a number for Income tax rate, or leave it empty.";
  if (!(incomeTaxRate >= INCOME_TAX_RANGE.low && incomeTaxRate <= INCOME_TAX_RANGE.high)) {
    return `Income tax rate must be between ${percentText(INCOME_TAX_RANGE.low)} and ${percentText(INCOME_TAX_RANGE.high)}.`;
  }
  return GENERAL_PROMPT;
}

/** True when the down payment is under 20% and no mortgage insurance was entered: the page then asks for it. */
export const mortgageInsuranceMissing = (input: RentVsBuyInput) => mortgageInsuranceApplies(input) && !(input.monthlyMi > 0);
/** True when a mortgage insurance amount was typed but the down payment is 20% or more, so it is not charged. */
export const mortgageInsuranceIgnored = (input: RentVsBuyInput) =>
  input.monthlyMi > 0 && input.homePrice > 0 && Number.isFinite(input.downPayment) && !mortgageInsuranceApplies(input);

/**
 * Which path comes out ahead at the end of the stay, and by how much. It reports the sum on the
 * numbers entered and never says what the visitor ought to do.
 */
export function headlineText(r: Pick<RentVsBuyResult, "ahead" | "difference">): string {
  if (r.ahead === "even") return "The two come out even";
  const gap = Math.abs(r.difference);
  // A gap of a few cents is still a gap: do not print it as "$0".
  const amount = Math.round(gap) === 0 ? "less than $1" : formatUSD(gap);
  return `${r.ahead === "buying" ? "Buying" : "Renting"} comes out ahead by ${amount}`;
}

/**
 * The year buying first comes out ahead, worded so it cannot contradict the headline: within the
 * stay, from the start, only after the stay, never within MAX_YEARS, ahead early and not at the
 * end, or ahead at the end but not in every year since it first was.
 */
export function pullAheadSentence(r: Pick<RentVsBuyResult, "ahead" | "pullAheadYear" | "years">, stayYears: number): string {
  const year = r.pullAheadYear;
  if (year === null) return `Buying does not pull ahead within ${MAX_YEARS} years on these numbers.`;
  if (year > stayYears) return `Buying would pull ahead in year ${year}, after the ${yearsText(stayYears)} you plan to stay.`;
  if (r.ahead === "renting") return `Buying is ahead in year ${year} but is behind again by year ${stayYears}.`;
  if (r.ahead === "even") return `Buying is ahead in year ${year} but the two are even by year ${stayYears}.`;
  if (buyingSlipsBack(r.years)) return `Buying is first ahead in year ${year}, but not in every year after.`;
  return year === 1 ? "Buying is ahead from the first year." : `Buying pulls ahead in year ${year}.`;
}

/**
 * Every assumption behind the estimate, as the math used it, for the printed page (on screen the
 * fields under "Add detail" are the list; the form does not print). Built from the model's input,
 * not from the form, so the list cannot drift from the result. It is only shown with a result, so
 * the closing costs and the three yearly costs have all been entered: a typed 0, or a negative
 * amount the math counts as zero, reads "$0".
 */
export function assumptionLines(input: RentVsBuyInput): string[] {
  const inflation = percentText(COST_INFLATION);
  const cost = (label: string, yearly: number, rising: string) =>
    yearly > 0 ? `${label}: ${usd(yearly)} a year, ${rising}` : `${label}: $0 a year`;
  const yearly = (rises: string, falls: string, rate: number) => `${rate < 0 ? falls : rises} ${percentText(Math.abs(rate))} a year`;
  const mortgageInsurance = !(input.monthlyMi > 0)
    ? "none"
    : mortgageInsuranceApplies(input)
      ? `${usd(input.monthlyMi)} a month until the loan balance reaches 78% of the home price`
      : "not counted, the down payment is 20% or more";
  return [
    `Loan term: ${yearsText(Number((input.termMonths / 12).toFixed(1)))}`,
    `Closing costs on the purchase: ${input.closingCosts > 0 ? usd(input.closingCosts) : "$0"}`,
    cost("Property tax", input.yearlyTax, "rising with the home's value"),
    cost("Homeowners insurance", input.yearlyInsurance, `rising ${inflation} a year`),
    `Mortgage insurance: ${mortgageInsurance}`,
    `HOA dues: ${input.monthlyHoa > 0 ? `${usd(input.monthlyHoa)} a month, rising ${inflation} a year` : "none"}`,
    cost("Maintenance", input.yearlyMaintenance, `rising ${inflation} a year`),
    yearly("Home value rises", "Home value falls", input.appreciation),
    yearly("Rent rises", "Rent falls", input.rentIncrease),
    `Selling costs: ${percentText(input.sellingCosts)} of the sale price`,
    `${yearly("The down payment would earn", "The down payment would lose", input.investmentReturn)} if invested instead`,
    ...(input.incomeTaxRate > 0 ? [`Income tax rate for the interest deduction: ${percentText(input.incomeTaxRate)}`] : []),
    NOT_INCLUDED,
  ];
}

/** The assumptions list of the printed page. */
export function Assumptions({ input }: { input: RentVsBuyInput }) {
  return (
    <div className="mt-4">
      <h2 className="text-[13px] font-bold">Assumptions in this estimate</h2>
      <ul className="m-0 mt-1 list-disc pl-5 text-[11px]">
        {assumptionLines(input).map((line) => <li key={line}>{line}</li>)}
      </ul>
    </div>
  );
}

/** What the monthly payment to own is made of, in words: the line under the figure. */
export function paymentPartsText(firstMonth: RentVsBuyResult["firstMonth"]): string {
  return `principal, interest, tax and insurance${firstMonth.mi > 0 ? ", mortgage insurance" : ""}${firstMonth.hoa > 0 ? ", HOA dues" : ""}`;
}

const box = "rounded-xl border border-line bg-white p-5 shadow-card max-[600px]:p-4";
const row = "flex items-baseline justify-between gap-4 border-b border-line py-1.5";
const total = "flex items-baseline justify-between gap-4 pt-2 text-[16px] font-extrabold";
const amount = "m-0 whitespace-nowrap font-semibold tabular-nums";

function Line({ label, value }: { label: string; value: number }) {
  return (
    <div className={row}>
      <dt>{label}</dt>
      <dd className={amount}>{usd(value)}</dd>
    </div>
  );
}

/**
 * The results column of the Rent vs buy calculator. `result` is null until the model has all it
 * needs; until then one sentence says what is missing or out of range. The assumptions are not
 * listed here: on screen they are the fields under "Add detail", and the printed page lists them.
 */
export function RentVsBuyResults({ input, result: r, disclaimer }: {
  input: RentVsBuyInput;
  result: RentVsBuyResult | null;
  disclaimer: string;
}) {
  if (!r) {
    return (
      <div role="status" className="rounded-xl border border-line bg-white p-6 text-[16px] text-muted shadow-card">
        {promptText(input)}
      </div>
    );
  }

  const stay = input.stayYears;
  const { buying, renting } = r;
  // A line that is taken off flips to a line that is added when its figure is negative, so no
  // label ever sits beside a figure with the wrong sign.
  const shortfall = Math.round(buying.equity) < 0;
  const loss = Math.round(renting.downPaymentGrowth) < 0;
  const { firstMonth } = r;
  const taxSaving = input.incomeTaxRate > 0;

  return (
    <>
      <div className="rounded-xl bg-green-800 p-6 text-on-dark shadow-card">
        <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-mint">Estimated difference after {yearsText(stay)}</p>
        <p aria-live="polite" className="mt-1 text-[clamp(26px,3.2vw,36px)] font-extrabold leading-[1.1] tracking-[-0.02em] tabular-nums text-white">{headlineText(r)}</p>
        <p className="mt-1.5 text-[16px] text-on-dark-2">on these numbers, counting what is paid and what is left at the end</p>
      </div>

      <p className="mx-1 text-[16px] font-semibold text-ink">{pullAheadSentence(r, stay)}</p>

      <div className={cn("grid gap-3 max-[600px]:grid-cols-1", stay > 1 ? "grid-cols-3" : "grid-cols-2")}>
        <Stat
          label="Monthly rent now"
          value={formatUSD(input.monthlyRent)}
          sub="in the first year"
          tip="The rent you entered. It changes each year by the rent assumption under Add detail."
        />
        <Stat
          label="Monthly payment to own"
          value={usd(firstMonth.total)}
          sub={paymentPartsText(firstMonth)}
          tip={`What owning costs each month in the first year, with a fixed-rate loan of ${formatUSD(r.loanAmount)}. The parts are listed below. Maintenance is not in it.`}
        />
        {stay > 1 && (
          <Stat
            label={`Rent in year ${stay}`}
            value={formatUSD(renting.lastMonthlyRent)}
            sub="per month"
            tip="The monthly rent in the last year of the stay, after each year's change in rent."
          />
        )}
      </div>

      <div className={box}>
        <h2 className="text-[17px] font-bold">What is in the monthly payment to own</h2>
        <dl className="m-0 mt-2 text-[14px]">
          <Line label="Principal and interest" value={firstMonth.principalAndInterest} />
          <Line label="Property tax" value={firstMonth.tax} />
          <Line label="Homeowners insurance" value={firstMonth.insurance} />
          {firstMonth.mi > 0 && <Line label="Mortgage insurance" value={firstMonth.mi} />}
          {firstMonth.hoa > 0 && <Line label="HOA dues" value={firstMonth.hoa} />}
          <div className={total}>
            <dt>Monthly payment to own</dt>
            <dd className="m-0 whitespace-nowrap tabular-nums">{usd(firstMonth.total)}</dd>
          </div>
        </dl>
        <p className="mt-3 text-[13px] text-muted">
          {taxSaving ? "Maintenance and the tax saving are" : "Maintenance is"} counted in the totals below, not in this payment.
        </p>
      </div>

      {stay > 1 && (
        <div>
          <SeriesChart
            kind="lines"
            title="Net cost of each path"
            series={[
              { label: "Buying", data: r.years.map((y) => y.netCostBuying) },
              { label: "Renting", data: r.years.map((y) => y.netCostRenting) },
            ]}
          />
          <p className="mx-1 mt-2 text-[13px] text-muted">What each path has cost if you stopped at the end of that year. Lower is better.</p>
        </div>
      )}

      <div className="grid grid-cols-2 items-start gap-4 max-[600px]:grid-cols-1">
        <div className={box}>
          <h2 className="text-[17px] font-bold">Buying</h2>
          <dl className="m-0 mt-2 text-[14px]">
            <Line label="Down payment" value={buying.downPayment} />
            <Line label="Closing costs" value={buying.closingCosts} />
            <Line label="Mortgage payments" value={buying.mortgagePayments} />
            <Line label="Property tax" value={buying.propertyTax} />
            <Line label="Homeowners insurance" value={buying.insurance} />
            {buying.mortgageInsurance > 0 && <Line label="Mortgage insurance" value={buying.mortgageInsurance} />}
            {buying.hoa > 0 && <Line label="HOA dues" value={buying.hoa} />}
            <Line label="Maintenance" value={buying.maintenance} />
            <div className={cn(row, "font-bold")}>
              <dt>Total paid</dt>
              <dd className={amount}>{usd(buying.totalPaid)}</dd>
            </div>
            {taxSaving && <Line label="Income tax saved on mortgage interest" value={-buying.taxSavedOnInterest} />}
            {shortfall
              ? <Line label="Shortfall after selling, added" value={-buying.equity} />
              : <Line label="Equity after selling" value={-buying.equity} />}
            <div className={total}>
              <dt>Net cost of buying</dt>
              <dd className="m-0 whitespace-nowrap tabular-nums">{usd(buying.netCost)}</dd>
            </div>
          </dl>
          {taxSaving && <p className="mt-3 text-[13px] text-ink">{TAX_NOTE}</p>}
        </div>
        <div className={box}>
          <h2 className="text-[17px] font-bold">Renting</h2>
          <dl className="m-0 mt-2 text-[14px]">
            <Line label="Rent paid" value={renting.rentPaid} />
            {loss
              ? <Line label="Loss on the down payment, added" value={-renting.downPaymentGrowth} />
              : <Line label="Growth on the down payment, invested" value={-renting.downPaymentGrowth} />}
            <div className={total}>
              <dt>Net cost of renting</dt>
              <dd className="m-0 whitespace-nowrap tabular-nums">{usd(renting.netCost)}</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className={box}>
        <h2 className="text-[17px] font-bold">What the buyer ends up owning</h2>
        <dl className="m-0 mt-2 text-[14px]">
          <Line label={`Home value after ${yearsText(stay)}`} value={buying.homeValue} />
          <Line label="Loan balance" value={-buying.loanBalance} />
          <Line label="Selling costs" value={-buying.sellingCosts} />
          <div className={total}>
            <dt>Equity after selling</dt>
            <dd className="m-0 whitespace-nowrap tabular-nums">{usd(buying.equity)}</dd>
          </div>
        </dl>
        {buying.equity < 0 && (
          <p className="mt-3 text-[14px] font-semibold text-ink">{UNDERWATER_NOTE}</p>
        )}
      </div>

      {mortgageInsuranceMissing(input) && <p className="mx-1 text-[14px] font-semibold text-ink">{MORTGAGE_INSURANCE_NOTE}</p>}
      <p className="mx-1 text-[14px] text-ink">{CAUTION}</p>
      <p className="mx-1 text-[13px] text-muted">{disclaimer}</p>
    </>
  );
}
