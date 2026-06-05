import type { Metadata } from "next";
import { CategoryPage } from "@/components/category/CategoryPage";
import { getTenantConfig } from "@/server/tenant/config";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getTenantConfig();
  return {
    title: `Buy a Home — Mortgage Pre-Approval & Loan Programs | ${config.brand.shortName}`,
    description:
      "Get a soft-pull pre-approval with no credit impact, shop with confidence, and close in 21 days. Conventional, FHA, VA, and USDA loans with a local loan officer on call.",
  };
}

export default function BuyPage() {
  return <CategoryPage cat="buy" />;
}
