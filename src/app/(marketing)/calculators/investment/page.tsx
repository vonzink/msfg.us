import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { PageJsonLd } from "@/components/seo/PageJsonLd";
import { InvestmentCalculator } from "@/calculators/investment/InvestmentCalculator";
import { buildMetadata } from "@/lib/seo/buildMetadata";
import { isCalculatorEnabled } from "@/calculators/registry";
import { getTenantConfig } from "@/server/tenant/config";

const PATH = "/calculators/investment";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getTenantConfig();
  if (!isCalculatorEnabled("investment", config.calculators)) notFound();
  return buildMetadata(PATH, {
    title: "Investment Property Calculator",
    description:
      "See the cash flow, tax effect, equity and five-year return on a rental or bank-owned property before you buy.",
    canonical: PATH,
  });
}

export default async function InvestmentCalculatorPage() {
  const config = await getTenantConfig();
  if (!isCalculatorEnabled("investment", config.calculators)) notFound();
  return (
    <>
      <PageJsonLd path={PATH} />

      <section className="bg-paper pb-6 pt-12 text-ink print:pt-0">
        <div className="wrap">
          <Breadcrumb
            className="print:hidden"
            items={[{ label: "Home", href: "/" }, { label: "Calculators" }, { label: "Investment property" }]}
          />
          <h1 className="mt-4 text-[clamp(32px,4.2vw,48px)] font-extrabold tracking-[-0.03em]">
            Will this rental pay off?
          </h1>
          <p className="mt-3 max-w-[60ch] text-[18px] text-muted print:hidden">
            Enter the deal and your cash flow, tax effect, equity and five-year return update as you type.
          </p>
        </div>
      </section>

      <section className="bg-paper pb-24 text-ink max-[980px]:pb-28">
        <div className="wrap">
          <InvestmentCalculator />
        </div>
      </section>
    </>
  );
}
