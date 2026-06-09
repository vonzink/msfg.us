import type { Metadata } from "next";
import { CategoryPage } from "@/components/category/CategoryPage";
import { buildMetadata } from "@/lib/seo/buildMetadata";
import { PageJsonLd } from "@/components/seo/PageJsonLd";

export function generateMetadata(): Promise<Metadata> {
  return buildMetadata("/home-equity", {
    title: "Home Equity — HELOC & Cash-Out Refinance | MSFG",
    description:
      "Put your equity to work with a fast, fully digital HELOC or cash-out refinance — for renovations, debt payoff, or whatever's next. $0 application fee and funds in days.",
  });
}

export default function HomeEquityPage() {
  return (
    <>
      <PageJsonLd path="/home-equity" />
      <CategoryPage cat="equity" />
    </>
  );
}
