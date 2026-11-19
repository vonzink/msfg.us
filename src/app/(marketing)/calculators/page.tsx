import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { PageJsonLd } from "@/components/seo/PageJsonLd";
import { enabledCalculators } from "@/calculators/registry";
import { buildMetadata } from "@/lib/seo/buildMetadata";
import { getTenantConfig } from "@/server/tenant/config";

const PATH = "/calculators";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getTenantConfig();
  if (enabledCalculators(config.calculators).length === 0) notFound();
  return buildMetadata(PATH, {
    title: "Mortgage Calculators",
    description: "Free mortgage calculators: estimate a payment, test a rental property and more. Estimates only, with nothing to sign up for.",
    canonical: PATH,
  });
}

/** One card per calculator this tenant has switched on, from src/calculators/registry.ts. */
export default async function CalculatorsPage() {
  const config = await getTenantConfig();
  const calculators = enabledCalculators(config.calculators);
  if (calculators.length === 0) notFound();

  return (
    <>
      <PageJsonLd path={PATH} />

      <section className="bg-paper pb-24 pt-12 text-ink">
        <div className="wrap">
          <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Calculators" }]} />
          <h1 className="mt-4 text-[clamp(32px,4.2vw,48px)] font-extrabold tracking-[-0.03em]">Mortgage calculators</h1>
          <p className="mt-3 max-w-[60ch] text-[18px] text-muted">
            Run the numbers yourself. Every result is an estimate.
          </p>

          <ul className="m-0 mt-10 grid list-none grid-cols-3 gap-5 p-0 max-[900px]:grid-cols-2 max-[600px]:grid-cols-1">
            {calculators.map((c) => (
              <li key={c.slug}>
                <Link
                  href={c.path}
                  className="flex h-full flex-col gap-2 rounded-xl border border-line bg-white p-6 shadow-card transition-shadow hover:shadow-pop focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-spring-2"
                >
                  <span className="text-[13px] font-semibold uppercase tracking-[0.06em] text-green-700">{c.label}</span>
                  <span className="text-[22px] font-extrabold leading-tight tracking-[-0.02em]">{c.question}</span>
                  <span className="text-[15px] text-muted">{c.description}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
