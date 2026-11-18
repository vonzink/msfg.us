import { formatUSD } from "@/lib/finance";
import { PrintSummary, type PrintColumn } from "../shared/PrintSummary";
import { MAX_YEARS, type RentVsBuyInput, type RentVsBuyResult } from "./math";
import { headlineText, percentText, yearsText } from "./Results";

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
    { label: "Net cost of buying", value: formatUSD(r.buying.netCost) },
    { label: "Net cost of renting", value: formatUSD(r.renting.netCost) },
    { label: "Equity after selling", value: formatUSD(r.buying.equity) },
  ];
  return <PrintSummary title="Rent vs buy estimate" columns={[{ heading: "The numbers", rows: numbers }, { heading: "The estimate", rows: estimate }]} />;
}
