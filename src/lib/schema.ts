import type { TenantConfig } from "@/content/site";

/** schema.org structured data for the company (homepage). */
export function localBusinessSchema(config: TenantConfig, origin: string) {
  return {
    "@context": "https://schema.org",
    "@type": "FinancialService",
    "@id": `${origin}#org`,
    name: config.brand.legalName,
    alternateName: config.brand.shortName,
    url: origin,
    telephone: config.contact.phoneDisplay,
    email: config.contact.email,
    description:
      "AI-first, transparent home financing — expert mortgage guidance from seasoned, licensed loan officers across seven states.",
    areaServed: config.legal.states.map((s) => ({
      "@type": "State",
      name: s.name,
    })),
    identifier: {
      "@type": "PropertyValue",
      propertyID: "NMLS",
      value: config.contact.nmls,
    },
    knowsLanguage: ["en", "es", "hi", "ko"],
  };
}
