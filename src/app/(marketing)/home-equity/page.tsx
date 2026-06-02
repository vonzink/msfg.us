import type { Metadata } from "next";
import { CategoryPage } from "@/components/category/CategoryPage";

export const metadata: Metadata = {
  title: "Home Equity — HELOC & Cash-Out Refinance | MSFG",
  description:
    "Put your equity to work with a fast, fully digital HELOC or cash-out refinance — for renovations, debt payoff, or whatever's next. $0 application fee and funds in days.",
};

export default function HomeEquityPage() {
  return <CategoryPage cat="equity" />;
}
