import { formatUSD } from "@/lib/finance";
import { PrintSummary, type PrintColumn } from "../shared/PrintSummary";
import type { BreakevenInput, BreakevenResult } from "./math";
import { breakevenText, yearsText } from "./Results";

const percent = (rate: number) => `${Number((rate * 100).toFixed(3))}%`;
type Rows = PrintColumn["rows"];

/** The top of the Refinance breakeven calculator's printed page: the two loans beside the estimate. */
export function BreakevenPrintSummary({ input, result: r }: { input: BreakevenInput; result: BreakevenResult }) {
  const loans: Rows = [
    { label: "Loan balance", value: formatUSD(input.currentBalance) },
    { label: "Current rate", value: percent(input.currentRate) },
    { label: "Time left", value: yearsText(input.monthsLeft) },
    { label: "Payment now", value: formatUSD(r.current.payment) },
    { label: "New loan amount", value: formatUSD(r.newLoanAmount) },
    { label: "New rate", value: percent(input.newRate) },
    { label: "New term", value: yearsText(input.newTermMonths) },
    { label: "New payment", value: formatUSD(r.next.payment) },
    { label: "Closing costs", value: formatUSD(r.closingCosts) },
    ...(r.cashOut > 0 ? [{ label: "Cash out", value: formatUSD(r.cashOut) }] : []),
  ];
  const estimate: Rows = [
    { label: "Breakeven", value: breakevenText(r) },
    { label: "Monthly savings", value: formatUSD(r.monthlySavings) },
    { label: "Interest left on the loan now", value: formatUSD(r.current.interestRemaining) },
    { label: "Interest on the new loan", value: formatUSD(r.next.interestTotal) },
    ...(r.keep
      ? [
          { label: `Net savings over ${yearsText(r.keep.months)}`, value: formatUSD(r.keep.netSavings) },
          { label: `Owed on the loan now after ${yearsText(r.keep.months)}`, value: formatUSD(r.keep.balanceNowLoan) },
          { label: `Owed on the new loan after ${yearsText(r.keep.months)}`, value: formatUSD(r.keep.balanceNewLoan) },
          { label: `Overall position after ${yearsText(r.keep.months)}`, value: `${formatUSD(Math.abs(r.keep.netPosition))} ${r.keep.netPosition >= 0 ? "ahead" : "behind"}` },
        ]
      : []),
  ];
  return <PrintSummary title="Refinance breakeven estimate" columns={[{ heading: "The loans", rows: loans }, { heading: "The estimate", rows: estimate }]} />;
}
