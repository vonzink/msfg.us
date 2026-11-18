import { formatUSD } from "@/lib/finance";
import { PrintSummary } from "../shared/PrintSummary";
import type { BlendedResult } from "./math";
import { blendedPercent, comparisonSentence, percent } from "./Results";

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
              ...(r.comparison ? [{ label: "Compared with", value: percent(r.comparison.rate) }] : []),
            ],
          },
        ]}
      />
      {/* The same sentence as on screen, so the printout cannot say something different. */}
      {r.comparison && <p className="mt-3 hidden text-[12px] font-semibold print:block">{comparisonSentence(r.comparison)}</p>}
    </>
  );
}
