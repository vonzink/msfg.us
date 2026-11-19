import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalculatorPage } from "@/calculators/shared/CalculatorPage";
import { BudgetCalculator } from "@/calculators/budget/BudgetCalculator";
import { HOW_IT_WORKS, INTRO, QUESTIONS } from "@/calculators/budget/content";
import { CALCULATORS, enabledCalculators, isCalculatorEnabled } from "@/calculators/registry";
import { buildMetadata } from "@/lib/seo/buildMetadata";
import { getTenantConfig } from "@/server/tenant/config";

const ENTRY = CALCULATORS.find((c) => c.slug === "budget")!;

export async function generateMetadata(): Promise<Metadata> {
  const config = await getTenantConfig();
  if (!isCalculatorEnabled(ENTRY.slug, config.calculators)) notFound();
  return buildMetadata(ENTRY.path, {
    title: "Home Budget Calculator",
    description: ENTRY.description,
    canonical: ENTRY.path,
  });
}

export default async function BudgetCalculatorPage() {
  const config = await getTenantConfig();
  if (!isCalculatorEnabled(ENTRY.slug, config.calculators)) notFound();
  // Link the housing box to the Mortgage calculator only while that one is switched on.
  const mortgage = enabledCalculators(config.calculators).find((c) => c.slug === "mortgage");
  return (
    <CalculatorPage entry={ENTRY} intro={INTRO} howItWorks={HOW_IT_WORKS} questions={QUESTIONS} ctaTitle="Want to go through your numbers with someone?">
      <BudgetCalculator disclaimer={config.legal.calculatorDisclaimer} mortgageHref={mortgage?.path ?? null} />
    </CalculatorPage>
  );
}
