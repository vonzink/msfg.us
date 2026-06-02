import { Hero } from "@/components/home/Hero";
import { Features } from "@/components/home/Features";
import { Family } from "@/components/home/Family";
import { CtaBand } from "@/components/CtaBand";
import { JsonLd } from "@/components/JsonLd";
import { localBusinessSchema } from "@/lib/schema";

export default function HomePage() {
  return (
    <>
      <JsonLd data={localBusinessSchema()} />
      <Hero />
      <Features />
      <Family />
      <CtaBand />
    </>
  );
}
