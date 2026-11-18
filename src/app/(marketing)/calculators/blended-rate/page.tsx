import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalculatorPage } from "@/calculators/shared/CalculatorPage";
import { BlendedRateCalculator } from "@/calculators/blended-rate/BlendedRateCalculator";
import { HOW_IT_WORKS, QUESTIONS } from "@/calculators/blended-rate/content";
import { CALCULATORS, enabledCalculators, isCalculatorEnabled } from "@/calculators/registry";
import { buildMetadata } from "@/lib/seo/buildMetadata";
import { getTenantConfig } from "@/server/tenant/config";

const ENTRY = CALCULATORS.find((c) => c.slug === "blended-rate")!;

export async function generateMetadata(): Promise<Metadata> {
  const config = await getTenantConfig();
  if (!isCalculatorEnabled(ENTRY.slug, config.calculators)) notFound();
  return buildMetadata(ENTRY.path, {
    title: "Blended Rate Calculator",
    description: "Combine a mortgage with a second loan, a credit line or other debts and see the single interest rate they add up to.",
    canonical: ENTRY.path,
  });
}

export default async function BlendedRateCalculatorPage() {
  const config = await getTenantConfig();
  if (!isCalculatorEnabled(ENTRY.slug, config.calculators)) notFound();
  // Link to the Refinance breakeven calculator only once it is live and switched on.
  const breakeven = enabledCalculators(config.calculators).find((c) => c.slug === "refinance-breakeven");
  return (
    <CalculatorPage entry={ENTRY} howItWorks={HOW_IT_WORKS} questions={QUESTIONS}>
      <BlendedRateCalculator disclaimer={config.legal.calculatorDisclaimer} breakevenHref={breakeven?.path ?? null} />
    </CalculatorPage>
  );
}
