import type { Metadata } from "next";
import { CategoryPage } from "@/components/category/CategoryPage";
import { AskAiLauncher } from "@/components/ai/AskAiLauncher";
import { PageJsonLd } from "@/components/seo/PageJsonLd";
import { buildMetadata } from "@/lib/seo/buildMetadata";
import { getTenantConfig } from "@/server/tenant/config";

const STARTERS = [
  "What property types do you finance?",
  "Do you finance multifamily?",
  "What is a commercial DSCR loan?",
  "How do I get started?",
];

export function generateMetadata(): Promise<Metadata> {
  return buildMetadata("/commercial", {
    title: "Commercial Real Estate Loans | MSFG",
    description:
      "Commercial, multifamily, and mixed-use real estate financing from MSFG — structured around your business and your asset. Talk to a commercial specialist.",
    canonical: "/commercial",
  });
}

export default async function CommercialPage() {
  const config = await getTenantConfig();
  return (
    <>
      <PageJsonLd path="/commercial" />
      <CategoryPage cat="commercial" />
      <AskAiLauncher
        starters={STARTERS}
        assistantName={config.brand.assistantName}
        shortName={config.brand.shortName}
        iconSrc={config.brand.logos.mark}
      />
    </>
  );
}
