import { describe, it, expect } from "vitest";
import {
  TenantConfigSchema,
  DEFAULT_TENANT_CONFIG,
  buildLegalStrip,
  buildConsentTcpa,
  buildTestimonialCaption,
  statesLine,
  effectiveDate,
} from "./site";

// The exact strings MSFG renders today (copied from the pre-Phase-B site.ts).
const EXPECTED_STATES_LINE = "CO, ND, SD, MN, TX, MI, IN";
const EXPECTED_LEGAL_STRIP =
  "Mountain State Financial Group, LLC. NMLS #1314257. Equal Housing Lender. Licensed in CO, ND, SD, MN, TX, MI, IN. Loans subject to credit and property approval. Rates and terms subject to change without notice. MSFG AI provides general information and estimates only and is not a commitment to lend. © 2015–2026 MSFG, LLC.";
const EXPECTED_CONSENT_TCPA =
  "By submitting, you agree that MSFG and its affiliates may contact you about your inquiry by phone, text, and email — including via automated technology — at the number and address provided. Consent is not a condition of any purchase. Message and data rates may apply.";

describe("TenantConfigSchema", () => {
  it("parses DEFAULT_TENANT_CONFIG unchanged", () => {
    const parsed = TenantConfigSchema.parse(DEFAULT_TENANT_CONFIG);
    expect(parsed).toEqual(DEFAULT_TENANT_CONFIG);
  });

  it("fills theme + features defaults from a partial config", () => {
    const partial = {
      brand: {
        shortName: "Acme",
        legalName: "Acme Lending, LLC",
        foundedYear: 2010,
        assistantName: "Acme AI",
        logos: { horizontal: "/a.svg", white: "/a-w.svg", mark: "/a-m.svg" },
      },
      contact: {
        phoneDisplay: "(555) 555-5555",
        phoneHref: "tel:+15555555555",
        email: "hi@acme.test",
        nmls: "9999999",
        nmlsConsumerAccessUrl: "https://www.nmlsconsumeraccess.org/",
      },
      legal: {
        states: [{ code: "CA", name: "California" }],
        texasNotice: "n/a",
        ratesDisclaimer: "Rates are indicative.",
      },
      seo: {
        titleDefault: "Acme",
        titleTemplate: "%s · Acme",
        description: "Acme home loans.",
        ogTitle: "Acme",
        ogDescription: "Acme home loans.",
        siteName: "Acme",
        orgDescription: "Acme home loans across California.",
        knowsLanguage: ["en"],
      },
      features: { showFamily: false, ghlChat: false, aiAssistant: false },
      ai: {
        provider: "openai-compatible" as const,
        model: "deepseek-chat",
        baseUrl: "https://api.deepseek.com",
      },
    };
    const parsed = TenantConfigSchema.parse(partial);
    // theme is omitted → every field defaults to the MSFG token value.
    expect(parsed.theme.green800).toBe("#0b3d30");
    expect(parsed.theme.spring).toBe("#1fb463");
    expect(parsed.theme.radiusMd).toBe("9px");
    expect(parsed.theme.lip).toBe("#0c6b39");
    expect(parsed.theme.fontFamily).toBe(
      'var(--font-hanken), system-ui, -apple-system, "Segoe UI", sans-serif',
    );
    // marketing is optional → undefined when omitted.
    expect(parsed.marketing).toBeUndefined();
  });

  it("derives the licensed-states line for DEFAULT", () => {
    expect(statesLine(DEFAULT_TENANT_CONFIG)).toBe(EXPECTED_STATES_LINE);
  });

  it("derives the legal strip identical to today's for DEFAULT", () => {
    expect(buildLegalStrip(DEFAULT_TENANT_CONFIG)).toBe(EXPECTED_LEGAL_STRIP);
  });

  it("derives the TCPA consent identical to today's for DEFAULT", () => {
    expect(buildConsentTcpa(DEFAULT_TENANT_CONFIG)).toBe(EXPECTED_CONSENT_TCPA);
  });

  it("defaults the assistant name to MSFG AI", () => {
    expect(DEFAULT_TENANT_CONFIG.brand.assistantName).toBe("MSFG AI");
  });

  it("names the configured assistant in the legal strip (swap-proof)", () => {
    const swapped = {
      ...DEFAULT_TENANT_CONFIG,
      brand: {
        ...DEFAULT_TENANT_CONFIG.brand,
        shortName: "Acme",
        assistantName: "Acme Assistant",
      },
    };
    const strip = buildLegalStrip(swapped);
    expect(strip).toContain("Acme Assistant provides general information");
    // Proves the strip names the assistant field, not a "<shortName> AI" derivation.
    expect(strip).not.toContain("Acme AI");
  });
});

// The apply-flow testimonial caption MSFG renders today (ChoiceStep "Review").
const EXPECTED_TESTIMONIAL_CAPTION = "Drew & Anya, MSFG customers";

describe("testimonials", () => {
  it("seeds MSFG's testimonial in DEFAULT", () => {
    expect(DEFAULT_TENANT_CONFIG.marketing?.testimonials).toEqual([
      { names: "Drew & Anya", rating: 5 },
    ]);
  });

  it("derives the testimonial caption identical to today's for DEFAULT", () => {
    const t = DEFAULT_TENANT_CONFIG.marketing!.testimonials[0];
    expect(buildTestimonialCaption(DEFAULT_TENANT_CONFIG, t)).toBe(
      EXPECTED_TESTIMONIAL_CAPTION,
    );
  });

  it("names the configured brand in the caption, keeping the customer names (swap-proof)", () => {
    const swapped = {
      ...DEFAULT_TENANT_CONFIG,
      brand: { ...DEFAULT_TENANT_CONFIG.brand, shortName: "Acme" },
    };
    const caption = buildTestimonialCaption(swapped, {
      names: "Sam & Lee",
      rating: 4,
    });
    expect(caption).toBe("Sam & Lee, Acme customers");
    // Brand token comes from shortName, not a hardcoded "MSFG".
    expect(caption).not.toContain("MSFG");
  });
});

describe("config.ai.brain", () => {
  it("defaults brain to disabled when an older stored config omits it", () => {
    const stored = JSON.parse(JSON.stringify(DEFAULT_TENANT_CONFIG));
    delete stored.ai.brain; // simulate a config saved before the brain field existed
    const parsed = TenantConfigSchema.parse(stored);
    expect(parsed.ai.brain).toEqual({ enabled: false, baseUrl: "" });
  });

  it("parses an enabled brain config", () => {
    const stored = JSON.parse(JSON.stringify(DEFAULT_TENANT_CONFIG));
    stored.ai.brain = { enabled: true, baseUrl: "http://localhost:8080" };
    const parsed = TenantConfigSchema.parse(stored);
    expect(parsed.ai.brain).toEqual({ enabled: true, baseUrl: "http://localhost:8080" });
  });

  it("ships brain disabled in DEFAULT_TENANT_CONFIG", () => {
    expect(DEFAULT_TENANT_CONFIG.ai.brain).toEqual({ enabled: false, baseUrl: "" });
  });
});

describe("legal config additions", () => {
  it("every default state carries a license-number placeholder", () => {
    for (const s of DEFAULT_TENANT_CONFIG.legal.states) {
      expect(s.licenseNumber).toBeTruthy();
    }
  });

  it("default legal carries the real registered office address", () => {
    expect(DEFAULT_TENANT_CONFIG.legal.address).toContain("Westminster, CO");
    expect(DEFAULT_TENANT_CONFIG.legal.address).not.toContain("PLACEHOLDER");
  });

  it("effectiveDate falls back to a placeholder when no date is set", () => {
    expect(effectiveDate(DEFAULT_TENANT_CONFIG, "terms")).toContain("PLACEHOLDER");
  });

  it("a stored config missing the new fields still parses", () => {
    const stripped = JSON.parse(JSON.stringify(DEFAULT_TENANT_CONFIG));
    stripped.legal.states = stripped.legal.states.map(
      (s: { code: string; name: string }) => ({ code: s.code, name: s.name }),
    );
    delete stripped.legal.address;
    delete stripped.legal.effectiveDates;
    expect(TenantConfigSchema.safeParse(stripped).success).toBe(true);
  });

  it("no family-of-companies card points to the bare home placeholder", () => {
    for (const card of DEFAULT_TENANT_CONFIG.marketing!.familyOfCompanies) {
      expect(card.href).not.toBe("/");
    }
  });
});

describe("theme CSS-value validation", () => {
  it("accepts the MSFG default theme values", () => {
    expect(() => TenantConfigSchema.parse(DEFAULT_TENANT_CONFIG)).not.toThrow();
  });

  it("rejects a value that could break out of the injected <style>", () => {
    const evil = JSON.parse(JSON.stringify(DEFAULT_TENANT_CONFIG));
    evil.theme.green900 = "red;}</style><script>alert(1)</script>";
    expect(() => TenantConfigSchema.parse(evil)).toThrow();
  });

  it("rejects CSS-injection chars (;, }, @) in a theme value", () => {
    const evil = JSON.parse(JSON.stringify(DEFAULT_TENANT_CONFIG));
    evil.theme.spring = "#1fb463; background:url(x)";
    expect(() => TenantConfigSchema.parse(evil)).toThrow();
  });
});
