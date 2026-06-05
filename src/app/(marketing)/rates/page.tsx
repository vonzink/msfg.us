import type { Metadata } from "next";
import { Mark } from "@/components/ui/Mark";
import { Section } from "@/components/ui/Section";
import { CtaBand } from "@/components/CtaBand";
import { RateTable } from "@/components/rates/RateTable";
import { RATES_UPDATED } from "@/content/rates";
import { getTenantConfig } from "@/server/tenant/config";

export const metadata: Metadata = {
  title: "Today's Mortgage Rates",
  description:
    "Transparent purchase and refinance mortgage rates from MSFG, updated every business day. See estimated monthly payments and start your application.",
  alternates: { canonical: "/rates" },
};

export default async function RatesPage() {
  const config = await getTenantConfig();
  return (
    <>
      {/* 3a. Mini-hero — dark emerald, centered */}
      <section className="hero-bg px-0 pb-[60px] pt-14 text-center text-white">
        <div className="wrap">
          <span className="mb-3.5 inline-flex items-center gap-2.5 text-mint">
            <Mark size={18} />
            <span className="text-[13px] font-semibold tracking-[0.02em]">
              Today&rsquo;s rates
            </span>
          </span>
          <h1 className="m-0 text-[clamp(34px,4.6vw,54px)] font-extrabold tracking-[-0.035em]">
            Today&rsquo;s <span className="text-mint">mortgage rates</span>
          </h1>
          <p className="mx-auto mt-4 max-w-[50ch] text-[18px] text-on-dark-2">
            Transparent pricing, updated every business day. Your real rate
            depends on your credit, property, and full application.
          </p>
          <div className="mt-4 flex items-center justify-center gap-2 text-[13px] text-on-dark-3">
            <span
              aria-hidden
              className="h-2 w-2 animate-pulse rounded-full bg-mint motion-reduce:animate-none"
            />
            Updated {RATES_UPDATED}
          </div>
        </div>
      </section>

      {/* 3b. Rate table — cream section (toggle + rows live in RateTable) */}
      <Section>
        <RateTable />
        <p className="mx-auto mt-[18px] max-w-[980px] text-center text-[13px] leading-[1.6] text-muted">
          *{config.legal.ratesDisclaimer}
        </p>
      </Section>

      {/* 3c. CTA band */}
      <CtaBand />
    </>
  );
}
