import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo/buildMetadata";
import { getTenantConfig } from "@/server/tenant/config";
import { LegalPage } from "@/components/legal/LegalPage";
import { termsDoc } from "@/content/legal/terms";

export function generateMetadata(): Promise<Metadata> {
  return buildMetadata("/terms", {
    title: "Terms of Use",
    description:
      "The terms governing your use of msfg.us — permitted use, informational-only disclaimers, intellectual property, liability, and dispute resolution.",
    canonical: "/terms",
  });
}

export default async function TermsPage() {
  const config = await getTenantConfig();
  return <LegalPage title="Terms of Use" slug="terms" doc={termsDoc(config)} />;
}
