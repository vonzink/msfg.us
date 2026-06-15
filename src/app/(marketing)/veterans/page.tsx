import type { Metadata } from "next";
import { CategoryPage } from "@/components/category/CategoryPage";
import { AskAiLauncher } from "@/components/ai/AskAiLauncher";
import { PageJsonLd } from "@/components/seo/PageJsonLd";
import { buildMetadata } from "@/lib/seo/buildMetadata";
import { getTenantConfig } from "@/server/tenant/config";

const STARTERS = [
  "Am I eligible for a VA loan?",
  "Is there really $0 down?",
  "What is a VA IRRRL?",
  "Can I use my VA benefit more than once?",
];

export function generateMetadata(): Promise<Metadata> {
  return buildMetadata("/veterans", {
    title: "VA Loans for Veterans & Military — $0 Down | MSFG",
    description:
      "VA purchase, refinance, and IRRRL home loans from MSFG — $0 down, no PMI, for veterans, active-duty service members, and eligible spouses across seven states.",
    canonical: "/veterans",
  });
}

export default async function VeteransPage() {
  const config = await getTenantConfig();
  return (
    <>
      <PageJsonLd path="/veterans" />
      <CategoryPage cat="veterans" />
      <AskAiLauncher
        starters={STARTERS}
        assistantName={config.brand.assistantName}
        shortName={config.brand.shortName}
        iconSrc={config.brand.logos.mark}
      />
    </>
  );
}
