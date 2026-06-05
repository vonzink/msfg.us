import type { Metadata } from "next";
import { CategoryPage } from "@/components/category/CategoryPage";
import { getTenantConfig } from "@/server/tenant/config";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getTenantConfig();
  return {
    title: `Refinance Your Mortgage — Lower Your Rate or Payment | ${config.brand.shortName}`,
    description:
      "Lower your rate, shorten your term, or take cash out. We run your break-even in plain English before you commit. Rate & term, cash-out, VA IRRRL, and FHA streamline options.",
  };
}

export default function RefinancePage() {
  return <CategoryPage cat="refi" />;
}
