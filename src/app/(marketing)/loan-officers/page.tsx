import type { Metadata } from "next";
import { Mark } from "@/components/ui/Mark";
import { Section } from "@/components/ui/Section";
import { CtaBand } from "@/components/CtaBand";
import { OfficerDirectory } from "@/components/officers/OfficerDirectory";
import { listOfficers } from "@/server/officers/officers";
import { getTenantConfig } from "@/server/tenant/config";
import { buildMetadata } from "@/lib/seo/buildMetadata";
import { PageJsonLd } from "@/components/seo/PageJsonLd";

export function generateMetadata(): Promise<Metadata> {
  return buildMetadata("/loan-officers", {
    title: "Loan officers",
    description:
      "Meet your local experts — seasoned, licensed MSFG loan officers who live in the communities they serve. Read their bios, then call, text, or apply online.",
    canonical: "/loan-officers",
  });
}

export default async function LoanOfficersPage() {
  const config = await getTenantConfig();
  const officers = await listOfficers();
  return (
    <>
      <PageJsonLd path="/loan-officers" />
      {/* 4a. Mini-hero — dark emerald, centered */}
      <section
        className="relative overflow-hidden bg-green-800 px-0 pb-[60px] pt-[56px] text-center text-white"
        style={{
          backgroundImage:
            "radial-gradient(110% 80% at 50% 0%, rgba(31,180,99,0.16) 0%, rgba(31,180,99,0) 46%), radial-gradient(90% 90% at 50% 30%, var(--color-green-700) 0%, var(--color-green-800) 55%, var(--color-green-900) 100%)",
        }}
      >
        <div className="wrap">
          <span className="mb-3.5 inline-flex items-center gap-2.5 text-mint">
            <Mark size={18} label={config.brand.shortName} /> Loan officers
          </span>
          <h1 className="m-0 text-[clamp(34px,4.6vw,54px)] font-extrabold tracking-[-0.035em]">
            Meet your <span className="text-mint">local experts</span>
          </h1>
          <p className="mx-auto mt-4 max-w-[50ch] text-[18px] text-on-dark-2">
            Seasoned, licensed loan officers who live in the communities they
            serve. Read a bio, then reach out directly — or apply online in
            minutes.
          </p>
          <p className="mt-3 text-[13px] font-semibold text-on-dark-3">
            Mountain State Financial Group, LLC · Company NMLS #1314257
          </p>
        </div>
      </section>

      {/* 4b. Directory — cream section */}
      <Section>
        <OfficerDirectory officers={officers} />
      </Section>

      {/* 4c. CTA band */}
      <CtaBand />
    </>
  );
}
