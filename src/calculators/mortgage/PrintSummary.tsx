import { formatUSD } from "@/lib/finance";
import { PrintSummary as Summary, type PrintColumn } from "../shared/PrintSummary";
import type { MortgageInput, MortgageResult } from "./math";
import { duration, MONTHS } from "./dates";

const trim = (x: number, places: number) => String(Number(x.toFixed(places)));
const EXTRA = { monthly: "every month", annually: "once a year", "one-time": "with the first payment" } as const;
type Rows = PrintColumn["rows"];

/** The top of the Mortgage calculator's printed page. The amortization schedule prints under it. */
export function PrintSummary({ input, result: r, start }: {
  input: MortgageInput;
  result: MortgageResult;
  start: { month: number; year: number } | null;
}) {
  const downPct = (input.downPayment / input.homePrice) * 100;
  const loan: Rows = [
    { label: "Home price", value: formatUSD(input.homePrice) },
    { label: "Down payment", value: `${formatUSD(input.downPayment)} (${trim(downPct, 2)}%)` },
    { label: "Loan amount", value: formatUSD(r.loanAmount) },
    { label: "Interest rate", value: `${trim(input.annualRate * 100, 3)}%` },
    { label: "Loan term", value: duration(input.termYears * 12) },
    ...(start ? [{ label: "First payment", value: `${MONTHS[start.month]} ${start.year}` }] : []),
    { label: "Property tax", value: `${formatUSD(r.first.tax * 12)} a year` },
    { label: "Homeowners insurance", value: `${formatUSD(r.first.insurance * 12)} a year` },
    ...(r.first.hoa > 0 ? [{ label: "HOA dues", value: `${formatUSD(r.first.hoa)} a month` }] : []),
    ...(r.first.pmi > 0 ? [{ label: "Mortgage insurance", value: `${formatUSD(r.first.pmi)} a month, until payment ${r.pmiEndPayment}` }] : []),
    ...(r.extra.amount > 0 ? [{ label: "Extra principal", value: `${formatUSD(r.extra.amount)} ${EXTRA[r.extra.frequency]}` }] : []),
  ];
  const estimate: Rows = [
    { label: "Monthly payment", value: formatUSD(r.first.total) },
    { label: "Principal and interest", value: formatUSD(r.first.principalAndInterest) },
    { label: "Property tax (monthly)", value: formatUSD(r.first.tax) },
    { label: "Homeowners insurance (monthly)", value: formatUSD(r.first.insurance) },
    ...(r.first.hoa > 0 ? [{ label: "HOA dues (monthly)", value: formatUSD(r.first.hoa) }] : []),
    ...(r.first.pmi > 0 ? [{ label: "Mortgage insurance (monthly)", value: formatUSD(r.first.pmi) }] : []),
    { label: "Total interest", value: formatUSD(r.totalInterest) },
    { label: "Total of all payments", value: formatUSD(r.totalCost) },
    { label: "Paid off", value: start ? `${MONTHS[r.payoff.month]} ${r.payoff.year}` : `after ${duration(r.schedule.length)}` },
    ...(r.extra.amount > 0 ? [{ label: "Saved by the extra principal", value: `${formatUSD(r.interestSaved)} and ${duration(r.monthsSaved)}` }] : []),
  ];
  return <Summary title="Mortgage payment estimate" columns={[{ heading: "The loan", rows: loan }, { heading: "The estimate", rows: estimate }]} />;
}
