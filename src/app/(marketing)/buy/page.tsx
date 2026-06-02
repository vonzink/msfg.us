import type { Metadata } from "next";
import { CategoryPage } from "@/components/category/CategoryPage";

export const metadata: Metadata = {
  title: "Buy a Home — Mortgage Pre-Approval & Loan Programs | MSFG",
  description:
    "Get a soft-pull pre-approval with no credit impact, shop with confidence, and close in 21 days. Conventional, FHA, VA, and USDA loans with a local loan officer on call.",
};

export default function BuyPage() {
  return <CategoryPage cat="buy" />;
}
