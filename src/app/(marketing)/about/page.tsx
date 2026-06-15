import type { Metadata } from "next";
import { Mark } from "@/components/ui/Mark";
import { Section, SectionHead } from "@/components/ui/Section";
import { CtaBand } from "@/components/CtaBand";
import { PageJsonLd } from "@/components/seo/PageJsonLd";
import { buildMetadata } from "@/lib/seo/buildMetadata";
import { getTenantConfig } from "@/server/tenant/config";
import { OFFICES } from "@/content/offices";

export function generateMetadata(): Promise<Metadata> {
  return buildMetadata("/about", {
    title: "About MSFG — Built on Service, Expertise & Preparation",
    description:
      "Mountain State Financial Group is built on excellent products and exceptional service — seasoned, licensed loan officers committed to transparency across seven states.",
    canonical: "/about",
  });
}

const PLEDGE: string[] = [
  "As our client, we are dedicated to providing you with an exceptional mortgage experience, guided by seasoned professionals committed to seeing your loan through from start to finish. At every stage of your home loan process, you can trust that our team will offer consistent support, expertise, and communication, ensuring every detail is addressed as seamlessly as possible.",
  "We understand that every homebuyer's needs are unique, and we are committed to finding the best mortgage solutions tailored to your individual goals and financial situation. If a product doesn't fully align with your present finances or future aspirations, we'll provide a thorough explanation, along with insights on how you might achieve an even better fit.",
  "Finally, we believe in making homeownership accessible and affordable. That's why we prioritize competitive pricing and always work to secure the best interest rates available in the market for our clients.",
];

export default async function AboutPage() {
  const config = await getTenantConfig();
  return (
    <>
      <PageJsonLd path="/about" />
      <section className="hero-bg px-0 pb-[56px] pt-14 text-center text-white">
        <div className="wrap">
          <span className="mb-3.5 inline-flex items-center gap-2.5 text-mint">
            <Mark size={18} label={config.brand.shortName} />
            <span className="text-[13px] font-semibold tracking-[0.02em]">About us</span>
          </span>
          <h1 className="m-0 text-[clamp(32px,4.6vw,52px)] font-extrabold tracking-[-0.035em]">
            Built on service, expertise, <span className="text-mint">and preparation.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-[60ch] text-[18px] text-on-dark-2">
            Excellent products. Exceptional service. These two commitments are the foundation of {config.brand.legalName}.
          </p>
        </div>
      </section>

      <Section>
        <div className="mx-auto max-w-[820px]">
          <SectionHead eyebrow="Our pledge to you" title="Your loan, seen through from start to finish." />
          <div className="space-y-4">
            {PLEDGE.map((p, i) => (
              <p key={i} className="text-[16px] leading-[1.6] text-ink">{p}</p>
            ))}
          </div>
        </div>
      </Section>

      <Section alt>
        <SectionHead eyebrow="Visit us" title="Our offices" />
        <div className="grid grid-cols-3 gap-5 max-[900px]:grid-cols-1">
          {OFFICES.map((o) => (
            <div key={o.city} className="rounded-lg border border-line bg-white p-6 shadow-3d">
              <h3 className="text-[18px] font-bold text-ink">
                {o.city}
                {o.primary && <span className="ml-2 text-[12px] font-bold text-green-600">HQ</span>}
              </h3>
              <p className="mt-2 text-[14.5px] leading-[1.5] text-muted">{o.address}</p>
              <a href={`tel:${o.phone.replace(/[^\d]/g, "")}`} className="mt-2 inline-block text-[14.5px] font-semibold text-green-600 hover:underline">
                {o.phone}
              </a>
            </div>
          ))}
        </div>
      </Section>

      <CtaBand />
    </>
  );
}
