import type { Metadata } from "next";
import { CategoryPage } from "@/components/category/CategoryPage";
import { buildMetadata } from "@/lib/seo/buildMetadata";
import { PageJsonLd } from "@/components/seo/PageJsonLd";

export function generateMetadata(): Promise<Metadata> {
  return buildMetadata("/buy", {
    title: "Buy a Home — Mortgage Pre-Approval & Loan Programs | MSFG",
    description:
      "Get a soft-pull pre-approval with no credit impact, shop with confidence, and close in 21 days. Conventional, FHA, VA, and USDA loans with a local loan officer on call.",
  });
}

export default function BuyPage() {
  return (
    <>
      <PageJsonLd path="/buy" />
      <CategoryPage cat="buy" />
    </>
  );
}
