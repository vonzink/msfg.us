import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalculatorPage } from "@/calculators/shared/CalculatorPage";
import { InvestmentCalculator } from "@/calculators/investment/InvestmentCalculator";
import { HOW_IT_WORKS, INTRO, QUESTIONS } from "@/calculators/investment/content";
import { CALCULATORS, isCalculatorEnabled } from "@/calculators/registry";
import { buildMetadata } from "@/lib/seo/buildMetadata";
import { getTenantConfig } from "@/server/tenant/config";

const ENTRY = CALCULATORS.find((c) => c.slug === "investment")!;

export async function generateMetadata(): Promise<Metadata> {
  const config = await getTenantConfig();
  if (!isCalculatorEnabled(ENTRY.slug, config.calculators)) notFound();
  return buildMetadata(ENTRY.path, {
    title: "Investment Property Calculator",
    description:
      "See the cash flow, tax effect, equity and five-year return on a rental or bank-owned property before you buy.",
    canonical: ENTRY.path,
  });
}

export default async function InvestmentCalculatorPage() {
  const config = await getTenantConfig();
  if (!isCalculatorEnabled(ENTRY.slug, config.calculators)) notFound();
  return (
    <CalculatorPage entry={ENTRY} intro={INTRO} howItWorks={HOW_IT_WORKS} questions={QUESTIONS}>
      <InvestmentCalculator
        exampleRatePct={config.calculators.exampleRatePct}
        exampleRateNote={config.legal.exampleRateNote}
        disclaimer={config.legal.calculatorDisclaimer}
      />
    </CalculatorPage>
  );
}
