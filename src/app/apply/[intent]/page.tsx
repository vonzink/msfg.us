import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Wizard } from "@/components/apply/Wizard";
import { FLOW, INTENTS, type Intent } from "@/content/flows";
import { getTenantConfig } from "@/server/tenant/config";
import { buildConsentTcpa, buildTestimonialCaption } from "@/content/site";
import { calendarEmbedUrl } from "@/components/integrations/GhlCalendar";

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

  // Derive the first testimonial server-side (client steps receive strings via
  // props — never the server-only config). Absent → the Review is hidden.
  const t = config.marketing?.testimonials?.[0];
  const testimonial = t
    ? { caption: buildTestimonialCaption(config, t), rating: t.rating }
    : undefined;

  return (
    <Wizard
      intent={intent}
      phoneHref={config.contact.phoneHref}
      phoneDisplay={config.contact.phoneDisplay}
      consentTcpa={buildConsentTcpa(config)}
      assistantName={config.brand.assistantName}
      shortName={config.brand.shortName}
      testimonial={testimonial}
      calendarHref={calendarEmbedUrl() ?? ""}
    />
  );
}
