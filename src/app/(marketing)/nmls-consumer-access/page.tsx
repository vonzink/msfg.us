import type { Metadata } from "next";
import { Mark } from "@/components/ui/Mark";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { CtaBand } from "@/components/CtaBand";
import { getTenantConfig } from "@/server/tenant/config";
import { buildMetadata } from "@/lib/seo/buildMetadata";
import { PageJsonLd } from "@/components/seo/PageJsonLd";
import { statesLine } from "@/content/site";

export function generateMetadata(): Promise<Metadata> {
  return buildMetadata("/nmls-consumer-access", {
    title: "NMLS Consumer Access",
    description:
      "Verify Mountain State Financial Group on NMLS Consumer Access — the official registry of licensed mortgage companies and loan originators.",
    canonical: "/nmls-consumer-access",
  });
}

export default async function NmlsConsumerAccessPage() {
  const config = await getTenantConfig();
  return (
    <>
      <PageJsonLd path="/nmls-consumer-access" />
      <section className="hero-bg px-0 pb-[52px] pt-14 text-center text-white">
        <div className="wrap">
          <span className="mb-3.5 inline-flex items-center gap-2.5 text-mint">
            <Mark size={18} label={config.brand.shortName} />
            <span className="text-[13px] font-semibold tracking-[0.02em]">Verify our license</span>
          </span>
          <h1 className="m-0 text-[clamp(30px,4.2vw,48px)] font-extrabold tracking-[-0.03em]">
            NMLS Consumer Access
          </h1>
          <p className="mx-auto mt-4 max-w-[60ch] text-[18px] text-on-dark-2">
            NMLS Consumer Access is the official, free registry maintained by the Nationwide
            Multistate Licensing System. Use it to confirm {config.brand.legalName} and our loan
            originators are licensed.
          </p>
        </div>
      </section>

      <Section>
        <div className="mx-auto max-w-[760px]">
          <p className="text-[16px] leading-[1.6] text-ink">
            Our company NMLS ID is{" "}
            <strong className="font-bold">#{config.contact.nmls} [PLACEHOLDER]</strong>. We are
            licensed to originate residential mortgage loans in {statesLine(config)}. To verify our
            license or look up an individual loan officer, search the official registry:
          </p>
          <div className="mt-6">
            <Button
              href={config.contact.nmlsConsumerAccessUrl}
              variant="green"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open NMLS Consumer Access ↗
            </Button>
          </div>
          <p className="mt-4 text-[13.5px] text-muted">
            Opens nmlsconsumeraccess.org in a new tab. {config.brand.shortName} is an Equal Housing
            Lender.
          </p>
        </div>
      </Section>

      <CtaBand />
    </>
  );
}
