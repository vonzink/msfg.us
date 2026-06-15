import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo/buildMetadata";
import { getTenantConfig } from "@/server/tenant/config";
import { LegalPage } from "@/components/legal/LegalPage";
import { texasNoticeDoc } from "@/content/legal/texasNotice";

export function generateMetadata(): Promise<Metadata> {
  return buildMetadata("/texas-required-notice", {
    title: "Texas Consumer Notice",
    description:
      "Texas consumer complaint and recovery fund notice for Mountain State Financial Group, as required by the Texas Department of Savings and Mortgage Lending.",
    canonical: "/texas-required-notice",
  });
}

export default async function TexasNoticePage() {
  const config = await getTenantConfig();
  return (
    <LegalPage
      title="Texas Consumer Notice"
      eyebrow="Texas residents"
      slug="texas-required-notice"
      doc={texasNoticeDoc(config)}
      reviewBanner={false}
    />
  );
}
