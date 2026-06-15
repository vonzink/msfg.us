import { buildLegalStrip, effectiveDate } from "@/content/site";
import { getTenantConfig } from "@/server/tenant/config";
import { PageJsonLd } from "@/components/seo/PageJsonLd";
import { Mark } from "@/components/ui/Mark";
import { EqualHousing } from "./EqualHousing";
import type { LegalBlock, LegalDoc } from "@/content/legal/types";

function Block({ block }: { block: LegalBlock }) {
  if (block.kind === "h3")
    return <h3 className="mt-6 text-[19px] font-bold tracking-[-0.01em] text-ink">{block.text}</h3>;
  if (block.kind === "ul")
    return (
      <ul className="mt-2 list-disc space-y-2 pl-5 text-[16px] leading-[1.6] text-ink">
        {block.items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    );
  return <p className="text-[16px] leading-[1.6] text-ink">{block.text}</p>;
}

/** Shared chrome for a legal page: dark mini-hero title, pending-review banner,
 *  constrained prose body, and an Equal Housing Opportunity + legal-strip footer.
 *  `slug` keys the effective date and the per-page JSON-LD path. */
export async function LegalPage({
  title,
  eyebrow = "Legal",
  slug,
  doc,
  children,
  reviewBanner = true,
}: {
  title: string;
  eyebrow?: string;
  slug: string;
  doc?: LegalDoc;
  children?: React.ReactNode;
  reviewBanner?: boolean;
}) {
  const config = await getTenantConfig();
  return (
    <>
      <PageJsonLd path={`/${slug}`} />
      <section className="hero-bg px-0 pb-[52px] pt-14 text-center text-white">
        <div className="wrap">
          <span className="mb-3.5 inline-flex items-center gap-2.5 text-mint">
            <Mark size={18} label={config.brand.shortName} />
            <span className="text-[13px] font-semibold tracking-[0.02em]">{eyebrow}</span>
          </span>
          <h1 className="m-0 text-[clamp(30px,4.2vw,48px)] font-extrabold tracking-[-0.03em]">
            {title}
          </h1>
          <p className="mt-3 text-[14px] text-on-dark-2">
            Last updated: {effectiveDate(config, slug)}
          </p>
        </div>
      </section>

      <article className="bg-paper py-16 text-ink">
        <div className="wrap max-w-[820px]">
          {reviewBanner && (
            <div
              role="note"
              className="mb-10 rounded-lg border border-line bg-paper-2 px-4 py-3 text-[13.5px] leading-[1.5] text-muted"
            >
              <strong className="font-bold text-ink">Draft for review.</strong> This page is a
              working template pending {config.brand.shortName}{" "}legal &amp; compliance approval and
              is not yet legal advice. Bracketed <code className="text-[12.5px]">[PLACEHOLDER]</code>{" "}
              values will be replaced with verified information before launch.
            </div>
          )}

          {doc?.intro && (
            <p className="mb-8 text-[17px] leading-[1.6] text-ink">{doc.intro}</p>
          )}

          <div className="space-y-10">
            {doc?.sections.map((s, i) => (
              <section key={i}>
                <h2 className="text-[24px] font-extrabold tracking-[-0.02em] text-ink">
                  {s.heading}
                </h2>
                <div className="mt-3 space-y-3">
                  {s.blocks.map((b, j) => (
                    <Block key={j} block={b} />
                  ))}
                </div>
              </section>
            ))}
            {children}
          </div>

          <div className="mt-14 flex items-start gap-3 border-t border-line pt-6">
            <EqualHousing size={30} className="mt-0.5 shrink-0 text-muted" />
            <p className="text-[12.5px] leading-relaxed text-muted">{buildLegalStrip(config)}</p>
          </div>
        </div>
      </article>
    </>
  );
}
