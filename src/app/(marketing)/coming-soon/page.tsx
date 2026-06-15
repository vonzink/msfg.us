import type { Metadata } from "next";
import { Mark } from "@/components/ui/Mark";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { getTenantConfig } from "@/server/tenant/config";
import { buildMetadata } from "@/lib/seo/buildMetadata";

export async function generateMetadata(): Promise<Metadata> {
  const meta = await buildMetadata("/coming-soon", {
    title: "Coming soon",
    description:
      "This page is on the way. Meanwhile, start your application or reach a licensed MSFG loan officer.",
  });
  return { ...meta, robots: { index: false, follow: false } };
}

export default async function ComingSoonPage() {
  const config = await getTenantConfig();
  return (
    <Section>
      <div className="mx-auto max-w-[620px] py-10 text-center">
        <span className="mb-4 inline-flex items-center gap-2.5 text-green-600">
          <Mark size={20} label={config.brand.shortName} />
          <span className="text-[13px] font-semibold tracking-[0.02em]">Coming soon</span>
        </span>
        <h1 className="text-[clamp(30px,4vw,46px)] font-extrabold tracking-[-0.03em] text-ink">
          We&rsquo;re building this page
        </h1>
        <p className="mx-auto mt-4 max-w-[48ch] text-[18px] text-muted">
          This part of the site isn&rsquo;t ready yet. In the meantime, start your application or
          talk to a licensed {config.brand.shortName} loan officer — we&rsquo;re here to help.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Button href="/apply/buy" variant="green">
            Start an application
          </Button>
          <Button href="/loan-officers" variant="ghost">
            Find a loan officer
          </Button>
        </div>
      </div>
    </Section>
  );
}
