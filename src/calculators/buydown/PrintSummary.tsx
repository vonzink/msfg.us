import { formatUSD } from "@/lib/finance";
import { PrintSummary, type PrintColumn } from "../shared/PrintSummary";
import type { BuydownInput, BuydownResult } from "./math";

const percent = (rate: number) => `${Number((rate * 100).toFixed(3))}%`;
type Rows = PrintColumn["rows"];

/** The top of the Rate buydown calculator's printed page. The payment table prints under it. */
export function BuydownPrintSummary({ input, result: r }: { input: BuydownInput; result: BuydownResult }) {
  const extras = r.full.total - r.full.principalAndInterest;
  const loan: Rows = [
    { label: "Loan amount", value: formatUSD(input.loanAmount) },
    { label: "Interest rate", value: percent(input.annualRate) },
    { label: "Loan term", value: `${input.termYears} years` },
    { label: "Buydown type", value: input.type },
    ...(extras > 0 ? [{ label: "Tax, insurance and HOA", value: `${formatUSD(extras)} a month` }] : []),
  ];
  const estimate: Rows = [
    { label: "Buydown cost", value: formatUSD(r.totalCost) },
    ...r.periods.filter((p) => p.reduced).map((p) => ({ label: `Year ${p.year} payment`, value: `${formatUSD(p.total)} at ${percent(p.rate)}` })),
    { label: `Payment from year ${r.full.year}`, value: `${formatUSD(r.full.total)} at ${percent(r.full.rate)}` },
  ];
  return <PrintSummary title="Rate buydown estimate" columns={[{ heading: "The loan", rows: loan }, { heading: "The estimate", rows: estimate }]} />;
}
