import type { Metadata } from "next";
import { CategoryPage } from "@/components/category/CategoryPage";
import { AskAiLauncher } from "@/components/ai/AskAiLauncher";
import { PageJsonLd } from "@/components/seo/PageJsonLd";
import { buildMetadata } from "@/lib/seo/buildMetadata";
import { getTenantConfig } from "@/server/tenant/config";

const STARTERS = [
  "What is a DSCR loan?",
  "Can I finance a rental property?",
  "How much down for an investment property?",
  "Do you finance 2–4 units?",
];

export function generateMetadata(): Promise<Metadata> {
  return buildMetadata("/investment", {
    title: "Investment Property & DSCR Loans | MSFG",
    description:
      "Finance rental properties, second homes, and portfolios with MSFG — including DSCR loans that qualify on the property's cash flow. Get pre-approved online.",
    canonical: "/investment",
  });
}

export default async function InvestmentPage() {
  const config = await getTenantConfig();
  return (
    <>
      <PageJsonLd path="/investment" />
      <CategoryPage cat="investment" />
      <AskAiLauncher
        starters={STARTERS}
        assistantName={config.brand.assistantName}
        shortName={config.brand.shortName}
        iconSrc={config.brand.logos.mark}
      />
    </>
  );
}
