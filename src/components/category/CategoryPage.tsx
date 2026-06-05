import Link from "next/link";
import type { ComponentType } from "react";
import {
  Building2,
  CircleDollarSign,
  Home,
  ShieldCheck,
  Sprout,
  TrendingDown,
  Wallet,
} from "lucide-react";
import { Mark } from "@/components/ui/Mark";
import { getTenantConfig } from "@/server/tenant/config";
import { Button } from "@/components/ui/Button";
import { Section, SectionHead } from "@/components/ui/Section";
import { CtaBand } from "@/components/CtaBand";
import { QuickEstimate } from "@/components/category/QuickEstimate";
import { CATS, type CategoryKey, type ProgramIcon } from "@/content/categories";

type IconProps = { className?: string; strokeWidth?: number };

/** Program-card icon map — closest lucide glyphs to the prototype SVGs. */
const PROGRAM_ICONS: Record<ProgramIcon, ComponentType<IconProps>> = {
  conv: Home,
  fha: Home,
  va: ShieldCheck,
  usda: Sprout,
  jumbo: Building2,
  arm: TrendingDown,
  heloc: Wallet,
  cashout: CircleDollarSign,
};

/**
 * One config-driven category page. Renders the dark 2-column hero (copy +
 * live estimator), "How it works", and "Loan programs" from `CATS[cat]`.
 * The global Nav + Footer are supplied by the marketing layout.
 */
export async function CategoryPage({ cat }: { cat: CategoryKey }) {
  const config = await getTenantConfig();
  const c = CATS[cat];
  const applyHref = `/apply/${c.intent}`;

  return (
    <>
      {/* 2a. Hero — dark emerald, 2-column */}
      <section className="cat-hero relative overflow-hidden bg-green-800 py-16 text-white max-[980px]:py-12">
        <div className="wrap relative grid grid-cols-[1.15fr_0.85fr] items-center gap-14 max-[980px]:grid-cols-1 max-[980px]:gap-9">
          <div>
            <span className="mb-4 inline-flex items-center gap-2.5 text-[13px] font-semibold text-mint">
              <Mark size={18} label={config.brand.shortName} /> {c.tag}
            </span>
            <h1 className="m-0 text-balance text-[clamp(36px,5vw,60px)] font-extrabold leading-[1.02] tracking-[-0.035em] text-white">
              {c.h1[0]}
              <span className="text-mint">{c.h1[1]}</span>
            </h1>
            <p className="mt-[18px] max-w-[46ch] text-[clamp(17px,1.9vw,20px)] text-on-dark-2">
              {c.sub}
            </p>
            <div className="mt-[30px] flex flex-wrap gap-3">
              <Button href={applyHref} size="lg">
                {c.cta}
              </Button>
              <Button href="/loan-officers" variant="ghostDark" size="lg">
                Talk to a loan officer
              </Button>
            </div>
            <dl className="mt-[34px] flex gap-10 max-[560px]:gap-7">
              {c.stats.map(([num, label]) => (
                <div key={label}>
                  <dd className="m-0 text-[30px] font-extrabold tracking-[-0.03em] text-white">
                    {num}
                  </dd>
                  <dt className="mt-0.5 text-[13px] text-on-dark-2">{label}</dt>
                </div>
              ))}
            </dl>
          </div>

          <div id="estimate">
            <QuickEstimate q={c.quote} intent={c.intent} />
          </div>
        </div>
      </section>

      {/* 2b. How it works — cream section */}
      <Section>
        <SectionHead eyebrow="How it works" title="Four steps. No mystery." />
        <div className="grid grid-cols-4 gap-5 max-[900px]:grid-cols-2">
          {c.steps.map(([title, desc], i) => (
            <div key={title} className="border-t-2 border-line pt-[18px]">
              <div className="text-[13px] font-extrabold text-green-600">
                STEP {i + 1}
              </div>
              <h3 className="mb-1.5 mt-2.5 text-[19px] font-bold tracking-[-0.01em]">
                {title}
              </h3>
              <p className="m-0 text-[14.5px] text-muted">{desc}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* 2c. Loan programs — cream-alt section */}
      <Section alt>
        <SectionHead eyebrow="Programs" title={c.optsTitle} />
        <div className="grid grid-cols-2 gap-4 max-[900px]:grid-cols-1">
          {c.opts.map((p) => {
            const Icon = PROGRAM_ICONS[p.icon];
            return (
              <Link
                key={p.title}
                href={applyHref}
                className="flex items-start gap-4 rounded-lg border-[1.5px] border-line bg-white p-[22px] shadow-3d transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:shadow-pop"
              >
                <span className="flex size-[46px] flex-none items-center justify-center rounded-[12px] bg-spring-soft text-green-600">
                  <Icon className="size-[22px]" strokeWidth={1.8} />
                </span>
                <div>
                  <h3 className="mb-1.5 text-[19px] font-bold tracking-[-0.01em]">
                    {p.title}
                  </h3>
                  <p className="m-0 text-[14.5px] text-muted">{p.desc}</p>
                  <div className="mt-2 text-[12px] font-bold text-green-600">
                    Best for · {p.audience}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </Section>

      {/* 2d. CTA band (global) */}
      <CtaBand />
    </>
  );
}
