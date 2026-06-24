import type { Metadata } from "next";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { GlossaryExplorer } from "@/components/glossary/GlossaryExplorer";
import { JsonLd } from "@/components/JsonLd";
import { PageJsonLd } from "@/components/seo/PageJsonLd";
import { buildMetadata } from "@/lib/seo/buildMetadata";
import { GLOSSARY } from "@/content/glossary";

const PATH = "/resources/mortgage-glossary";

export function generateMetadata(): Promise<Metadata> {
  return buildMetadata(PATH, {
    title: "Mortgage Glossary",
    description:
      "Plain-English definitions of mortgage and home-loan terms — from the 1003 form to zoning ordinances. Search and browse the MSFG mortgage glossary A–Z.",
    canonical: PATH,
  });
}

/** schema.org DefinedTermSet for the glossary (one DefinedTerm per entry). */
function definedTermSet(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "DefinedTermSet",
    name: "Mortgage Glossary",
    hasDefinedTerm: GLOSSARY.flatMap((s) =>
      s.terms.map((t) => ({
        "@type": "DefinedTerm",
        name: t.term,
        description: t.definition,
        termCode: t.slug,
        url: `${PATH}?term=${t.slug}`,
      })),
    ),
  };
}

export default function MortgageGlossaryPage() {
  return (
    <>
      <PageJsonLd path={PATH} />
      <JsonLd data={definedTermSet()} />

      <section className="bg-paper pb-6 pt-12 text-ink">
        <div className="wrap">
          <Breadcrumb
            items={[
              { label: "Home", href: "/" },
              { label: "Resources" },
              { label: "Mortgage Glossary" },
            ]}
          />
          <h1 className="mt-4 text-[clamp(32px,4.2vw,48px)] font-extrabold tracking-[-0.03em]">
            Mortgage Glossary
          </h1>
          <p className="mt-3 max-w-[60ch] text-[18px] text-muted">
            Plain-English definitions for the terms you&apos;ll meet on the way to a home loan.
          </p>
        </div>
      </section>

      <section className="bg-paper pb-24 text-ink">
        <div className="wrap">
          <GlossaryExplorer sections={GLOSSARY} />
        </div>
      </section>
    </>
  );
}
