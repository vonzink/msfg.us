import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalculatorPage } from "@/calculators/shared/CalculatorPage";
import { BreakevenCalculator } from "@/calculators/refinance-breakeven/BreakevenCalculator";
import { HOW_IT_WORKS, QUESTIONS } from "@/calculators/refinance-breakeven/content";
import { CALCULATORS, isCalculatorEnabled } from "@/calculators/registry";
import { buildMetadata } from "@/lib/seo/buildMetadata";
import { getTenantConfig } from "@/server/tenant/config";

const ENTRY = CALCULATORS.find((c) => c.slug === "refinance-breakeven")!;

export async function generateMetadata(): Promise<Metadata> {
  const config = await getTenantConfig();
  if (!isCalculatorEnabled(ENTRY.slug, config.calculators)) notFound();
  return buildMetadata(ENTRY.path, {
    title: "Refinance Breakeven Calculator",
    description: "See the new payment on a refinance, how many months it takes to recover the closing costs, and the interest over the life of each loan.",
    canonical: ENTRY.path,
  });
}

export default async function RefinanceBreakevenCalculatorPage() {
  const config = await getTenantConfig();
  if (!isCalculatorEnabled(ENTRY.slug, config.calculators)) notFound();
  return (
    <CalculatorPage entry={ENTRY} howItWorks={HOW_IT_WORKS} questions={QUESTIONS}>
      <BreakevenCalculator
        exampleRatePct={config.calculators.exampleRatePct}
        exampleRateNote={config.legal.exampleRateNote}
        disclaimer={config.legal.calculatorDisclaimer}
      />
    </CalculatorPage>
  );
}
