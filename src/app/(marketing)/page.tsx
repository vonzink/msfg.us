import type { Metadata } from "next";
import { Hero } from "@/components/home/Hero";
import { Features } from "@/components/home/Features";
import { Family } from "@/components/home/Family";
import { CtaBand } from "@/components/CtaBand";
import { JsonLd } from "@/components/JsonLd";
import { localBusinessSchema } from "@/lib/schema";
import { getTenantConfig, getTenantOrigin } from "@/server/tenant/config";
import { buildMetadata } from "@/lib/seo/buildMetadata";
import { PageJsonLd } from "@/components/seo/PageJsonLd";

export function generateMetadata(): Promise<Metadata> {
  // Home title is the full brand title — keep it absolute (no `%s · MSFG` wrap).
  return buildMetadata("/", undefined, { absoluteTitle: true });
}

export default async function HomePage() {
  const [config, origin] = await Promise.all([
    getTenantConfig(),
    getTenantOrigin(),
  ]);
  return (
    <>
      <JsonLd data={localBusinessSchema(config, origin)} />
      <PageJsonLd path="/" />
      <Hero />
      <Features />
      <Family />
      <CtaBand />
    </>
  );
}
