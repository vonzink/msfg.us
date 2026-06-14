import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo/buildMetadata";
import { getTenantConfig } from "@/server/tenant/config";
import { LegalPage } from "@/components/legal/LegalPage";
import { accessibilityDoc } from "@/content/legal/accessibility";

export function generateMetadata(): Promise<Metadata> {
  return buildMetadata("/accessibility", {
    title: "Accessibility Statement",
    description:
      "Mountain State Financial Group is committed to digital accessibility and WCAG 2.1 AA. Learn what we do and how to report an accessibility barrier.",
    canonical: "/accessibility",
  });
}

export default async function AccessibilityPage() {
  const config = await getTenantConfig();
  return (
    <LegalPage
      title="Accessibility Statement"
      slug="accessibility"
      doc={accessibilityDoc(config)}
    />
  );
}
