import { describe, it, expect } from "vitest";
import {
  TenantConfigSchema,
  DEFAULT_TENANT_CONFIG,
  buildLegalStrip,
  buildConsentTcpa,
  buildTestimonialCaption,
  statesLine,
} from "./site";

// The exact strings MSFG renders today (copied from the pre-Phase-B site.ts).
const EXPECTED_STATES_LINE = "CO, ND, SD, MN, TX, MI, IN";
const EXPECTED_LEGAL_STRIP =
  "Mountain State Financial Group, LLC. NMLS #1234567 [PLACEHOLDER]. Equal Housing Lender. Licensed in CO, ND, SD, MN, TX, MI, IN. Loans subject to credit and property approval. Rates and terms subject to change without notice. MSFG AI provides general information and estimates only and is not a commitment to lend. © 1998–2026 MSFG, LLC.";
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
