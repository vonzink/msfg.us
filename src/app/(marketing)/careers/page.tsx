import type { Metadata } from "next";
import { Mark } from "@/components/ui/Mark";
import { Section, SectionHead } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { CtaBand } from "@/components/CtaBand";
import { PageJsonLd } from "@/components/seo/PageJsonLd";
import { buildMetadata } from "@/lib/seo/buildMetadata";
import { getTenantConfig } from "@/server/tenant/config";

export function generateMetadata(): Promise<Metadata> {
  return buildMetadata("/careers", {
    title: "Careers at MSFG — Join Our Mortgage Team",
    description:
      "Build your mortgage career with Mountain State Financial Group. We're always looking for great loan officers who put clients first. Reach out to start a conversation.",
    canonical: "/careers",
  });
}

const VALUES: ReadonlyArray<readonly [string, string]> = [
  ["Clients first, always", "We never compromise on a client's financial well-being. Do right by people and the rest follows."],
  ["Transparency & clarity", "Plain-English communication and total transparency — with clients and with each other."],
  ["Seasoned support", "Work alongside experienced professionals who help you close from start to finish."],
  ["Built for growth", "Modern tools, a broad product set, and the autonomy to build your book your way."],
];

export default async function CareersPage() {
  const config = await getTenantConfig();
  // [PLACEHOLDER] dedicated careers inbox — falls back to the main contact email.
  const careersEmail = config.contact.email;
  return (
    <>
      <PageJsonLd path="/careers" />
      <section className="hero-bg px-0 pb-[56px] pt-14 text-center text-white">
        <div className="wrap">
          <span className="mb-3.5 inline-flex items-center gap-2.5 text-mint">
            <Mark size={18} label={config.brand.shortName} />
            <span className="text-[13px] font-semibold tracking-[0.02em]">Careers</span>
          </span>
          <h1 className="m-0 text-[clamp(32px,4.6vw,52px)] font-extrabold tracking-[-0.035em]">
            Do the best work <span className="text-mint">of your career.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-[58ch] text-[18px] text-on-dark-2">
            We&rsquo;re always looking for great loan officers and team members who put clients first. If that&rsquo;s you, let&rsquo;s talk.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Button href={`mailto:${careersEmail}?subject=Careers%20at%20MSFG`} variant="green">
              Get in touch
            </Button>
            <Button href={config.contact.phoneHref} variant="ghostDark">
              Call {config.contact.phoneDisplay}
            </Button>
          </div>
        </div>
      </section>

      <Section>
        <SectionHead eyebrow="Why MSFG" title="A team built on service." />
        <div className="grid grid-cols-2 gap-5 max-[900px]:grid-cols-1">
          {VALUES.map(([title, desc]) => (
            <div key={title} className="rounded-lg border border-line bg-white p-6 shadow-3d">
              <h3 className="text-[18px] font-bold text-ink">{title}</h3>
              <p className="mt-2 text-[14.5px] leading-[1.55] text-muted">{desc}</p>
            </div>
          ))}
        </div>
        <p className="mx-auto mt-10 max-w-[60ch] text-center text-[16px] leading-[1.6] text-ink">
          We don&rsquo;t always have a formal opening posted — but we always make room for the right person. Email{" "}
          <a href={`mailto:${careersEmail}`} className="font-semibold text-green-600 hover:underline">{careersEmail}</a>{" "}
          with a little about yourself and your experience, and we&rsquo;ll be in touch.
        </p>
      </Section>

      <CtaBand />
    </>
  );
}
