import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Wizard } from "@/components/apply/Wizard";
import { FLOW, INTENTS, type Intent } from "@/content/flows";
import { getTenantConfig } from "@/server/tenant/config";
import { buildConsentTcpa } from "@/content/site";

/** Pre-render buy / refi / cash at build time. */
export function generateStaticParams() {
  return INTENTS.map((intent) => ({ intent }));
}

export async function generateMetadata(): Promise<Metadata> {
  const config = await getTenantConfig();
  return {
    // noindex is handled globally for non-prod; this is just the page title.
    title: "Start your application",
    description: `Start your ${config.brand.shortName} application — a few quick questions to personalize your offer.`,
  };
}

function isIntent(value: string): value is Intent {
  return (INTENTS as readonly string[]).includes(value);
}

export default async function ApplyIntentPage({
  params,
}: {
  params: Promise<{ intent: string }>;
}) {
  const { intent } = await params;
  if (!isIntent(intent) || !FLOW[intent]) notFound();

  const config = await getTenantConfig();
  return (
    <Wizard
      intent={intent}
      phoneHref={config.contact.phoneHref}
      phoneDisplay={config.contact.phoneDisplay}
      consentTcpa={buildConsentTcpa(config)}
      assistantName={config.brand.assistantName}
      shortName={config.brand.shortName}
    />
  );
}
