import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Wizard } from "@/components/apply/Wizard";
import { FLOW, INTENTS, type Intent } from "@/content/flows";
import { getTenantConfig } from "@/server/tenant/config";
import { listOfficers } from "@/server/officers/officers";
import { buildConsentTcpa, buildTestimonialCaption, deriveApplyOffRamp } from "@/content/site";
import { calendarEmbedUrl } from "@/components/integrations/GhlCalendar";
import type { ApplyOfficer } from "@/components/apply/steps/OfficerStep";

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

  // Lightweight officer roster for the apply-flow picker (no bios → smaller
  // client payload). Falls back to bundled content when the table is empty.
  // On the apply picker we de-emphasize leadership titles so borrowers don't
  // default to the President/EVP. They're fully licensed and take applications —
  // here we show their broker title and list them last. (The public
  // /loan-officers directory keeps their real President/EVP titles.)
  const APPLY_DEPRIORITIZED = new Set(["robert-hoff", "seth-angell"]);
  const officers: ApplyOfficer[] = (await listOfficers())
    .map((o) => ({
      slug: o.slug,
      name: o.name,
      title: APPLY_DEPRIORITIZED.has(o.slug) ? "Licensed Mortgage Broker" : o.title,
      nmls: o.nmls,
      states: o.states,
      photo: o.photo,
      email: o.email,
      phone: o.phone,
    }))
    // Stable sort: de-prioritized officers move to the end, everyone else keeps
    // the roster's existing order.
    .sort(
      (a, b) =>
        Number(APPLY_DEPRIORITIZED.has(a.slug)) -
        Number(APPLY_DEPRIORITIZED.has(b.slug)),
    );

  const offRamp = deriveApplyOffRamp(config);

  return (
    <Wizard
      intent={intent}
      phoneHref={config.contact.phoneHref}
      phoneDisplay={config.contact.phoneDisplay}
      emailDisplay={config.contact.email}
      consentTcpa={buildConsentTcpa(config)}
      assistantName={config.brand.assistantName}
      shortName={config.brand.shortName}
      iconSrc={config.brand.logos.mark}
      testimonial={testimonial}
      calendarHref={calendarEmbedUrl() ?? ""}
      officers={officers}
      offRampChannels={offRamp.channels}
      offRampSla={offRamp.slaCopy}
      finishScreen={offRamp.finishScreen}
    />
  );
}
