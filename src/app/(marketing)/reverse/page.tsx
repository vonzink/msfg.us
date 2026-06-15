import type { Metadata } from "next";
import { CategoryPage } from "@/components/category/CategoryPage";
import { AskAiLauncher } from "@/components/ai/AskAiLauncher";
import { PageJsonLd } from "@/components/seo/PageJsonLd";
import { buildMetadata } from "@/lib/seo/buildMetadata";
import { getTenantConfig } from "@/server/tenant/config";

const STARTERS = [
  "How does a reverse mortgage work?",
  "Am I eligible at 62+?",
  "Do I still own my home?",
  "How much can I access?",
];

export function generateMetadata(): Promise<Metadata> {
  return buildMetadata("/reverse", {
    title: "Reverse Mortgages (HECM) for Homeowners 62+ | MSFG",
    description:
      "Convert home equity to cash with an FHA-insured reverse mortgage (HECM) — no required monthly payment for homeowners 62+. Talk to an MSFG reverse specialist.",
    canonical: "/reverse",
  });
}

export default async function ReversePage() {
  const config = await getTenantConfig();
  return (
    <>
      <PageJsonLd path="/reverse" />
      <CategoryPage cat="reverse" />
      <AskAiLauncher
        starters={STARTERS}
        assistantName={config.brand.assistantName}
        shortName={config.brand.shortName}
        iconSrc={config.brand.logos.mark}
      />
    </>
  );
}
