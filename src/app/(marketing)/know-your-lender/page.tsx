import type { Metadata } from "next";
import Link from "next/link";
import { Mark } from "@/components/ui/Mark";
import { Section, SectionHead } from "@/components/ui/Section";
import { CtaBand } from "@/components/CtaBand";
import { PageJsonLd } from "@/components/seo/PageJsonLd";
import { buildMetadata } from "@/lib/seo/buildMetadata";
import { getTenantConfig } from "@/server/tenant/config";

export function generateMetadata(): Promise<Metadata> {
  return buildMetadata("/know-your-lender", {
    title: "Know Your Lender — Research MSFG | MSFG",
    description:
      "Due diligence matters when choosing a mortgage lender. Research Mountain State Financial Group, verify our licensing on NMLS, and see what to ask any lender.",
    canonical: "/know-your-lender",
  });
}

/** Each link: external research destination. Replace [PLACEHOLDER] hrefs with the
 *  real profile URLs resolved from the live /knowyourlender page (Task 7 Step 1). */
type ResearchLink = { label: string; href: string };

export default async function KnowYourLenderPage() {
  const config = await getTenantConfig();
  const LINKS: ResearchLink[] = [
    { label: "MSFG on Google", href: "https://www.google.com/search?q=Mountain+State+Financial+Group+MSFG" },
    { label: "MSFG on Zillow", href: "[PLACEHOLDER — Zillow profile URL]" },
    { label: "MSFG on Facebook", href: "https://www.facebook.com/MSFGhomeloans" },
    { label: "Chamber of Commerce", href: "[PLACEHOLDER — Chamber listing URL]" },
    { label: "Better Business Bureau", href: "[PLACEHOLDER — BBB profile URL]" },
    { label: "Colorado eLicense lookup", href: "https://apps.colorado.gov/dora/licensing/Lookup/LicenseLookup.aspx" },
    { label: "NMLS Consumer Access", href: config.contact.nmlsConsumerAccessUrl },
  ];
  const VERIFY: string[] = [
    "Confirm the company and your loan officer are licensed in your state (NMLS Consumer Access).",
    "Read recent, independent reviews — not just testimonials on the lender's own site.",
    "Ask how they're paid, what fees apply, and to see a written Loan Estimate.",
    "Make sure every rate quote is in writing and clearly not a commitment to lend.",
  ];

  return (
    <>
      <PageJsonLd path="/know-your-lender" />
      <section className="hero-bg px-0 pb-[52px] pt-14 text-center text-white">
        <div className="wrap">
          <span className="mb-3.5 inline-flex items-center gap-2.5 text-mint">
            <Mark size={18} label={config.brand.shortName} />
            <span className="text-[13px] font-semibold tracking-[0.02em]">Know your lender</span>
          </span>
          <h1 className="m-0 text-[clamp(32px,4.6vw,52px)] font-extrabold tracking-[-0.035em]">
            Do your <span className="text-mint">due diligence.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-[58ch] text-[18px] text-on-dark-2">
            Choosing a lender is a big decision. We encourage you to research us — and any lender — before you commit.
          </p>
        </div>
      </section>

      <Section>
        <div className="mx-auto max-w-[820px]">
          <SectionHead eyebrow="Research us" title="Look us up." />
          <ul className="grid grid-cols-2 gap-3 max-[600px]:grid-cols-1">
            {LINKS.map((l) =>
              l.href.startsWith("http") ? (
                <li key={l.label}>
                  <a href={l.href} target="_blank" rel="noopener noreferrer" className="block rounded-lg border border-line bg-white px-4 py-3 text-[15px] font-semibold text-green-700 shadow-3d transition-transform hover:-translate-y-0.5">
                    {l.label} ↗
                  </a>
                </li>
              ) : (
                <li key={l.label} className="rounded-lg border border-line bg-paper-2 px-4 py-3 text-[15px] font-semibold text-muted">
                  {l.label} <span className="text-[12px] font-normal">(link coming soon)</span>
                </li>
              ),
            )}
          </ul>

          <h2 className="mt-12 text-[24px] font-extrabold tracking-[-0.02em] text-ink">What to verify with any lender</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-[16px] leading-[1.6] text-ink">
            {VERIFY.map((v, i) => (<li key={i}>{v}</li>))}
          </ul>

          <p className="mt-8 text-[16px] leading-[1.6] text-ink">
            See our{" "}
            <Link href="/licensing" className="font-semibold text-green-600 hover:underline">licensing &amp; disclosures</Link>{" "}
            and verify us on{" "}
            <Link href="/nmls-consumer-access" className="font-semibold text-green-600 hover:underline">NMLS Consumer Access</Link>.
          </p>
        </div>
      </Section>

      <CtaBand />
    </>
  );
}
