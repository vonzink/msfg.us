import { SITE } from "@/content/site";

/** schema.org structured data for the company (homepage). */
export function localBusinessSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "FinancialService",
    "@id": `${SITE.url}#org`,
    name: SITE.legalName,
    alternateName: "MSFG",
    url: SITE.url,
    telephone: SITE.phoneDisplay,
    email: SITE.email,
    description:
      "AI-first, transparent home financing — expert mortgage guidance from seasoned, licensed loan officers across seven states.",
    areaServed: SITE.states.map((s) => ({
      "@type": "State",
      name: s.name,
    })),
    identifier: {
      "@type": "PropertyValue",
      propertyID: "NMLS",
      value: SITE.nmls,
    },
    knowsLanguage: ["en", "es", "hi", "ko"],
  };
}
