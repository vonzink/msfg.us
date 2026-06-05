import { Hero } from "@/components/home/Hero";
import { Features } from "@/components/home/Features";
import { Family } from "@/components/home/Family";
import { CtaBand } from "@/components/CtaBand";
import { JsonLd } from "@/components/JsonLd";
import { localBusinessSchema } from "@/lib/schema";
import { getTenantConfig, getTenantOrigin } from "@/server/tenant/config";

export default async function HomePage() {
  const [config, origin] = await Promise.all([
    getTenantConfig(),
    getTenantOrigin(),
  ]);
  return (
    <>
      <JsonLd data={localBusinessSchema(config, origin)} />
      <Hero />
      <Features />
      <Family />
      <CtaBand />
    </>
  );
}
