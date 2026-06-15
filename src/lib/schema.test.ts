import { describe, it, expect } from "vitest";
import { localBusinessSchema } from "./schema";
import { DEFAULT_TENANT_CONFIG, type TenantConfig } from "@/content/site";

describe("localBusinessSchema", () => {
  it("reflects MSFG config + origin", () => {
    const s = localBusinessSchema(DEFAULT_TENANT_CONFIG, "https://msfg.us");
    expect(s["@id"]).toBe("https://msfg.us#org");
    expect(s.url).toBe("https://msfg.us");
    expect(s.name).toBe("Mountain State Financial Group, LLC");
    expect(s.alternateName).toBe("MSFG");
    expect(s.identifier.value).toBe("1314257");
    expect(s.areaServed).toHaveLength(7);
    expect(s.description).toBe(
      "AI-first, transparent home financing — expert mortgage guidance from seasoned, licensed loan officers across seven states.",
    );
    expect(s.knowsLanguage).toEqual(["en", "es", "hi", "ko"]);
  });

  it("reflects a swapped second tenant (config-only retheme)", () => {
    const acme: TenantConfig = {
      ...DEFAULT_TENANT_CONFIG,
      brand: {
        ...DEFAULT_TENANT_CONFIG.brand,
        shortName: "Acme",
        legalName: "Acme Lending, LLC",
      },
      contact: { ...DEFAULT_TENANT_CONFIG.contact, nmls: "9999999" },
      legal: {
        ...DEFAULT_TENANT_CONFIG.legal,
        states: [{ code: "CA", name: "California" }],
      },
      seo: {
        ...DEFAULT_TENANT_CONFIG.seo,
        orgDescription: "Acme home loans across California.",
        knowsLanguage: ["en"],
      },
    };
    const s = localBusinessSchema(acme, "https://acme.com");
    expect(s["@id"]).toBe("https://acme.com#org");
    expect(s.url).toBe("https://acme.com");
    expect(s.name).toBe("Acme Lending, LLC");
    expect(s.alternateName).toBe("Acme");
    expect(s.identifier.value).toBe("9999999");
    expect(s.areaServed).toEqual([{ "@type": "State", name: "California" }]);
    expect(s.description).toBe("Acme home loans across California.");
    expect(s.knowsLanguage).toEqual(["en"]);
  });
});
