import type { Metadata } from "next";
import { CategoryPage } from "@/components/category/CategoryPage";
import { getTenantConfig } from "@/server/tenant/config";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getTenantConfig();
  return {
    title: `Home Equity — HELOC & Cash-Out Refinance | ${config.brand.shortName}`,
    description:
      "Put your equity to work with a fast, fully digital HELOC or cash-out refinance — for renovations, debt payoff, or whatever's next. $0 application fee and funds in days.",
  };
}

export default function HomeEquityPage() {
  return <CategoryPage cat="equity" />;
}
