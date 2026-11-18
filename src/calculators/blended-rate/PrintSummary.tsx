import { formatUSD } from "@/lib/finance";
import { PrintSummary } from "../shared/PrintSummary";
import type { BlendedResult } from "./math";
import { blendedPercent, comparisonSentence, newLoanAssumption, percent } from "./Results";

/** The top of the Blended rate calculator's printed page: the debts beside the result. */
export function BlendedPrintSummary({ result: r }: { result: BlendedResult }) {
  return (
    <>
      <PrintSummary
        title="Blended rate estimate"
        columns={[
          {
            heading: "The debts",
            rows: r.debts.map((d) => ({
              label: d.name,
              value: `${formatUSD(d.balance)} at ${percent(d.rate)}${d.missingRate ? " (no rate entered)" : ""}`,
            })),
          },
          {
            heading: "The estimate",
            rows: [
              { label: "Blended rate", value: blendedPercent(r.blendedRate) },
              { label: "Total balance", value: formatUSD(r.totalBalance) },
              ...(r.totalPayment > 0 ? [{ label: "Total monthly payment", value: formatUSD(r.totalPayment) }] : []),
              ...(r.comparison ? [{ label: "Compared with", value: `${percent(r.comparison.rate)} on a ${r.comparison.termYears}-year loan` }] : []),
              ...(r.comparison && r.comparison.monthlySavings !== null
                ? [
                    { label: "New loan payment", value: formatUSD(r.comparison.newPayment) },
                    { label: "Monthly savings", value: formatUSD(r.comparison.monthlySavings) },
                  ]
                : []),
            ],
          },
        ]}
      />
      {/* The same sentence as on screen, so the printout cannot say something different. */}
      {r.comparison && <p className="mt-3 hidden text-[12px] font-semibold print:block">{comparisonSentence(r.comparison)}</p>}
      {r.comparison && r.comparison.monthlySavings !== null && (
        <p className="mt-1 hidden text-[11px] print:block">{newLoanAssumption(r)}</p>
      )}
    </>
  );
}
