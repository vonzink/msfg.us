import { formatUSD, formatUSDCents } from "@/lib/finance";
import { PrintSummary as Summary, type PrintColumn } from "../shared/PrintSummary";
import type { Scenario } from "./fields";
import type { MortgageInput, MortgageResult } from "./math";
import { duration, MONTHS } from "./dates";
import { NOT_A_LENDING_AMOUNT } from "./Results";

const trim = (x: number, places: number) => String(Number(x.toFixed(places)));
const EXTRA = { monthly: "every month", annually: "once a year", "one-time": "with the first payment" } as const;
type Rows = PrintColumn["rows"];

/**
 * The top of the Mortgage calculator's printed page. The amortization schedule prints under it.
 * A purchase states the price and the down payment; a refinance the loan amount and, when one was
 * entered, the home value; payment mode leads with the payment typed and the loan amount it pays
 * off, has tax and insurance rows only once something is counted on top of the payment, and
 * repeats that the amount is not a lending amount.
 */
export function PrintSummary({ input, result: r, start, scenario = { mode: "purchase" } }: {
  input: MortgageInput;
  result: MortgageResult;
  start: { month: number; year: number } | null;
  scenario?: Scenario;
}) {
  const payment = scenario.mode === "payment";
  // Payment mode shows the cost rows only when one of them is counted.
  const costs = !payment || r.first.total > r.first.principalAndInterest;
  const downPct = (input.downPayment / input.homePrice) * 100;
  const borrowed: Rows =
    scenario.mode === "payment"
      ? [
          { label: "Monthly payment (principal and interest)", value: formatUSDCents(scenario.payment) },
          { label: "Down payment", value: `${trim(scenario.downPct, 3)}%` },
        ]
      : scenario.mode === "refinance"
        ? [
            { label: "Loan amount", value: formatUSD(r.loanAmount) },
            ...(scenario.homeValueKnown ? [{ label: "Home value", value: formatUSD(input.homePrice) }] : []),
          ]
        : [
            { label: "Home price", value: formatUSD(input.homePrice) },
            { label: "Down payment", value: `${formatUSD(input.downPayment)} (${trim(downPct, 2)}%)` },
            { label: "Loan amount", value: formatUSD(r.loanAmount) },
          ];
  const loan: Rows = [
    ...borrowed,
    { label: "Interest rate", value: `${trim(input.annualRate * 100, 3)}%` },
    { label: "Loan term", value: duration(input.termYears * 12) },
    ...(start ? [{ label: "First payment", value: `${MONTHS[start.month]} ${start.year}` }] : []),
    ...(costs
      ? [
          { label: "Property tax", value: `${formatUSD(r.first.tax * 12)} a year` },
          { label: "Homeowners insurance", value: `${formatUSD(r.first.insurance * 12)} a year` },
        ]
      : []),
    ...(r.first.hoa > 0 ? [{ label: "HOA dues", value: `${formatUSD(r.first.hoa)} a month` }] : []),
    ...(r.first.pmi > 0 ? [{ label: "Mortgage insurance", value: `${formatUSD(r.first.pmi)} a month, until payment ${r.pmiEndPayment}` }] : []),
    ...(r.extra.amount > 0 ? [{ label: "Extra principal", value: `${formatUSD(r.extra.amount)} ${EXTRA[r.extra.frequency]}` }] : []),
  ];
  const estimate: Rows = [
    ...(payment
      ? [
          { label: "Estimated loan amount", value: formatUSD(r.loanAmount) },
          { label: "Home price", value: formatUSD(input.homePrice) },
        ]
      : []),
    ...(costs
      ? [
          { label: payment ? "Full monthly payment" : "Monthly payment", value: formatUSD(r.first.total) },
          // In payment mode principal and interest is the payment typed, in the other column.
          ...(payment ? [] : [{ label: "Principal and interest", value: formatUSD(r.first.principalAndInterest) }]),
          { label: "Property tax (monthly)", value: formatUSD(r.first.tax) },
          { label: "Homeowners insurance (monthly)", value: formatUSD(r.first.insurance) },
        ]
      : []),
    ...(r.first.hoa > 0 ? [{ label: "HOA dues (monthly)", value: formatUSD(r.first.hoa) }] : []),
    ...(r.first.pmi > 0 ? [{ label: "Mortgage insurance (monthly)", value: formatUSD(r.first.pmi) }] : []),
    { label: "Total interest", value: formatUSD(r.totalInterest) },
    { label: "Total of all payments", value: formatUSD(r.totalCost) },
    { label: "Paid off", value: start ? `${MONTHS[r.payoff.month]} ${r.payoff.year}` : `after ${duration(r.schedule.length)}` },
    ...(r.extra.amount > 0 ? [{ label: "Saved by the extra principal", value: `${formatUSD(r.interestSaved)} and ${duration(r.monthsSaved)}` }] : []),
  ];
  return (
    <>
      <Summary title={payment ? "Loan amount estimate" : "Mortgage payment estimate"} columns={[{ heading: "The loan", rows: loan }, { heading: "The estimate", rows: estimate }]} />
      {payment && <p className="mt-2 hidden text-[12px] font-semibold print:block">{NOT_A_LENDING_AMOUNT}</p>}
    </>
  );
}
