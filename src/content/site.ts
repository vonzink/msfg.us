/**
 * Tenant configuration — the schema, MSFG's defaults, and derive-helpers.
 *
 * Phase B: this module stops being the live source of truth. It now exports the
 * shape (`TenantConfigSchema`), MSFG's seed/default values (`DEFAULT_TENANT_CONFIG`,
 * identical to the pre-Phase-B hardcoded values), and the pure helpers that derive
 * the legal disclosure strings. Live values come from the resolved tenant via
 * `getTenantConfig()` (src/server/tenant/config.ts).
 *
 * A backward-compat `SITE`/string shim is kept for the not-yet-migrated importers
 * (env, auth routes, openapi, ai-chat); those move to config in later phases.
 *
 * Values marked [PLACEHOLDER] must be replaced with real MSFG data before the
 * apex (production) launch.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const StateSchema = z.object({ code: z.string(), name: z.string() });

const BrandSchema = z.object({
  shortName: z.string(),
  legalName: z.string(),
  foundedYear: z.number().int(),
  /** Display name of the tenant's AI assistant (e.g. "MSFG AI"). Named where
   *  the assistant is referenced in UI + the derived legal strip. */
  assistantName: z.string(),
  logos: z.object({
    horizontal: z.string(),
    white: z.string(),
    mark: z.string(),
  }),
});

/**
 * Theme tokens. Every field is optional and defaults to MSFG's value, so a
 * partial config still renders. Field names map 1:1 to the CSS variables in
 * src/app/globals.css `@theme` (see src/components/theme/tenantThemeCss.ts).
 */
const ThemeSchema = z.object({
  // Deep emerald system
  green900: z.string().default("#07271e"),
  green850: z.string().default("#0a3329"),
  green800: z.string().default("#0b3d30"),
  green700: z.string().default("#0e4a39"),
  green600: z.string().default("#135e48"),
  greenGlow: z.string().default("#1d7a55"),
  // Action green
  spring: z.string().default("#1fb463"),
  spring2: z.string().default("#18a359"),
  spring3: z.string().default("#34d17e"),
  springSoft: z.string().default("rgba(31, 180, 99, 0.14)"),
  // Headline accent
  mint: z.string().default("#7fe3a8"),
  // Neutrals
  ink: z.string().default("#0b231c"),
  paper: z.string().default("#fbfbf7"),
  paper2: z.string().default("#f2f4ef"),
  muted: z.string().default("#5a6b61"),
  line: z.string().default("#e2e6dd"),
  // On-dark text + hairlines
  onDark: z.string().default("rgba(255, 255, 255, 0.92)"),
  onDark2: z.string().default("rgba(255, 255, 255, 0.62)"),
  onDark3: z.string().default("rgba(255, 255, 255, 0.4)"),
  hairDark: z.string().default("rgba(255, 255, 255, 0.12)"),
  // Radii
  radiusSm: z.string().default("6px"),
  radiusMd: z.string().default("9px"),
  radiusLg: z.string().default("12px"),
  radiusXl: z.string().default("16px"),
  // Non-utility tokens
  lip: z.string().default("#0c6b39"),
  fontFamily: z
    .string()
    .default(
      'var(--font-hanken), system-ui, -apple-system, "Segoe UI", sans-serif',
    ),
});

const ContactSchema = z.object({
  phoneDisplay: z.string(),
  phoneHref: z.string(),
  email: z.string(),
  nmls: z.string(),
  nmlsConsumerAccessUrl: z.string(),
});

const LegalSchema = z.object({
  states: z.array(StateSchema),
  texasNotice: z.string(),
  ratesDisclaimer: z.string(),
});

const SeoSchema = z.object({
  titleDefault: z.string(),
  titleTemplate: z.string(),
  description: z.string(),
  ogTitle: z.string(),
  ogDescription: z.string(),
  siteName: z.string(),
  ogImage: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  /** JSON-LD LocalBusiness description (distinct from the meta description). */
  orgDescription: z.string(),
  /** Languages the business operates in (schema.org knowsLanguage). */
  knowsLanguage: z.array(z.string()),
});

const StatSchema = z.object({ num: z.string(), label: z.string() });
const FamilyCardSchema = z.object({
  rest: z.string(),
  href: z.string(),
  desc: z.string(),
});
const FooterFamilySchema = z.object({ rest: z.string(), desc: z.string() });

/** A customer testimonial shown in the apply flow (ChoiceStep "Review"). */
const TestimonialSchema = z.object({
  /** Customer display names, e.g. "Drew & Anya". */
  names: z.string(),
  /** Star rating, 1–5. */
  rating: z.number().int().min(1).max(5),
});
export type Testimonial = z.infer<typeof TestimonialSchema>;

const MarketingSchema = z.object({
  tagline: z.string(),
  stats: z.array(StatSchema),
  familyOfCompanies: z.array(FamilyCardSchema),
  footerFamily: z.array(FooterFamilySchema),
  /** Apply-flow social proof. Empty array → no testimonial is shown. */
  testimonials: z.array(TestimonialSchema),
});

const FeaturesSchema = z.object({
  showFamily: z.boolean(),
  ghlChat: z.boolean(),
  aiAssistant: z.boolean(),
});

export const TenantConfigSchema = z.object({
  brand: BrandSchema,
  // Lazy default: when `theme` is omitted, fill all sub-fields with their
  // individual Zod defaults (Zod v4 does not recursively apply sub-defaults
  // when the outer `.default` value is a plain `{}`).
  theme: ThemeSchema.default(() => ThemeSchema.parse({})),
  contact: ContactSchema,
  legal: LegalSchema,
  seo: SeoSchema,
  marketing: MarketingSchema.optional(),
  features: FeaturesSchema,
});

export type TenantConfig = z.infer<typeof TenantConfigSchema>;

// ---------------------------------------------------------------------------
// MSFG defaults (identical to the pre-Phase-B hardcoded values)
// ---------------------------------------------------------------------------

/**
 * MSFG's config — the Zod default/fallback AND the seed source (prisma/seed.ts).
 * `ThemeSchema.parse({})` materializes every token default so DEFAULT carries an
 * explicit theme (used by `<TenantTheme>`).
 */
export const DEFAULT_TENANT_CONFIG: TenantConfig = {
  brand: {
    shortName: "MSFG",
    legalName: "Mountain State Financial Group, LLC",
    foundedYear: 1998,
    assistantName: "MSFG AI",
    logos: {
      horizontal: "/brand/msfg-horizontal.svg",
      white: "/brand/msfg-white.svg",
      mark: "/brand/msfg-mark.svg",
    },
  },
  theme: ThemeSchema.parse({}),
  contact: {
    phoneDisplay: "(303) 555-0142",
    phoneHref: "tel:+13035550142",
    email: "hello@msfg.us",
    nmls: "1234567",
    nmlsConsumerAccessUrl: "https://www.nmlsconsumeraccess.org/",
  },
  legal: {
    states: [
      { code: "CO", name: "Colorado" },
      { code: "ND", name: "North Dakota" },
      { code: "SD", name: "South Dakota" },
      { code: "MN", name: "Minnesota" },
      { code: "TX", name: "Texas" },
      { code: "MI", name: "Michigan" },
      { code: "IN", name: "Indiana" },
    ],
    texasNotice:
      "Texas Consumer Complaint and Recovery Fund Notice available upon request. Figure: Consumers wishing to file a complaint against a mortgage company or licensed residential mortgage loan originator should complete and send a complaint form to the Texas Department of Savings and Mortgage Lending.",
    ratesDisclaimer:
      "Rates shown are indicative, assume a 740+ FICO score, a $300,000 loan on a single-family primary residence, and are not a commitment to lend. Your actual rate depends on your credit, property, loan amount, and a complete application. Rates and points are subject to change without notice.",
  },
  seo: {
    titleDefault: "MSFG — Expert Mortgage Guidance from Seasoned Professionals",
    titleTemplate: "%s · MSFG",
    description:
      "Mountain State Financial Group — AI-first, transparent home financing across Colorado, North Dakota, South Dakota, Minnesota, Texas, Michigan, and Indiana.",
    ogTitle: "MSFG — Expert Mortgage Guidance from Seasoned Professionals",
    ogDescription:
      "AI-first, transparent home financing across seven states. Real licensed loan officers, one tap away.",
    siteName: "MSFG",
    orgDescription:
      "AI-first, transparent home financing — expert mortgage guidance from seasoned, licensed loan officers across seven states.",
    knowsLanguage: ["en", "es", "hi", "ko"],
  },
  marketing: {
    tagline:
      "A family of companies serving every step of your homeownership journey — since 1998.",
    stats: [
      { num: "$1.4B+", label: "funded loans" },
      { num: "4,200+", label: "families served" },
      { num: "21 days", label: "avg. close time" },
    ],
    familyOfCompanies: [
      {
        rest: "Mortgage",
        href: "/buy",
        desc: "Apply 100% online with expert support — or walk into a local branch.",
      },
      {
        rest: "Real Estate",
        href: "/",
        desc: "Match with a local partner agent and save on your home purchase.",
      },
      {
        rest: "Insurance",
        href: "/",
        desc: "Shop, bundle, and save on home, auto, and life coverage in one place.",
      },
      {
        rest: "Title & Closing",
        href: "/",
        desc: "Transparent rates on title insurance, handled under one roof.",
      },
      {
        rest: "Inspect",
        href: "/",
        desc: "Free repair estimates and fast report turnarounds before you commit.",
      },
      {
        rest: "HELOC",
        href: "/home-equity",
        desc: "Tap your equity with a fast, fully digital home equity line.",
      },
    ],
    footerFamily: [
      { rest: "Mortgage", desc: "Apply 100% online, with expert customer support." },
      {
        rest: "Real Estate",
        desc: "Connect with a local partner agent to find out how much you can save.",
      },
      {
        rest: "Insurance",
        desc: "Shop, bundle, and save on home, auto, and life coverage.",
      },
      { rest: "Inspect", desc: "Free repair estimates and 24-hour report turnarounds." },
    ],
    testimonials: [{ names: "Drew & Anya", rating: 5 }],
  },
  features: { showFamily: true, ghlChat: true, aiAssistant: true },
};

// ---------------------------------------------------------------------------
// Derive-helpers (legal strings) — pure, called server-side
// ---------------------------------------------------------------------------

/** Comma-joined licensed-state codes for disclosure copy. */
export function statesLine(c: TenantConfig): string {
  return c.legal.states.map((s) => s.code).join(", ");
}

/** Full footer legal strip. Identical to the pre-Phase-B LEGAL_STRIP for MSFG. */
export function buildLegalStrip(c: TenantConfig): string {
  return `${c.brand.legalName}. NMLS #${c.contact.nmls} [PLACEHOLDER]. Equal Housing Lender. Licensed in ${statesLine(c)}. Loans subject to credit and property approval. Rates and terms subject to change without notice. ${c.brand.assistantName} provides general information and estimates only and is not a commitment to lend. © ${c.brand.foundedYear}–2026 ${c.brand.shortName}, LLC.`;
}

/** Short marketing/automated-contact consent microcopy (TCPA). */
export function buildConsentTcpa(c: TenantConfig): string {
  return `By submitting, you agree that ${c.brand.shortName} and its affiliates may contact you about your inquiry by phone, text, and email — including via automated technology — at the number and address provided. Consent is not a condition of any purchase. Message and data rates may apply.`;
}

/**
 * Apply-flow testimonial caption, e.g. "Drew & Anya, MSFG customers". The brand
 * token is sourced from `shortName` (the customer names stay tenant content), so
 * a config swap renames the brand without touching the names.
 */
export function buildTestimonialCaption(c: TenantConfig, t: Testimonial): string {
  return `${t.names}, ${c.brand.shortName} customers`;
}

// ---------------------------------------------------------------------------
// Backward-compat shim — for the not-yet-migrated importers (env, auth routes,
// openapi, ai-chat). Removed once those move to config in later phases.
// NOTE: `url`/`env` read process.env directly (NOT serverEnv) to avoid a
// circular import — src/lib/env.ts imports this module.
// ---------------------------------------------------------------------------

const D = DEFAULT_TENANT_CONFIG;

/** Legacy flat config object preserving the OLD shape for unmigrated importers. */
export const SITE = {
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://msfg.us",
  env: process.env.NEXT_PUBLIC_SITE_ENV ?? "development",
  legalName: D.brand.legalName,
  shortName: D.brand.shortName,
  foundedYear: D.brand.foundedYear,
  nmls: D.contact.nmls,
  nmlsConsumerAccessUrl: D.contact.nmlsConsumerAccessUrl,
  phoneDisplay: D.contact.phoneDisplay,
  phoneHref: D.contact.phoneHref,
  email: D.contact.email,
  tagline: D.marketing!.tagline,
  states: D.legal.states,
  stats: D.marketing!.stats,
} as const;

/** @deprecated use `statesLine(config)`. */
export const STATES_LINE = statesLine(D);
/** @deprecated use `buildLegalStrip(config)`. */
export const LEGAL_STRIP = buildLegalStrip(D);
/** @deprecated use `buildConsentTcpa(config)`. */
export const CONSENT_TCPA = buildConsentTcpa(D);
/** @deprecated use `config.legal.ratesDisclaimer`. */
export const RATES_DISCLAIMER = D.legal.ratesDisclaimer;
/** @deprecated use `config.legal.texasNotice`. */
export const TEXAS_NOTICE = D.legal.texasNotice;
/** @deprecated use `config.marketing.familyOfCompanies`. */
export const FAMILY_OF_COMPANIES = D.marketing!.familyOfCompanies;
/** @deprecated use `config.marketing.footerFamily`. */
export const FOOTER_FAMILY = D.marketing!.footerFamily;

export type FamilyCompany = (typeof FAMILY_OF_COMPANIES)[number];
