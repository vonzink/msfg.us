import { formatUSD } from "@/lib/finance";
import { PrintSummary, type PrintColumn } from "../shared/PrintSummary";
import { MAX_YEARS, type RentVsBuyInput, type RentVsBuyResult } from "./math";
import { Assumptions, CAUTION, headlineText, lowDownPayment, MORTGAGE_INSURANCE_NOTE, percentText, pullAheadSentence, UNDERWATER_NOTE, usd, yearsText } from "./Results";

type Rows = PrintColumn["rows"];

/** The top of the Rent vs buy calculator's printed page: what was entered beside the estimate. */
export function RentVsBuyPrintSummary({ input, result: r }: { input: RentVsBuyInput; result: RentVsBuyResult }) {
  const numbers: Rows = [
    { label: "Monthly rent", value: formatUSD(input.monthlyRent) },
    { label: "Home price", value: formatUSD(input.homePrice) },
    { label: "Down payment", value: `${formatUSD(input.downPayment)} (${percentText(input.downPayment / input.homePrice)})` },
    { label: "Interest rate", value: percentText(input.rate) },
    { label: "Years you plan to stay", value: String(input.stayYears) },
    { label: "Mortgage payment", value: formatUSD(r.monthlyPayment) },
  ];
  const estimate: Rows = [
    { label: `After ${yearsText(input.stayYears)}`, value: headlineText(r) },
    { label: "Buying first comes out ahead", value: r.pullAheadYear === null ? `Not within ${MAX_YEARS} years` : `Year ${r.pullAheadYear}` },
    { label: "Net cost of buying", value: usd(r.buying.netCost) },
    { label: "Net cost of renting", value: usd(r.renting.netCost) },
    { label: "Equity after selling", value: usd(r.buying.equity) },
  ];
  return <PrintSummary title="Rent vs buy estimate" columns={[{ heading: "The numbers", rows: numbers }, { heading: "The estimate", rows: estimate }]} />;
}

/**
 * The rest of the printed page, under the summary: the pull-ahead sentence, a line when the sale
 * would not cover the loan, the assumptions, the caution and the disclaimer. Hidden on screen.
 */
export function RentVsBuyPrintDetails({ input, result, disclaimer }: { input: RentVsBuyInput; result: RentVsBuyResult; disclaimer: string }) {
  return (
    <div className="mt-4 hidden print:block">
      <p className="text-[12px] font-semibold">{pullAheadSentence(result, input.stayYears)}</p>
      {result.buying.equity < 0 && <p className="mt-2 text-[12px] font-semibold">{UNDERWATER_NOTE}</p>}
      <Assumptions input={input} print />
      {lowDownPayment(input) && <p className="mt-3 text-[12px] font-semibold">{MORTGAGE_INSURANCE_NOTE}</p>}
      <p className="mt-3 text-[12px]">{CAUTION}</p>
      <p className="mt-2 text-[10px] text-muted">{disclaimer}</p>
    </div>
  );
}
