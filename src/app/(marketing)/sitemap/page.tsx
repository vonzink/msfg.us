import type { Metadata } from "next";
import Link from "next/link";
import { Section, SectionHead } from "@/components/ui/Section";
import { buildMetadata } from "@/lib/seo/buildMetadata";
import { PageJsonLd } from "@/components/seo/PageJsonLd";
import { buildSiteMap } from "@/lib/siteMap";

export function generateMetadata(): Promise<Metadata> {
  return buildMetadata("/sitemap", {
    title: "Site Map",
    description:
      "A complete map of msfg.us — buy, refinance, home equity, rates, loan officers, applications, and all legal and licensing pages in one place.",
    canonical: "/sitemap",
  });
}

export default function SiteMapPage() {
  const groups = buildSiteMap();
  return (
    <>
      <PageJsonLd path="/sitemap" />
      <Section>
        <h1 className="sr-only">Site Map</h1>
        <SectionHead eyebrow="Site Map" title="Everything on msfg.us" />
        <div className="grid gap-10 min-[981px]:grid-cols-2">
          {groups.map((g) => (
            <nav key={g.heading} aria-label={g.heading}>
              <h2 className="mb-3 text-[18px] font-bold text-ink">{g.heading}</h2>
              <ul className="space-y-2">
                {g.links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="text-[15px] font-semibold text-spring-3 hover:underline"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </Section>
    </>
  );
}
