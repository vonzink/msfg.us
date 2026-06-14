import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo/buildMetadata";
import { getTenantConfig } from "@/server/tenant/config";
import { LegalPage } from "@/components/legal/LegalPage";
import { LicenseTable } from "@/components/legal/LicenseTable";
import { licensingDoc } from "@/content/legal/licensing";

export function generateMetadata(): Promise<Metadata> {
  return buildMetadata("/licensing", {
    title: "Licensing & Disclosures",
    description:
      "Mountain State Financial Group licensing, NMLS information, state license numbers, Equal Housing Lender statement, and key mortgage disclosures.",
    canonical: "/licensing",
  });
}

export default async function LicensingPage() {
  const config = await getTenantConfig();
  return (
    <LegalPage title="Licensing & Disclosures" slug="licensing" doc={licensingDoc(config)}>
      <section>
        <h2 className="text-[24px] font-extrabold tracking-[-0.02em] text-ink">State licenses</h2>
        <LicenseTable config={config} />
      </section>
    </LegalPage>
  );
}
