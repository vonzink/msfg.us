import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalculatorPage } from "@/calculators/shared/CalculatorPage";
import { RentVsBuyCalculator } from "@/calculators/rent-vs-buy/RentVsBuyCalculator";
import { HOW_IT_WORKS, META_DESCRIPTION, QUESTIONS } from "@/calculators/rent-vs-buy/content";
import { CALCULATORS, isCalculatorEnabled } from "@/calculators/registry";
import { buildMetadata } from "@/lib/seo/buildMetadata";
import { getTenantConfig } from "@/server/tenant/config";

const ENTRY = CALCULATORS.find((c) => c.slug === "rent-vs-buy")!;

export async function generateMetadata(): Promise<Metadata> {
  const config = await getTenantConfig();
  if (!isCalculatorEnabled(ENTRY.slug, config.calculators)) notFound();
  return buildMetadata(ENTRY.path, {
    title: "Rent vs Buy Calculator",
    description: META_DESCRIPTION,
    canonical: ENTRY.path,
  });
}

export default async function RentVsBuyCalculatorPage() {
  const config = await getTenantConfig();
  if (!isCalculatorEnabled(ENTRY.slug, config.calculators)) notFound();
  return (
    <CalculatorPage entry={ENTRY} howItWorks={HOW_IT_WORKS} questions={QUESTIONS}>
      <RentVsBuyCalculator
        exampleRatePct={config.calculators.exampleRatePct}
        exampleRateNote={config.legal.exampleRateNote}
        disclaimer={config.legal.calculatorDisclaimer}
      />
    </CalculatorPage>
  );
}
