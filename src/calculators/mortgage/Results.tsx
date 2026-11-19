import { formatUSD, formatUSDCents } from "@/lib/finance";
import { SeriesChart } from "../shared/Charts";
import { Stat } from "../shared/Stat";
import type { InputFault, Scenario } from "./fields";
import type { MortgageResult } from "./math";
import { duration, MONTHS } from "./dates";
import { PaymentBreakdown } from "./PaymentBreakdown";

/** Payment mode says this straight under its headline, and again in print. */
export const NOT_A_LENDING_AMOUNT = "This is arithmetic on the payment entered. It is not the amount a lender would lend.";

const GENERAL_PROMPT = "Enter the numbers above to see the estimate.";

/**
 * What to say when there is no result: the box `inputFault` found, and what is wrong with it. The
 * ranges are the fault's own, so a message cannot drift from the check behind it.
 */
export function promptText(fault: InputFault | null): string {
  if (!fault) return GENERAL_PROMPT;
  const label = fault.field.label.toLowerCase();
  // The home value may be left empty in the modes that have it.
  const optional = fault.field.id === "homeValue";
  switch (fault.problem) {
    case "unreadable":
      return `Enter a number for ${label}${optional ? ", or leave it empty" : ""}.`;
    case "range":
      if (fault.field.id === "payment") return `Enter a payment under ${formatUSD(fault.max)}.`;
      return fault.field.id === "rate"
        ? `Enter an interest rate from ${fault.min}% to ${fault.max}%.`
        : `Enter a loan term from ${fault.min} to ${fault.max} years.`;
    case "not-below-price":
      return "Enter a down payment smaller than the home price.";
    case "too-small":
      return "Enter a larger monthly payment.";
    case "below-loan":
      return "The home value is below the loan amount.";
    case "not-positive":
      if (optional) return `${fault.field.label} must be above $0, or leave it empty.`;
      // A price or a loan amount of 0 is asked for like an empty one.
      return fault.field.id === "payment" ? "Enter a payment large enough to pay off a loan at this rate." : `Enter the ${label}.`;
    case "empty":
      return `Enter the ${label}.`;
  }
}

/** A rate as typed, without trailing zeros: 0.07 is "7%". */
const ratePercent = (rate: number) => `${Number((rate * 100).toFixed(3))}%`;

/**
 * The results column of the Mortgage calculator. The schedule sits below it at page width. `result` is null when the inputs do not make a
 * loan yet. `start` is null until the browser has supplied today's date, and until then the payoff
 * is given as a length of time instead of a calendar month.
 *
 * `scenario` is the mode. A purchase and a refinance lead with the monthly payment; payment mode
 * leads with the loan amount the typed payment pays off, and shows the full monthly payment under
 * it once tax, insurance, HOA dues or mortgage insurance is counted. `r.ltv` only means something
 * when there is a price or a home value behind it, so the mortgage insurance prompt is left out
 * otherwise.
 * `fault` is what `inputFault` found, for the prompt when there is no result.
 */
export function MortgageResults({ result: r, start, disclaimer, scenario = { mode: "purchase" }, fault = null }: {
  result: MortgageResult | null;
  start: { month: number; year: number } | null;
  disclaimer: string;
  scenario?: Scenario;
  fault?: InputFault | null;
}) {
  if (!r) {
    return (
      <div role="status" className="rounded-xl border border-line bg-white p-6 text-[16px] text-muted shadow-card">
        {promptText(fault)}
      </div>
    );
  }

  const { first } = r;
  const hasExtra = r.extra.amount > 0;
  const hasPmi = first.pmi > 0;
  const measured = scenario.mode === "purchase" || scenario.homeValueKnown;
  // Payment mode: what is counted on top of the principal and interest typed.
  const onTop = [first.tax > 0 && "tax", first.insurance > 0 && "insurance", first.hoa > 0 && "HOA dues", hasPmi && "mortgage insurance"].filter(Boolean);
  const needsPmiPrompt = measured && r.ltv > 80 && !hasPmi;
  const payoff = start ? `${MONTHS[r.payoff.month]} ${r.payoff.year}` : duration(r.schedule.length);

  return (
    <>
      <div className="rounded-xl bg-green-800 p-6 text-on-dark shadow-card print:border print:border-ink print:bg-transparent print:text-ink print:shadow-none">
        <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-mint print:text-muted">
          {scenario.mode === "payment" ? "Estimated loan amount" : "Estimated monthly payment"}
        </p>
        <p aria-live="polite" className="mt-1 text-[clamp(40px,5vw,58px)] font-extrabold leading-[1.05] tracking-[-0.02em] tabular-nums text-white print:text-ink">
          {formatUSD(scenario.mode === "payment" ? r.loanAmount : first.total)}
        </p>
        {scenario.mode === "payment" ? (
          <p className="mt-1.5 text-[16px] text-on-dark-2 print:text-ink">
            what <strong className="text-white print:text-ink">{formatUSDCents(scenario.payment)}</strong> a month of principal and
            interest pays off over {scenario.termYears} {scenario.termYears === 1 ? "year" : "years"} at {ratePercent(scenario.annualRate)}.
            {onTop.length === 0 && " Tax and insurance are not included."}
          </p>
        ) : (
          <p className="mt-1.5 text-[16px] text-on-dark-2 print:text-ink">
            <strong className="text-white print:text-ink">{formatUSD(first.principalAndInterest)}</strong> principal and
            interest on a {formatUSD(r.loanAmount)} loan.
          </p>
        )}
        {r.extra.amount > 0 && (
          <p className="mt-1.5 text-[14px] text-on-dark-2 print:text-ink">
            Plus {formatUSD(r.extra.amount)} extra principal{" "}
            {r.extra.frequency === "monthly"
              ? `every month, ${formatUSD(first.total + r.extra.amount)} in all.`
              : r.extra.frequency === "annually"
                ? "once a year."
                : "with the first payment."}
          </p>
        )}
        {hasPmi && (
          <p className="mt-1.5 text-[14px] text-on-dark-2 print:text-ink">
            Includes mortgage insurance until payment {r.pmiEndPayment}.
          </p>
        )}
        {needsPmiPrompt && (
          <p className="mt-1.5 text-[14px] text-on-dark-2 print:text-ink">
            {scenario.mode === "purchase" ? "With less than 20% down" : "With a loan above 80% of the home value"}, most conventional loans add mortgage insurance. Add it under Add detail.
          </p>
        )}
      </div>

      {scenario.mode === "payment" && <p className="mx-1 text-[15px] font-semibold text-ink">{NOT_A_LENDING_AMOUNT}</p>}
      {scenario.mode === "payment" && onTop.length > 0 && (
        <Stat
          label="Full monthly payment"
          value={formatUSD(first.total)}
          sub={["principal", "interest", ...onTop].join(", ")}
          tip="The payment entered plus the amounts entered under Add detail."
        />
      )}

      <PaymentBreakdown result={r} start={start} />

      <div className="grid grid-cols-2 gap-3 max-[600px]:grid-cols-1">
        <Stat
          label="Total interest"
          value={formatUSD(r.totalInterest)}
          sub={`over ${duration(r.schedule.length)}`}
          tip="All the interest paid from the first payment to the last, at the rate entered."
        />
        <Stat
          label="Paid off"
          value={payoff}
          sub={start ? `after ${duration(r.schedule.length)}` : "from the first payment"}
          tip="When the balance reaches zero if every payment is made as scheduled."
        />
        {hasExtra && (
          <>
            <Stat
              label="Interest saved"
              value={formatUSD(r.interestSaved)}
              sub="from the extra principal"
              tip="Interest you avoid by paying the extra principal, compared with the regular schedule."
            />
            <Stat
              label="Time saved"
              value={duration(r.monthsSaved)}
              sub="paid off sooner"
              tip="How much earlier the loan is paid off with the extra principal."
            />
          </>
        )}
      </div>

      {/* One year is one point, which is no chart. */}
      {r.years.length >= 2 && (
        <SeriesChart
          kind="lines"
          title="Loan balance at the end of each year"
          series={[{ label: "Balance", data: r.years.map((y) => y.endBalance) }]}
        />
      )}

      <p className="mx-1 text-[13px] text-muted">{disclaimer}</p>
    </>
  );
}
