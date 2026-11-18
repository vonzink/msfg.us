import { formatUSD } from "@/lib/finance";
import { cn } from "@/lib/cn";
import { SeriesChart } from "../shared/Charts";
import { Stat } from "../shared/Stat";
import { COST_INFLATION, MAX_YEARS, type RentVsBuyInput, type RentVsBuyResult } from "./math";

export const CAUTION =
  "A comparison like this turns on its assumptions. Home values and rents do not rise at a steady rate, and small changes above can move the result.";
export const MORTGAGE_INSURANCE_NOTE =
  "With less than 20% down, most loans add mortgage insurance. It is not included here and would raise the cost of buying.";
const NOT_INCLUDED = "Not included: mortgage insurance, closing costs on the purchase, HOA dues, renters insurance and income taxes.";

/** "7 years", "1 year". */
export const yearsText = (n: number) => `${n} year${n === 1 ? "" : "s"}`;
/** A decimal rate as a percent: 0.045 is "4.5%". */
export const percentText = (rate: number) => `${Number((rate * 100).toFixed(3))}%`;

/** True when the down payment is under 20% of the price, where most loans add mortgage insurance. */
export const lowDownPayment = (input: RentVsBuyInput) => input.downPayment < input.homePrice * 0.2;

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
 * stay, from the start, only after the stay, never within MAX_YEARS, or ahead early and not at
 * the end.
 */
export function pullAheadSentence(r: Pick<RentVsBuyResult, "ahead" | "pullAheadYear">, stayYears: number): string {
  const year = r.pullAheadYear;
  if (year === null) return `Buying does not pull ahead within ${MAX_YEARS} years on these numbers.`;
  if (year > stayYears) return `Buying would pull ahead in year ${year}, after the ${yearsText(stayYears)} you plan to stay.`;
  if (r.ahead === "renting") return `Buying is ahead in year ${year} but is behind again by year ${stayYears}.`;
  if (r.ahead === "even") return `Buying is ahead in year ${year} but the two are even by year ${stayYears}.`;
  return year === 1 ? "Buying is ahead from the first year." : `Buying pulls ahead in year ${year}.`;
}

/**
 * Every assumption behind the estimate, as the math used it. Built from the model's input, not
 * from the form, so the list cannot drift from the result: an empty or junk yearly cost counts as
 * zero in the math and reads "none entered" here.
 */
export function assumptionLines(input: RentVsBuyInput): string[] {
  const inflation = percentText(COST_INFLATION);
  const cost = (label: string, yearly: number, rising: string) =>
    Number.isFinite(yearly) && yearly > 0 ? `${label}: ${formatUSD(yearly)} a year, ${rising}` : `${label}: none entered`;
  const yearly = (rises: string, falls: string, rate: number) => `${rate < 0 ? falls : rises} ${percentText(Math.abs(rate))} a year`;
  return [
    `Loan term: ${yearsText(Number((input.termMonths / 12).toFixed(1)))}`,
    cost("Property tax", input.yearlyTax, "rising with the home's value"),
    cost("Homeowners insurance", input.yearlyInsurance, `rising ${inflation} a year`),
    cost("Maintenance", input.yearlyMaintenance, `rising ${inflation} a year`),
    yearly("Home value rises", "Home value falls", input.appreciation),
    yearly("Rent rises", "Rent falls", input.rentIncrease),
    `Selling costs: ${percentText(input.sellingCosts)} of the sale price`,
    `${yearly("The down payment would earn", "The down payment would lose", input.investmentReturn)} if invested instead`,
    NOT_INCLUDED,
  ];
}

/** The assumptions list, the same on screen and on the printed page. */
export function Assumptions({ input, print = false }: { input: RentVsBuyInput; print?: boolean }) {
  return (
    <div className={print ? "mt-4" : "rounded-xl border border-line bg-white p-5 shadow-card max-[600px]:p-4"}>
      <h2 className={print ? "text-[13px] font-bold" : "text-[17px] font-bold"}>Assumptions in this estimate</h2>
      <ul className={cn("m-0 list-disc pl-5", print ? "mt-1 text-[11px]" : "mt-3 grid gap-1 text-[15px]")}>
        {assumptionLines(input).map((line) => <li key={line}>{line}</li>)}
      </ul>
      {!print && <p className="mt-3 text-[13px] text-muted">Change these under Add detail.</p>}
    </div>
  );
}

const box = "rounded-xl border border-line bg-white p-5 shadow-card max-[600px]:p-4";
const row = "flex items-baseline justify-between gap-4 border-b border-line py-1.5";
const total = "flex items-baseline justify-between gap-4 pt-2 text-[16px] font-extrabold";
const amount = "m-0 whitespace-nowrap font-semibold tabular-nums";

function Line({ label, value }: { label: string; value: number }) {
  return (
    <div className={row}>
      <dt>{label}</dt>
      <dd className={amount}>{formatUSD(value)}</dd>
    </div>
  );
}

/**
 * The results column of the Rent vs buy calculator. `result` is null until there is a rent, a
 * price, a rate and a stay the model can use. The assumptions are always listed here, outside the
 * "Add detail" panel, so nobody reads the headline without them.
 */
export function RentVsBuyResults({ input, result: r, disclaimer }: {
  input: RentVsBuyInput;
  result: RentVsBuyResult | null;
  disclaimer: string;
}) {
  if (!r) {
    const downAbovePrice = input.homePrice > 0 && input.downPayment > input.homePrice;
    return (
      <div role="status" className="rounded-xl border border-line bg-white p-6 text-[16px] text-muted shadow-card">
        {downAbovePrice
          ? "The down payment is more than the home price."
          : "Enter the rent, the home price, the down payment, the interest rate and how long you plan to stay to see the comparison."}
      </div>
    );
  }

  const stay = input.stayYears;
  const { buying, renting } = r;

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
          tip="The rent you entered. It changes each year by the rent assumption listed below."
        />
        <Stat
          label="Mortgage payment"
          value={formatUSD(r.monthlyPayment)}
          sub="principal and interest"
          tip={`The monthly payment on a fixed-rate loan of ${formatUSD(r.loanAmount)}. Property tax, homeowners insurance and maintenance are counted separately below.`}
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
            <Line label="Mortgage payments" value={buying.mortgagePayments} />
            <Line label="Property tax" value={buying.propertyTax} />
            <Line label="Homeowners insurance" value={buying.insurance} />
            <Line label="Maintenance" value={buying.maintenance} />
            <div className={cn(row, "font-bold")}>
              <dt>Total paid</dt>
              <dd className={amount}>{formatUSD(buying.totalPaid)}</dd>
            </div>
            <Line label="Equity after selling" value={-buying.equity} />
            <div className={total}>
              <dt>Net cost of buying</dt>
              <dd className="m-0 whitespace-nowrap tabular-nums">{formatUSD(buying.netCost)}</dd>
            </div>
          </dl>
        </div>
        <div className={box}>
          <h2 className="text-[17px] font-bold">Renting</h2>
          <dl className="m-0 mt-2 text-[14px]">
            <Line label="Rent paid" value={renting.rentPaid} />
            <Line label="Growth on the down payment, invested" value={-renting.downPaymentGrowth} />
            <div className={total}>
              <dt>Net cost of renting</dt>
              <dd className="m-0 whitespace-nowrap tabular-nums">{formatUSD(renting.netCost)}</dd>
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
            <dd className="m-0 whitespace-nowrap tabular-nums">{formatUSD(buying.equity)}</dd>
          </div>
        </dl>
        {buying.equity < 0 && (
          <p className="mt-3 text-[14px] font-semibold text-ink">On these numbers the sale would not cover the loan and the selling costs.</p>
        )}
      </div>

      <Assumptions input={input} />

      {lowDownPayment(input) && <p className="mx-1 text-[14px] font-semibold text-ink">{MORTGAGE_INSURANCE_NOTE}</p>}
      <p className="mx-1 text-[14px] text-ink">{CAUTION}</p>
      <p className="mx-1 text-[13px] text-muted">{disclaimer}</p>
    </>
  );
}
