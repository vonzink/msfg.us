import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo/buildMetadata";
import { getTenantConfig } from "@/server/tenant/config";
import { LegalPage } from "@/components/legal/LegalPage";
import { privacyPolicyDoc } from "@/content/legal/privacyPolicy";

export function generateMetadata(): Promise<Metadata> {
  return buildMetadata("/privacy-policy", {
    title: "Privacy Policy",
    description:
      "How Mountain State Financial Group collects, uses, and protects your information on msfg.us, and the privacy choices and state rights available to you.",
    canonical: "/privacy-policy",
  });
}

export default async function PrivacyPolicyPage() {
  const config = await getTenantConfig();
  return <LegalPage title="Privacy Policy" slug="privacy-policy" doc={privacyPolicyDoc(config)} />;
}
