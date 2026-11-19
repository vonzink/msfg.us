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
 * entered, the home value; payment mode leads with the whole payment typed, the costs that come
 * off it and the principal and interest left, then the loan amount and the home price worked out,
 * and repeats that the amount is not a lending amount.
 */
export function PrintSummary({ input, result: r, start, scenario = { mode: "purchase" } }: {
  input: MortgageInput;
  result: MortgageResult;
  start: { month: number; year: number } | null;
  scenario?: Scenario;
}) {
  const payment = scenario.mode === "payment";
  // Payment mode shows a cost only when it is counted.
  const costs = !payment || r.first.total > r.first.principalAndInterest;
  const downPct = (input.downPayment / input.homePrice) * 100;
  const taxRow: Rows = [{ label: "Property tax", value: `${formatUSD(r.first.tax * 12)} a year` }];
  const insuranceRow: Rows = [{ label: "Homeowners insurance", value: `${formatUSD(r.first.insurance * 12)} a year` }];
  const hoaRow: Rows = r.first.hoa > 0 ? [{ label: "HOA dues", value: `${formatUSD(r.first.hoa)} a month` }] : [];
  const pmiRow: Rows = r.first.pmi > 0 ? [{ label: "Mortgage insurance", value: `${formatUSD(r.first.pmi)} a month, until payment ${r.pmiEndPayment}` }] : [];
  const extraRow: Rows = r.extra.amount > 0 ? [{ label: "Extra principal", value: `${formatUSD(r.extra.amount)} ${EXTRA[r.extra.frequency]}` }] : [];
  const terms: Rows = [
    { label: "Interest rate", value: `${trim(input.annualRate * 100, 3)}%` },
    { label: "Loan term", value: duration(input.termYears * 12) },
    ...(start ? [{ label: "First payment", value: `${MONTHS[start.month]} ${start.year}` }] : []),
  ];
  const loan: Rows =
    scenario.mode === "payment"
      ? [
          // The whole payment, what comes off it, and what is left to pay off the loan.
          { label: "Monthly payment", value: formatUSDCents(scenario.payment) },
          ...(r.first.tax > 0 ? taxRow : []),
          ...(r.first.insurance > 0 ? insuranceRow : []),
          ...hoaRow,
          ...pmiRow,
          { label: "Principal and interest", value: formatUSDCents(scenario.principalAndInterest) },
          { label: "Down payment", value: `${trim(scenario.downPct, 3)}%` },
          ...terms,
          ...extraRow,
        ]
      : [
          ...(scenario.mode === "refinance"
            ? [
                { label: "Loan amount", value: formatUSD(r.loanAmount) },
                ...(scenario.homeValueKnown ? [{ label: "Home value", value: formatUSD(input.homePrice) }] : []),
              ]
            : [
                { label: "Home price", value: formatUSD(input.homePrice) },
                { label: "Down payment", value: `${formatUSD(input.downPayment)} (${trim(downPct, 2)}%)` },
                { label: "Loan amount", value: formatUSD(r.loanAmount) },
              ]),
          ...terms,
          ...taxRow,
          ...insuranceRow,
          ...hoaRow,
          ...pmiRow,
          ...extraRow,
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
          // In payment mode the payment and the principal and interest left are in the other column.
          ...(payment
            ? []
            : [
                { label: "Monthly payment", value: formatUSD(r.first.total) },
                { label: "Principal and interest", value: formatUSD(r.first.principalAndInterest) },
              ]),
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
