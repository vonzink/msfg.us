import { formatUSD } from "@/lib/finance";
import { PrintSummary, type PrintColumn } from "../shared/PrintSummary";
import { DETAIL_FIELDS, FRONT_FIELDS } from "./fields";
import { MI_END_LTV, type AprInput, type AprResult } from "./math";
import {
  FeesCounted, gapLine, gapText, LOAN_ABOVE_VALUE, LOAN_ESTIMATE_LINE, loanAboveValue, MI_NOT_COUNTED, mortgageInsuranceNotCounted, mortgageInsuranceText, percentText, usd,
} from "./Results";

type Rows = PrintColumn["rows"];

const label = (id: string) => [...FRONT_FIELDS, ...DETAIL_FIELDS].find((f) => f.id === id)!.label;
/** The points as typed, without trailing zeros: 0.01 is "1%". */
const ASSUMES_LOAN = "Assumes a conventional fixed-rate loan.";
const ASSUMES_INSURANCE = `Mortgage insurance is counted until the balance reaches ${Number((MI_END_LTV * 100).toFixed(3))}% of the home value.`;
const pointsText = (points: number) => `${Number((points * 100).toFixed(3))}%`;

/** The top of the APR calculator's printed page: the loan as entered beside the estimate. Detail is listed when it is in use. */
export function AprPrintSummary({ input, result: r }: { input: AprInput; result: AprResult }) {
  const loan: Rows = [
    { label: label("loanAmount"), value: formatUSD(input.loanAmount) },
    { label: label("rate"), value: percentText(input.rate) },
    { label: label("termYears"), value: `${input.termMonths / 12} years` },
    { label: label("lenderFees"), value: usd(input.lenderFees) },
    ...(input.points > 0 ? [{ label: label("points"), value: pointsText(input.points) }] : []),
    ...(input.lenderCredit > 0 ? [{ label: label("lenderCredit"), value: usd(input.lenderCredit) }] : []),
    ...(input.monthlyMi > 0 ? [{ label: label("monthlyMi"), value: `${usd(input.monthlyMi)} a month` }] : []),
    ...(input.homeValue > 0 ? [{ label: label("homeValue"), value: usd(input.homeValue) }] : []),
  ];
  const estimate: Rows = [
    { label: "Estimated APR", value: percentText(r.apr) },
    { label: "Interest rate", value: percentText(input.rate) },
    { label: "Above the interest rate", value: Number(gapText(r)) === 0 ? "None" : `${gapText(r)} percentage points` },
    { label: "Monthly principal and interest", value: usd(r.principalAndInterest) },
    ...(r.miMonths > 0 ? [{ label: "Mortgage insurance counted", value: mortgageInsuranceText(input, r) }] : []),
    { label: "Amount financed", value: usd(r.amountFinanced) },
    { label: "Finance charge over the loan", value: usd(r.financeCharge) },
  ];
  return <PrintSummary title="APR estimate" columns={[{ heading: "The loan", rows: loan }, { heading: "The estimate", rows: estimate }]} />;
}

/**
 * The rest of the printed page, under the summary: the gap in words, the fees the APR counts line
 * by line, what the estimate assumes, the sentence on where the official APR is, and the
 * disclaimer. Hidden on screen.
 */
export function AprPrintDetails({ input, result, disclaimer, lenderFeesEmpty = false }: {
  input: AprInput;
  result: AprResult;
  disclaimer: string;
  /** True while the lender fees box is empty. */
  lenderFeesEmpty?: boolean;
}) {
  return (
    <div className="mt-4 hidden text-[12px] print:block">
      <p className="font-semibold">{gapLine(result, lenderFeesEmpty)}</p>
      {mortgageInsuranceNotCounted(input, result) && <p className="mt-2">{MI_NOT_COUNTED}</p>}
      {loanAboveValue(input, result) && <p className="mt-2">{LOAN_ABOVE_VALUE}</p>}
      <FeesCounted input={input} result={result} className="mt-4 max-w-[60%] break-inside-avoid" />
      <p className="mt-4">{result.miMonths > 0 ? `${ASSUMES_LOAN} ${ASSUMES_INSURANCE}` : ASSUMES_LOAN}</p>
      <p className="mt-2 font-semibold">{LOAN_ESTIMATE_LINE}</p>
      <p className="mt-2 text-[10px] text-muted">{disclaimer}</p>
    </div>
  );
}
