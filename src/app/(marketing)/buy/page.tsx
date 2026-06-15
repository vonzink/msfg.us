import type { Metadata } from "next";
import { CategoryPage } from "@/components/category/CategoryPage";
import { buildMetadata } from "@/lib/seo/buildMetadata";
import { PageJsonLd } from "@/components/seo/PageJsonLd";

export function generateMetadata(): Promise<Metadata> {
  return buildMetadata("/buy", {
    title: "Buy a Home — Mortgage Pre-Approval & Loan Programs | MSFG",
    description:
      "Get pre-approved with a local MSFG loan officer, shop with confidence, and close in about 21 days. Conventional, FHA, VA, and USDA home loans, guided start to finish.",
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
