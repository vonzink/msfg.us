import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalculatorPage } from "@/calculators/shared/CalculatorPage";
import { MortgageCalculator } from "@/calculators/mortgage/MortgageCalculator";
import { HOW_IT_WORKS, QUESTIONS } from "@/calculators/mortgage/content";
import { CALCULATORS, isCalculatorEnabled } from "@/calculators/registry";
import { buildMetadata } from "@/lib/seo/buildMetadata";
import { getTenantConfig } from "@/server/tenant/config";

const ENTRY = CALCULATORS.find((c) => c.slug === "mortgage")!;

export async function generateMetadata(): Promise<Metadata> {
  const config = await getTenantConfig();
  if (!isCalculatorEnabled(ENTRY.slug, config.calculators)) notFound();
  return buildMetadata(ENTRY.path, {
    title: "Mortgage Calculator",
    description: "Estimate a monthly mortgage payment with property tax and insurance, and see the payoff schedule and what extra payments save.",
    canonical: ENTRY.path,
  });
}

export default async function MortgageCalculatorPage() {
  const config = await getTenantConfig();
  if (!isCalculatorEnabled(ENTRY.slug, config.calculators)) notFound();
  return (
    <CalculatorPage entry={ENTRY} howItWorks={HOW_IT_WORKS} questions={QUESTIONS}>
      <MortgageCalculator
        exampleRatePct={config.calculators.exampleRatePct}
        exampleRateNote={config.legal.exampleRateNote}
        disclaimer={config.legal.calculatorDisclaimer}
      />
    </CalculatorPage>
  );
}
