import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo/buildMetadata";
import { getTenantConfig } from "@/server/tenant/config";
import { LegalPage } from "@/components/legal/LegalPage";
import { GlbaFactsTable } from "@/components/legal/GlbaFactsTable";
import { privacyNoticeDoc, glbaRows } from "@/content/legal/privacyNotice";

export function generateMetadata(): Promise<Metadata> {
  return buildMetadata("/privacy-notice", {
    title: "Privacy Notice",
    description:
      "Our Gramm-Leach-Bliley Act (GLBA) financial privacy notice: what personal information we collect, why we share it, and how to limit sharing.",
    canonical: "/privacy-notice",
  });
}

export default async function PrivacyNoticePage() {
  const config = await getTenantConfig();
  const rows = glbaRows(config);
  return (
    <LegalPage
      title="Privacy Notice"
      eyebrow="GLBA Privacy"
      slug="privacy-notice"
      doc={privacyNoticeDoc(config)}
    >
      <section>
        <h2 className="text-[24px] font-extrabold tracking-[-0.02em] text-ink">
          Sharing at a glance
        </h2>
        <GlbaFactsTable rows={rows} shortName={config.brand.shortName} />
      </section>
    </LegalPage>
  );
}
