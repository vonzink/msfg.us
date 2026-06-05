# Phase B — Per-tenant Config, Runtime Theming & SEO — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make MSFG render entirely from a typed, validated per-tenant `TenantConfig` (brand, theme tokens, contact, legal, SEO, marketing) loaded off the Phase-A resolved tenant — pixel-identical today — so adding a company becomes config + seed, never code.

**Architecture:** A Zod `TenantConfigSchema` + `DEFAULT_TENANT_CONFIG` live in `src/content/site.ts` (which also keeps a backward-compat `SITE` shim for not-yet-migrated importers). Config is stored in a nullable `Tenant.config` JSON column, read through a request-cached `getTenantConfig()` accessor that mirrors the Phase-A `getTenantDb()` cache. A server-rendered `<TenantTheme>` `<style>` tag in `<head>` overrides the Tailwind-v4 `@theme` CSS variables before paint; server components read config directly while client components receive the specific strings they need via props. SEO surfaces (metadata, JSON-LD, sitemap, robots) derive every absolute URL from a `tenantOrigin(tenant)` helper.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript (strict), Tailwind v4 (@theme CSS vars), Prisma 7 + @prisma/adapter-pg, Zod, Vitest. Path alias `@/*` → `src/*`. Package manager: npm.

---

## File map

**Created**
- `src/server/tenant/config.ts` — `getTenantConfig()` (per-`tenant.id` cached, Zod parse + fallback) and `tenantOrigin(tenant)` / `getTenantOrigin()` canonical-origin helpers.
- `src/server/tenant/config.test.ts` — Vitest: config parse/fallback + `tenantOrigin` dedicated vs shared (mocked tenant, no DB).
- `src/content/site.test.ts` — Vitest: schema parses `DEFAULT_TENANT_CONFIG`, partial config fills defaults, derive-helpers byte-identical to today's literal strings.
- `src/components/theme/TenantTheme.tsx` — async server component emitting a `<style>:root{…}</style>` mapping `config.theme` → CSS var names.
- `src/components/theme/tenantThemeCss.ts` — pure `buildTenantThemeCss(theme)` string builder (so it is unit-testable without rendering).
- `src/components/theme/tenantThemeCss.test.ts` — Vitest: CSS string contains the mapped vars; swap-proof second-tenant assertion.
- `prisma/migrations/20260604200000_add_tenant_config/migration.sql` — `ALTER TABLE "tenants" ADD COLUMN "config" JSONB;`.

**Modified**
- `src/content/site.ts` — rewritten into `TenantConfigSchema` + `type TenantConfig` + `DEFAULT_TENANT_CONFIG` + derive-helpers (`buildLegalStrip`, `buildConsentTcpa`, `statesLine`) + backward-compat shim (`SITE`, `STATES_LINE`, `LEGAL_STRIP`, `CONSENT_TCPA`, `RATES_DISCLAIMER`, `TEXAS_NOTICE`, `FAMILY_OF_COMPANIES`, `FOOTER_FAMILY`, `FamilyCompany`).
- `prisma/schema.prisma` — add `config Json?` to `Tenant`.
- `prisma/seed.ts` — `seedTenant()` sets `config: DEFAULT_TENANT_CONFIG` on create and update.
- `src/app/layout.tsx` — render `<TenantTheme />` in `<head>`; static `metadata` → `generateMetadata()` from config + origin.
- `src/lib/schema.ts` — `localBusinessSchema(config, origin)`.
- `src/app/(marketing)/page.tsx` — call `localBusinessSchema(await getTenantConfig(), await getTenantOrigin())`.
- `src/app/sitemap.ts` — async, `${await getTenantOrigin()}${route}`.
- `src/app/robots.ts` — async, origin from `getTenantOrigin()`, env check via `process.env.NEXT_PUBLIC_SITE_ENV`.
- `src/components/Footer.tsx` — async server component reading config + `buildLegalStrip`.
- `src/components/home/Hero.tsx` — async server component reading `config.marketing.stats`.
- `src/components/home/Family.tsx` — async server component reading `config.marketing.familyOfCompanies` + `config.brand.shortName`.
- `src/components/nav/Nav.tsx` — async server component reading `config.contact.phoneHref` + `config.brand.shortName`, passing props to `MobileDrawer`.
- `src/components/officers/OfficerCard.tsx` — takes a `states` prop (state-name lookup) from its server parent.
- `src/app/(marketing)/rates/page.tsx` — async, reads `config.legal.ratesDisclaimer`.
- `src/app/(marketing)/developers/page.tsx` — async, base URL from `getTenantOrigin()`.
- `src/components/apply/Wizard.tsx` (client) — takes `phoneHref`/`phoneDisplay`/`consentTcpa` props, threads `consentTcpa` to `FormStep`.
- `src/components/apply/steps/FormStep.tsx` (client) — takes `consentTcpa` prop.
- `src/components/nav/MobileDrawer.tsx` (client) — takes `phoneHref`/`shortName` props.
- `src/components/officers/OfficerDirectory.tsx` (client) — takes `states` prop.
- `src/app/apply/[intent]/page.tsx` (server) — resolves config, passes props to `Wizard`.
- `src/app/(marketing)/loan-officers/page.tsx` (server) — resolves config, passes `states` to `OfficerDirectory`.

**Untouched on purpose (backward-compat shim consumers — migrated in later phases):** `src/lib/env.ts`, `src/app/auth/logout/route.ts`, `src/app/auth/callback/route.ts`, `src/app/api/v1/public/openapi.json/route.ts`, `src/app/api/v1/ai/chat/route.ts`. These keep importing `SITE`/`RATES_DISCLAIMER`/etc. from `@/content/site` unchanged.

---

## Conventions to MATCH (from Phase A)

- **`server-only` guard:** `getTenantConfig()` and `tenantOrigin`'s wrapper live in a module that starts with `import "server-only";` (like `resolve.ts`). Tests alias `server-only` to the no-op stub via `vitest.config.ts` (already configured).
- **Per-id cache:** mirror `getTenantDb()` in `src/lib/db.ts` — a module-level `const cache = new Map<string, …>()` keyed by `tenant.id`, populated on first miss.
- **Tenant resolution:** call `getTenant()` from `@/server/tenant/resolve`; never read the DB directly for the tenant.
- **Env mode:** read `serverEnv.TENANT_MODE` exactly as `resolve.ts` does (`serverEnv.TENANT_MODE === "dedicated"`).
- **Vitest style:** `import { describe, it, expect } from "vitest";`, pure functions tested without Prisma, files end in `.test.ts` under `src/**`.
- **No `Date.now()`/`new Date()` at module/render scope** in statically-generated pages (the affected pages here are request-time route handlers / dynamic config reads, so this stays satisfied).

---

## Task 1 — Rewrite `src/content/site.ts`: schema + defaults + helpers + compat shim

**Files:**
- Modify: `src/content/site.ts`
- Test: `src/content/site.test.ts` (create)

This is the contract source. The schema's defaults ARE MSFG's values pulled verbatim from today's `site.ts` and `globals.css`, so `DEFAULT_TENANT_CONFIG` renders byte-identical.

- [ ] Write the failing test first. Create `src/content/site.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  TenantConfigSchema,
  DEFAULT_TENANT_CONFIG,
  buildLegalStrip,
  buildConsentTcpa,
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
});
```

- [ ] Run it (expected **FAIL** — `./site` does not yet export `TenantConfigSchema`/`DEFAULT_TENANT_CONFIG`/helpers):
  ```bash
  npx vitest run src/content/site.test.ts
  ```

- [ ] Implement. Replace the entire contents of `src/content/site.ts` with:

```ts
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
});

const StatSchema = z.object({ num: z.string(), label: z.string() });
const FamilyCardSchema = z.object({
  rest: z.string(),
  href: z.string(),
  desc: z.string(),
});
const FooterFamilySchema = z.object({ rest: z.string(), desc: z.string() });

const MarketingSchema = z.object({
  tagline: z.string(),
  stats: z.array(StatSchema),
  familyOfCompanies: z.array(FamilyCardSchema),
  footerFamily: z.array(FooterFamilySchema),
});

const FeaturesSchema = z.object({
  showFamily: z.boolean(),
  ghlChat: z.boolean(),
  aiAssistant: z.boolean(),
});

export const TenantConfigSchema = z.object({
  brand: BrandSchema,
  theme: ThemeSchema.default({}),
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
  return `${c.brand.legalName}. NMLS #${c.contact.nmls} [PLACEHOLDER]. Equal Housing Lender. Licensed in ${statesLine(c)}. Loans subject to credit and property approval. Rates and terms subject to change without notice. ${c.brand.shortName} AI provides general information and estimates only and is not a commitment to lend. © ${c.brand.foundedYear}–2026 ${c.brand.shortName}, LLC.`;
}

/** Short marketing/automated-contact consent microcopy (TCPA). */
export function buildConsentTcpa(c: TenantConfig): string {
  return `By submitting, you agree that ${c.brand.shortName} and its affiliates may contact you about your inquiry by phone, text, and email — including via automated technology — at the number and address provided. Consent is not a condition of any purchase. Message and data rates may apply.`;
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
```

- [ ] Run it (expected **PASS**):
  ```bash
  npx vitest run src/content/site.test.ts
  ```

- [ ] Commit:
  ```bash
  git add src/content/site.ts src/content/site.test.ts
  git commit -m "feat(tenant): TenantConfig schema + MSFG defaults + derive-helpers + compat shim"
  ```

---

## Task 2 — DB: `Tenant.config` column + migration + seed

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260604200000_add_tenant_config/migration.sql`
- Modify: `prisma/seed.ts`

> **Orchestrator-owned / go-ahead-gated:** authoring the migration file + schema edit is in scope now. **Applying** it to the live `msfg_web` DB (`prisma migrate deploy`) and re-seeding is gated on explicit user go-ahead and is performed in Task 8 by the orchestrator — the same discipline as Phase A. Do NOT run `prisma migrate dev`/`deploy` against the live DB here.

- [ ] Add `config Json?` to the `Tenant` model in `prisma/schema.prisma`. Change:
  ```prisma
  model Tenant {
    id        String   @id @default(cuid())
    slug      String   @unique
    name      String
    domains   String[] @default([])
    status    String   @default("active")
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt

    @@map("tenants")
  }
  ```
  to:
  ```prisma
  model Tenant {
    id        String   @id @default(cuid())
    slug      String   @unique
    name      String
    domains   String[] @default([])
    status    String   @default("active")
    /// Per-tenant config (brand/theme/contact/legal/seo/marketing/features),
    /// validated by TenantConfigSchema (src/content/site.ts). Nullable so the
    /// resolver falls back to DEFAULT_TENANT_CONFIG when absent.
    config    Json?
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt

    @@map("tenants")
  }
  ```

- [ ] Regenerate the Prisma client so `tenant.config` is typed and `config` is accepted on writes (no DB connection needed):
  ```bash
  npx prisma generate
  ```

- [ ] Create `prisma/migrations/20260604200000_add_tenant_config/migration.sql` (timestamp lexically AFTER `20260604190000_add_tenant_scoping`) with exactly:
  ```sql
  -- Add per-tenant config JSON to tenants (nullable; resolver falls back to
  -- DEFAULT_TENANT_CONFIG when absent).
  ALTER TABLE "tenants" ADD COLUMN "config" JSONB;
  ```

- [ ] Update `prisma/seed.ts`. Add the import at the top of the imports block (after the existing `@/content/*` imports):
  ```ts
  import { DEFAULT_TENANT_CONFIG } from "@/content/site";
  import type { Prisma } from "@prisma/client";
  ```
  Then change `seedTenant()` from:
  ```ts
  async function seedTenant() {
    await prisma.tenant.upsert({
      where: { slug: "msfg" },
      update: {},
      create: { id: TENANT_ID, slug: "msfg", name: "Mountain State Financial Group" },
    });
  }
  ```
  to:
  ```ts
  async function seedTenant() {
    // DEFAULT_TENANT_CONFIG is MSFG's config; cast through the Prisma JSON input
    // type so the structured object is accepted on the `config Json?` column.
    const config = DEFAULT_TENANT_CONFIG as unknown as Prisma.InputJsonValue;
    await prisma.tenant.upsert({
      where: { slug: "msfg" },
      update: { config },
      create: {
        id: TENANT_ID,
        slug: "msfg",
        name: "Mountain State Financial Group",
        config,
      },
    });
  }
  ```

- [ ] Type-check (no DB connection — proves schema/seed/client compile together):
  ```bash
  npx tsc --noEmit
  ```
  Expected: no errors.

- [ ] Commit:
  ```bash
  git add prisma/schema.prisma prisma/migrations/20260604200000_add_tenant_config/migration.sql prisma/seed.ts
  git commit -m "feat(tenant): add Tenant.config column + migration + seed MSFG config"
  ```

---

## Task 3 — Accessors: `src/server/tenant/config.ts` (`getTenantConfig`, `tenantOrigin`, `getTenantOrigin`)

**Files:**
- Create: `src/server/tenant/config.ts`
- Test: `src/server/tenant/config.test.ts` (create)

`getTenantConfig()` mirrors `getTenantDb()`'s per-`tenant.id` cache (src/lib/db.ts). `tenantOrigin(tenant)` is pure (no `server-only`, no DB) so it's unit-testable directly; `getTenantOrigin()` is the async wrapper that resolves the current tenant.

Note: `TenantContext` (from `./types`) carries `{ id, slug, name }` — it does NOT include `domains`. `tenantOrigin` therefore takes the minimal shape it needs (`{ domains?: string[] }`), which the DB `Tenant` row satisfies and tests can mock. `getTenantOrigin()` reads the tenant row's `domains` via the resolved context's `slug`… but since `getTenant()` returns only `{id,slug,name}`, `getTenantOrigin()` loads the row's domains through `getDb()` once (cached by the same map). To keep it simple and dependency-light, `getTenantOrigin()` is implemented in terms of the cached config-less path below.

- [ ] Write the failing test first. Create `src/server/tenant/config.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// resolve.ts pulls next/headers + the DB; we only exercise the pure parse +
// origin logic here, so stub the modules config.ts imports.
vi.mock("./resolve", () => ({ getTenant: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));

import { parseTenantConfig, tenantOrigin } from "./config";
import { DEFAULT_TENANT_CONFIG } from "@/content/site";

beforeEach(() => {
  vi.unstubAllEnvs();
});

describe("parseTenantConfig", () => {
  it("returns DEFAULT when config is null", () => {
    expect(parseTenantConfig(null)).toEqual(DEFAULT_TENANT_CONFIG);
  });

  it("returns DEFAULT when config is invalid", () => {
    expect(parseTenantConfig({ brand: { shortName: 123 } })).toEqual(
      DEFAULT_TENANT_CONFIG,
    );
  });

  it("parses a valid config and fills theme defaults", () => {
    const valid = {
      ...DEFAULT_TENANT_CONFIG,
      brand: { ...DEFAULT_TENANT_CONFIG.brand, shortName: "Acme" },
    };
    const parsed = parseTenantConfig(valid);
    expect(parsed.brand.shortName).toBe("Acme");
    expect(parsed.theme.green800).toBe("#0b3d30");
  });
});

describe("tenantOrigin", () => {
  it("dedicated mode prefers NEXT_PUBLIC_SITE_URL", () => {
    vi.stubEnv("TENANT_MODE", "dedicated");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://msfg.us");
    expect(tenantOrigin({ domains: ["example.com"] })).toBe("https://msfg.us");
  });

  it("dedicated mode falls back to the first domain when no env URL", () => {
    vi.stubEnv("TENANT_MODE", "dedicated");
    expect(tenantOrigin({ domains: ["acme.com"] })).toBe("https://acme.com");
  });

  it("dedicated mode falls back to msfg.us when nothing else", () => {
    vi.stubEnv("TENANT_MODE", "dedicated");
    expect(tenantOrigin({ domains: [] })).toBe("https://msfg.us");
  });

  it("shared mode uses https + the first domain", () => {
    vi.stubEnv("TENANT_MODE", "shared");
    expect(tenantOrigin({ domains: ["acme.com"] })).toBe("https://acme.com");
  });

  it("shared mode falls back to msfg.us when no domains", () => {
    vi.stubEnv("TENANT_MODE", "shared");
    expect(tenantOrigin({ domains: [] })).toBe("https://msfg.us");
  });
});
```

- [ ] Run it (expected **FAIL** — `./config` does not exist yet):
  ```bash
  npx vitest run src/server/tenant/config.test.ts
  ```

- [ ] Implement. Create `src/server/tenant/config.ts`:

```ts
import "server-only";
import { getDb } from "@/lib/db";
import { getTenant } from "./resolve";
import { serverEnv } from "@/lib/env";
import {
  TenantConfigSchema,
  DEFAULT_TENANT_CONFIG,
  type TenantConfig,
} from "@/content/site";

/**
 * Parse a raw `tenant.config` value into a typed TenantConfig, falling back to
 * DEFAULT_TENANT_CONFIG when null or invalid. Pure + unit-tested (no DB).
 */
export function parseTenantConfig(raw: unknown): TenantConfig {
  if (raw == null) return DEFAULT_TENANT_CONFIG;
  const result = TenantConfigSchema.safeParse(raw);
  return result.success ? result.data : DEFAULT_TENANT_CONFIG;
}

/**
 * The minimal tenant shape `tenantOrigin` needs. The Prisma `Tenant` row (which
 * carries `domains String[]`) satisfies this; tests pass a literal.
 */
type OriginTenant = { domains?: string[] | null };

/**
 * Canonical origin (scheme + host, no trailing slash) for a tenant. Mirrors how
 * resolve.ts reads `serverEnv.TENANT_MODE`:
 *  - dedicated → NEXT_PUBLIC_SITE_URL, else the first domain, else https://msfg.us.
 *  - shared    → https://<first domain>, else https://msfg.us.
 * Pure-ish (reads env only) so it's directly unit-testable.
 */
export function tenantOrigin(tenant: OriginTenant): string {
  const domains = tenant.domains ?? [];
  const first = domains[0];
  if (serverEnv.TENANT_MODE === "dedicated") {
    return (
      process.env.NEXT_PUBLIC_SITE_URL ??
      (first ? `https://${first}` : "https://msfg.us")
    );
  }
  return first ? `https://${first}` : "https://msfg.us";
}

// Config is tiny + stable within a process; cache by tenant.id (mirrors the
// getTenantDb scoped-client cache in src/lib/db.ts).
const configCache = new Map<string, TenantConfig>();

/** Resolve + parse + cache the active tenant's config. */
export async function getTenantConfig(): Promise<TenantConfig> {
  const tenant = await getTenant();
  const cached = configCache.get(tenant.id);
  if (cached) return cached;

  const row = await getDb().tenant.findUnique({
    where: { id: tenant.id },
    select: { config: true },
  });
  const config = parseTenantConfig(row?.config ?? null);
  configCache.set(tenant.id, config);
  return config;
}

// Origin is likewise stable per tenant; cache by tenant.id.
const originCache = new Map<string, string>();

/** Canonical origin for the active tenant (resolves the row's domains once). */
export async function getTenantOrigin(): Promise<string> {
  const tenant = await getTenant();
  const cached = originCache.get(tenant.id);
  if (cached) return cached;

  const row = await getDb().tenant.findUnique({
    where: { id: tenant.id },
    select: { domains: true },
  });
  const origin = tenantOrigin({ domains: row?.domains ?? [] });
  originCache.set(tenant.id, origin);
  return origin;
}
```

- [ ] Run it (expected **PASS**):
  ```bash
  npx vitest run src/server/tenant/config.test.ts
  ```

- [ ] Commit:
  ```bash
  git add src/server/tenant/config.ts src/server/tenant/config.test.ts
  git commit -m "feat(tenant): getTenantConfig + tenantOrigin accessors (per-id cached)"
  ```

---

## Task 4 — Runtime theming + layout metadata

**Files:**
- Create: `src/components/theme/tenantThemeCss.ts`
- Create: `src/components/theme/TenantTheme.tsx`
- Test: `src/components/theme/tenantThemeCss.test.ts` (create)
- Modify: `src/app/layout.tsx`

The CSS-string builder is pure (testable); `<TenantTheme>` is the thin async server component that fetches config and renders the `<style>`. Each `theme` field maps to the exact CSS var name in `globals.css`.

- [ ] Write the failing test first. Create `src/components/theme/tenantThemeCss.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildTenantThemeCss } from "./tenantThemeCss";
import { DEFAULT_TENANT_CONFIG } from "@/content/site";

describe("buildTenantThemeCss", () => {
  it("maps MSFG theme tokens to the correct CSS variable names", () => {
    const css = buildTenantThemeCss(DEFAULT_TENANT_CONFIG.theme);
    expect(css.startsWith(":root{")).toBe(true);
    expect(css.endsWith("}")).toBe(true);
    expect(css).toContain("--color-green-800:#0b3d30;");
    expect(css).toContain("--color-spring:#1fb463;");
    expect(css).toContain("--color-spring-soft:rgba(31, 180, 99, 0.14);");
    expect(css).toContain("--color-mint:#7fe3a8;");
    expect(css).toContain("--color-on-dark:rgba(255, 255, 255, 0.92);");
    expect(css).toContain("--radius-md:9px;");
    expect(css).toContain("--lip:#0c6b39;");
    expect(css).toContain(
      '--font-sans:var(--font-hanken), system-ui, -apple-system, "Segoe UI", sans-serif;',
    );
  });

  it("reflects a swapped second-tenant theme (swap proof)", () => {
    const css = buildTenantThemeCss({
      ...DEFAULT_TENANT_CONFIG.theme,
      green800: "#101820",
      spring: "#ff8800",
      mint: "#ffd1a3",
      radiusMd: "2px",
    });
    expect(css).toContain("--color-green-800:#101820;");
    expect(css).toContain("--color-spring:#ff8800;");
    expect(css).toContain("--color-mint:#ffd1a3;");
    expect(css).toContain("--radius-md:2px;");
    // Untouched tokens keep MSFG values.
    expect(css).toContain("--color-ink:#0b231c;");
  });
});
```

- [ ] Run it (expected **FAIL** — `./tenantThemeCss` does not exist):
  ```bash
  npx vitest run src/components/theme/tenantThemeCss.test.ts
  ```

- [ ] Implement the builder. Create `src/components/theme/tenantThemeCss.ts`:

```ts
import type { TenantConfig } from "@/content/site";

type Theme = TenantConfig["theme"];

/**
 * Build the `:root{…}` CSS that overrides the Tailwind-v4 `@theme` variables
 * (src/app/globals.css) with a tenant's theme values. Each field maps 1:1 to a
 * CSS variable name. Injected uniformly for every tenant (MSFG's is a harmless
 * echo of the build-time defaults). Pure → unit-tested.
 */
export function buildTenantThemeCss(theme: Theme): string {
  const v: Array<[string, string]> = [
    // Deep emerald system
    ["--color-green-900", theme.green900],
    ["--color-green-850", theme.green850],
    ["--color-green-800", theme.green800],
    ["--color-green-700", theme.green700],
    ["--color-green-600", theme.green600],
    ["--color-green-glow", theme.greenGlow],
    // Action green
    ["--color-spring", theme.spring],
    ["--color-spring-2", theme.spring2],
    ["--color-spring-3", theme.spring3],
    ["--color-spring-soft", theme.springSoft],
    // Headline accent
    ["--color-mint", theme.mint],
    // Neutrals
    ["--color-ink", theme.ink],
    ["--color-paper", theme.paper],
    ["--color-paper-2", theme.paper2],
    ["--color-muted", theme.muted],
    ["--color-line", theme.line],
    // On-dark text + hairlines
    ["--color-on-dark", theme.onDark],
    ["--color-on-dark-2", theme.onDark2],
    ["--color-on-dark-3", theme.onDark3],
    ["--color-hair-dark", theme.hairDark],
    // Radii
    ["--radius-sm", theme.radiusSm],
    ["--radius-md", theme.radiusMd],
    ["--radius-lg", theme.radiusLg],
    ["--radius-xl", theme.radiusXl],
    // Non-utility tokens
    ["--lip", theme.lip],
    ["--font-sans", theme.fontFamily],
  ];
  const body = v.map(([name, value]) => `${name}:${value};`).join("");
  return `:root{${body}}`;
}
```

- [ ] Run it (expected **PASS**):
  ```bash
  npx vitest run src/components/theme/tenantThemeCss.test.ts
  ```

- [ ] Implement the component. Create `src/components/theme/TenantTheme.tsx`:

```tsx
import { getTenantConfig } from "@/server/tenant/config";
import { buildTenantThemeCss } from "./tenantThemeCss";

/**
 * Server component: emits a `<style>` overriding the Tailwind `@theme` CSS
 * variables with the active tenant's theme. Rendered in the root layout `<head>`
 * so it is SSR'd before paint → no FOUC/CLS. Only variable *values* change;
 * components, class names, and utilities are untouched.
 */
export async function TenantTheme() {
  const config = await getTenantConfig();
  const css = buildTenantThemeCss(config.theme);
  return <style data-tenant-theme dangerouslySetInnerHTML={{ __html: css }} />;
}
```

- [ ] Modify `src/app/layout.tsx`. Replace its full contents with (adds the `<head>` + `<TenantTheme/>`, converts `metadata` → `generateMetadata()` reading config + origin, keeps the Hanken wiring and env-aware robots):

```tsx
import type { Metadata } from "next";
import { Hanken_Grotesk } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { GhlChat } from "@/components/integrations/GhlChat";
import { TenantTheme } from "@/components/theme/TenantTheme";
import { getTenantConfig, getTenantOrigin } from "@/server/tenant/config";

const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-hanken",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const [config, origin] = await Promise.all([
    getTenantConfig(),
    getTenantOrigin(),
  ]);
  const { seo } = config;
  // Staging and preview environments must never be indexed.
  const isProd = process.env.NEXT_PUBLIC_SITE_ENV === "production";
  return {
    metadataBase: new URL(origin),
    title: {
      default: seo.titleDefault,
      template: seo.titleTemplate,
    },
    description: seo.description,
    applicationName: config.brand.shortName,
    keywords: seo.keywords,
    openGraph: {
      type: "website",
      siteName: seo.siteName,
      url: origin,
      title: seo.ogTitle,
      description: seo.ogDescription,
      ...(seo.ogImage ? { images: [{ url: seo.ogImage }] } : {}),
    },
    robots: isProd
      ? { index: true, follow: true }
      : { index: false, follow: false },
  };
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={hanken.variable}>
      <head>
        {/* Per-tenant CSS-var overrides — SSR'd before paint (no FOUC/CLS). */}
        <TenantTheme />
      </head>
      <body className="min-h-screen">
        {children}
        {/* Site-wide LeadConnector live-agent chat (renders nothing unless
            NEXT_PUBLIC_GHL_CHAT_WIDGET_ID is set). Distinct from the homepage
            AI assistant. */}
        <GhlChat />
        {/* Vercel observability — both no-op outside Vercel/dev, so they're
            safe to mount unconditionally. */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
```

> Note: `<TenantTheme/>` is an async server component rendered inside `<head>`. Next.js 16 App Router supports async components in `<head>`; before writing, confirm against `node_modules/next/dist/docs/` (the metadata/head guidance) per AGENTS.md. If a raw `<style>` in `<head>` is disallowed in this Next build, fall back to rendering `<TenantTheme/>` as the FIRST child of `<body>` — still SSR'd before content paints; keep the rest identical.

- [ ] Commit:
  ```bash
  git add src/components/theme/tenantThemeCss.ts src/components/theme/tenantThemeCss.test.ts src/components/theme/TenantTheme.tsx src/app/layout.tsx
  git commit -m "feat(theme): runtime per-tenant CSS-var theming + config-driven metadata"
  ```

---

## Task 5 — SEO surfaces (JSON-LD, sitemap, robots)

**Files:**
- Modify: `src/lib/schema.ts`
- Modify: `src/app/(marketing)/page.tsx`
- Modify: `src/app/sitemap.ts`
- Modify: `src/app/robots.ts`

- [ ] Modify `src/lib/schema.ts`. Replace its full contents with:

```ts
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
```

- [ ] Modify `src/app/(marketing)/page.tsx`. Make `HomePage` async and pass config + origin. Replace its full contents with:

```tsx
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
```

- [ ] Modify `src/app/sitemap.ts`. Replace its full contents with (async default fn; route list + priorities unchanged):

```ts
import type { MetadataRoute } from "next";
import { getTenantOrigin } from "@/server/tenant/config";

const ROUTES = [
  "",
  "/buy",
  "/refinance",
  "/home-equity",
  "/rates",
  "/loan-officers",
  "/apply/buy",
  "/apply/refi",
  "/apply/cash",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = await getTenantOrigin();
  return ROUTES.map((route) => ({
    url: `${origin}${route}`,
    changeFrequency: route === "/rates" ? "daily" : "weekly",
    priority: route === "" ? 1 : route.startsWith("/apply") ? 0.6 : 0.8,
  }));
}
```

- [ ] Modify `src/app/robots.ts`. Replace its full contents with (async; env check via `process.env.NEXT_PUBLIC_SITE_ENV`; noindex behavior preserved):

```ts
import type { MetadataRoute } from "next";
import { getTenantOrigin } from "@/server/tenant/config";

/** Staging/preview environments are fully disallowed so they never get
 *  indexed; production allows everything except API routes. */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const isProd = process.env.NEXT_PUBLIC_SITE_ENV === "production";
  if (!isProd) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }
  const origin = await getTenantOrigin();
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/"] }],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
```

- [ ] Type-check:
  ```bash
  npx tsc --noEmit
  ```
  Expected: no errors (the old `localBusinessSchema()` zero-arg caller is now updated).

- [ ] Commit:
  ```bash
  git add src/lib/schema.ts "src/app/(marketing)/page.tsx" src/app/sitemap.ts src/app/robots.ts
  git commit -m "feat(seo): tenant-origin-driven JSON-LD, sitemap, and robots"
  ```

---

## Task 6 — Server visible components read config

Each becomes an `async` server component that calls `const config = await getTenantConfig();` and replaces `SITE.*` / `LEGAL_STRIP` / `FAMILY_OF_COMPANIES` / `FOOTER_FAMILY` / `RATES_DISCLAIMER` reads with config/helper reads. (`OfficerDirectory`'s `states` prop is set up in Task 7 — `OfficerCard` here takes a `states` prop because its parent `OfficerDirectory` is a client component.)

**Files:**
- Modify: `src/components/Footer.tsx`
- Modify: `src/components/home/Hero.tsx`
- Modify: `src/components/home/Family.tsx`
- Modify: `src/components/nav/Nav.tsx`
- Modify: `src/components/officers/OfficerCard.tsx`
- Modify: `src/app/(marketing)/rates/page.tsx`
- Modify: `src/app/(marketing)/developers/page.tsx`

### 6a. `src/components/Footer.tsx`

- [ ] Change the import line:
  ```ts
  import { SITE, FOOTER_FAMILY, LEGAL_STRIP } from "@/content/site";
  ```
  to:
  ```ts
  import { buildLegalStrip } from "@/content/site";
  import { getTenantConfig } from "@/server/tenant/config";
  ```
- [ ] Make the component async + load config. Change:
  ```ts
  export function Footer() {
    return (
  ```
  to:
  ```ts
  export async function Footer() {
    const config = await getTenantConfig();
    const legalStrip = buildLegalStrip(config);
    return (
  ```
- [ ] Replace `{SITE.tagline}` with `{config.marketing?.tagline}`.
- [ ] Replace `{FOOTER_FAMILY.map((c) => (` with `{config.marketing?.footerFamily.map((c) => (`.
- [ ] Inside the brand span, replace the hardcoded `MSFG` text with `{config.brand.shortName}` (the `<span className="text-[26px] …">MSFG</span>`).
- [ ] In the footer-family rows, replace the hardcoded `MSFG` (`<span className="font-extrabold text-green-600">MSFG</span>`) with `{config.brand.shortName}`.
- [ ] Replace `` href={`mailto:${SITE.email}`} `` with `` href={`mailto:${config.contact.email}`} `` and the link text `{SITE.email}` with `{config.contact.email}`.
- [ ] Replace `href={SITE.phoneHref}` with `href={config.contact.phoneHref}` and `{SITE.phoneDisplay}` with `{config.contact.phoneDisplay}`.
- [ ] Replace `{LEGAL_STRIP} Hosted on AWS.` with `{legalStrip} Hosted on AWS.`.

### 6b. `src/components/home/Hero.tsx`

- [ ] Change the import:
  ```ts
  import { SITE } from "@/content/site";
  ```
  to:
  ```ts
  import { getTenantConfig } from "@/server/tenant/config";
  ```
- [ ] Change:
  ```ts
  export function Hero() {
    return (
  ```
  to:
  ```ts
  export async function Hero() {
    const config = await getTenantConfig();
    return (
  ```
- [ ] Replace `{SITE.stats.map((s) => (` with `{config.marketing?.stats.map((s) => (`.

### 6c. `src/components/home/Family.tsx`

- [ ] Change the import:
  ```ts
  import { FAMILY_OF_COMPANIES } from "@/content/site";
  ```
  to:
  ```ts
  import { getTenantConfig } from "@/server/tenant/config";
  ```
- [ ] Change:
  ```ts
  export function Family() {
    return (
  ```
  to:
  ```ts
  export async function Family() {
    const config = await getTenantConfig();
    return (
  ```
- [ ] Replace `{FAMILY_OF_COMPANIES.map((c) => (` with `{config.marketing?.familyOfCompanies.map((c) => (`.
- [ ] Replace the hardcoded card title `MSFG <span className="font-medium text-muted">{c.rest}</span>` with `{config.brand.shortName} <span className="font-medium text-muted">{c.rest}</span>`.

### 6d. `src/components/nav/Nav.tsx`

(`MobileDrawer` is a client child — Task 7 adds its props; here Nav resolves config and passes them.)

- [ ] Change the import:
  ```ts
  import { SITE } from "@/content/site";
  ```
  to:
  ```ts
  import { getTenantConfig } from "@/server/tenant/config";
  ```
- [ ] Change:
  ```ts
  export function Nav() {
    return (
  ```
  to:
  ```ts
  export async function Nav() {
    const config = await getTenantConfig();
    return (
  ```
- [ ] Replace the logo `aria-label="MSFG home"` with `aria-label={`${config.brand.shortName} home`}`.
- [ ] Replace the brand text span content `MSFG` (`<span className="text-[23px] …">MSFG</span>`) with `{config.brand.shortName}`.
- [ ] Replace `href={SITE.phoneHref}` (the call link) with `href={config.contact.phoneHref}`.
- [ ] Replace `<MobileDrawer />` with `<MobileDrawer phoneHref={config.contact.phoneHref} shortName={config.brand.shortName} />`.

### 6e. `src/components/officers/OfficerCard.tsx`

`OfficerCard` is rendered by the client `OfficerDirectory`, so it cannot call `getTenantConfig()`. It takes a `states` prop (the licensed-state list) for its `stateName` lookup; the server page passes it down (Task 7).

- [ ] Change the import:
  ```ts
  import { officerInitials, type Officer } from "@/content/officers";
  import { SITE } from "@/content/site";
  ```
  to:
  ```ts
  import { officerInitials, type Officer } from "@/content/officers";
  import type { TenantConfig } from "@/content/site";
  ```
- [ ] Replace the module-level `stateName` helper:
  ```ts
  /** Full state name for a USPS code, falling back to the code itself. */
  function stateName(code: string): string {
    return SITE.states.find((s) => s.code === code)?.name ?? code;
  }
  ```
  with a `states`-parameterized helper:
  ```ts
  type StateRef = TenantConfig["legal"]["states"][number];

  /** Full state name for a USPS code, falling back to the code itself. */
  function stateName(code: string, states: StateRef[]): string {
    return states.find((s) => s.code === code)?.name ?? code;
  }
  ```
- [ ] Add the `states` prop to the component signature. Change:
  ```ts
  export function OfficerCard({ officer }: { officer: Officer }) {
  ```
  to:
  ```ts
  export function OfficerCard({
    officer,
    states,
  }: {
    officer: Officer;
    states: StateRef[];
  }) {
  ```
- [ ] Update the call site inside the card: replace `{city}, {stateName(state)}` with `{city}, {stateName(state, states)}`.

### 6f. `src/app/(marketing)/rates/page.tsx`

- [ ] Change the import:
  ```ts
  import { RATES_DISCLAIMER } from "@/content/site";
  ```
  to:
  ```ts
  import { getTenantConfig } from "@/server/tenant/config";
  ```
- [ ] Make the page async + read config. Change:
  ```ts
  export default function RatesPage() {
    return (
  ```
  to:
  ```ts
  export default async function RatesPage() {
    const config = await getTenantConfig();
    return (
  ```
- [ ] Replace `*{RATES_DISCLAIMER}` with `*{config.legal.ratesDisclaimer}`.

### 6g. `src/app/(marketing)/developers/page.tsx`

This page builds the public-API base from `SITE.url` at module scope. Move it inside the async component using `getTenantOrigin()`, and thread `BASE`/`OPENAPI_URL` into the `ENDPOINTS`/`HMAC_EXAMPLE` builders (they reference `BASE`).

- [ ] Change the import:
  ```ts
  import { SITE } from "@/content/site";
  import { SwaggerEmbed } from "./SwaggerEmbed";
  ```
  to:
  ```ts
  import { getTenantOrigin } from "@/server/tenant/config";
  import { SwaggerEmbed } from "./SwaggerEmbed";
  ```
- [ ] Delete the two module-level constants:
  ```ts
  const BASE = `${SITE.url}/api/v1/public`;
  const OPENAPI_URL = `${BASE}/openapi.json`;
  ```
- [ ] Convert `ENDPOINTS` (module const) into a factory that takes `base`. Replace:
  ```ts
  const ENDPOINTS: Endpoint[] = [
    {
      method: "GET",
      path: "/rates",
      auth: "Open",
      summary:
        "Today's purchase and refinance rates with estimated monthly P&I on a $300,000 loan.",
      example: `curl ${BASE}/rates`,
    },
    {
      method: "GET",
      path: "/programs",
      auth: "Open",
      summary: "Loan programs by category (name, blurb, best-for audience).",
      example: `curl ${BASE}/programs`,
    },
    {
      method: "GET",
      path: "/loan-officers",
      auth: "Open",
      summary:
        "Public loan-officer directory (name, NMLS, city, state, languages, specialties, rating).",
      example: `curl ${BASE}/loan-officers`,
    },
    {
      method: "POST",
      path: "/leads",
      auth: "API key (+ HMAC)",
      summary:
        "Submit a partner lead. Requires x-api-key; add x-signature when your key has a secret.",
      example: `curl -X POST ${BASE}/leads \\
    -H "Content-Type: application/json" \\
    -H "x-api-key: YOUR_KEY" \\
    -d '{
      "intent": "buy",
      "contact": {
        "firstName": "Jane", "lastName": "Doe",
        "email": "jane@example.com", "phone": "303-555-0142"
      },
      "consentTcpa": true,
      "idempotencyKey": "a-unique-string-16chars+"
    }'`,
    },
  ];
  ```
  with:
  ```ts
  function buildEndpoints(base: string): Endpoint[] {
    return [
      {
        method: "GET",
        path: "/rates",
        auth: "Open",
        summary:
          "Today's purchase and refinance rates with estimated monthly P&I on a $300,000 loan.",
        example: `curl ${base}/rates`,
      },
      {
        method: "GET",
        path: "/programs",
        auth: "Open",
        summary: "Loan programs by category (name, blurb, best-for audience).",
        example: `curl ${base}/programs`,
      },
      {
        method: "GET",
        path: "/loan-officers",
        auth: "Open",
        summary:
          "Public loan-officer directory (name, NMLS, city, state, languages, specialties, rating).",
        example: `curl ${base}/loan-officers`,
      },
      {
        method: "POST",
        path: "/leads",
        auth: "API key (+ HMAC)",
        summary:
          "Submit a partner lead. Requires x-api-key; add x-signature when your key has a secret.",
        example: `curl -X POST ${base}/leads \\
    -H "Content-Type: application/json" \\
    -H "x-api-key: YOUR_KEY" \\
    -d '{
      "intent": "buy",
      "contact": {
        "firstName": "Jane", "lastName": "Doe",
        "email": "jane@example.com", "phone": "303-555-0142"
      },
      "consentTcpa": true,
      "idempotencyKey": "a-unique-string-16chars+"
    }'`,
      },
    ];
  }
  ```
- [ ] Make the page async + build the URLs/endpoints inside it. Change:
  ```ts
  export default function DevelopersPage() {
    return (
  ```
  to:
  ```ts
  export default async function DevelopersPage() {
    const origin = await getTenantOrigin();
    const BASE = `${origin}/api/v1/public`;
    const OPENAPI_URL = `${BASE}/openapi.json`;
    const ENDPOINTS = buildEndpoints(BASE);
    return (
  ```
  (`HMAC_EXAMPLE` does not reference `BASE`, so it stays a module const. The JSX already references `BASE`, `OPENAPI_URL`, and `ENDPOINTS`, which are now in scope.)

- [ ] Type-check + run all tests:
  ```bash
  npx tsc --noEmit && npx vitest run
  ```
  Expected: no type errors; all tests pass.

- [ ] Commit:
  ```bash
  git add src/components/Footer.tsx src/components/home/Hero.tsx src/components/home/Family.tsx src/components/nav/Nav.tsx src/components/officers/OfficerCard.tsx "src/app/(marketing)/rates/page.tsx" "src/app/(marketing)/developers/page.tsx"
  git commit -m "feat(tenant): server visible components read tenant config"
  ```

---

## Task 7 — Client visible components via props

These are `"use client"` and cannot call `getTenantConfig()`. Each gets a prop for the specific string(s) it needs; the nearest SERVER parent supplies it from `getTenantConfig()`/helpers.

**Files:**
- Modify: `src/components/apply/steps/FormStep.tsx` (client) — `consentTcpa` prop
- Modify: `src/components/apply/Wizard.tsx` (client) — `phoneHref`/`phoneDisplay`/`consentTcpa` props; threads `consentTcpa` to `FormStep`
- Modify: `src/app/apply/[intent]/page.tsx` (server) — resolves config, passes props to `Wizard`
- Modify: `src/components/nav/MobileDrawer.tsx` (client) — `phoneHref`/`shortName` props (parent `Nav` already updated in Task 6d)
- Modify: `src/components/officers/OfficerDirectory.tsx` (client) — `states` prop; passes `states` to `OfficerCard`
- Modify: `src/app/(marketing)/loan-officers/page.tsx` (server) — resolves config, passes `states` to `OfficerDirectory`

Parent map: `FormStep` ← `Wizard` (client) ← `src/app/apply/[intent]/page.tsx` (server boundary). `MobileDrawer` ← `Nav` (server — updated in 6d). `OfficerDirectory` ← `src/app/(marketing)/loan-officers/page.tsx` (server). `OfficerCard` ← `OfficerDirectory` (client) — receives `states` and forwards it.

### 7a. `src/components/apply/steps/FormStep.tsx`

- [ ] Remove the import:
  ```ts
  import { CONSENT_TCPA } from "@/content/site";
  ```
- [ ] Add the `consentTcpa` prop. Change:
  ```ts
  export function FormStep({
    onDone,
  }: {
    /** Called with the collected contact once all 4 fields are filled. */
    onDone: (contact: LeadContact) => void;
  }) {
  ```
  to:
  ```ts
  export function FormStep({
    onDone,
    consentTcpa,
  }: {
    /** Called with the collected contact once all 4 fields are filled. */
    onDone: (contact: LeadContact) => void;
    /** TCPA consent microcopy (tenant-specific). */
    consentTcpa: string;
  }) {
  ```
- [ ] Replace `{CONSENT_TCPA}` with `{consentTcpa}`.

### 7b. `src/components/apply/Wizard.tsx`

- [ ] Remove the import:
  ```ts
  import { SITE } from "@/content/site";
  ```
- [ ] Add props. Change:
  ```ts
  export function Wizard({ intent }: { intent: Intent }) {
  ```
  to:
  ```ts
  export function Wizard({
    intent,
    phoneHref,
    phoneDisplay,
    consentTcpa,
  }: {
    intent: Intent;
    phoneHref: string;
    phoneDisplay: string;
    consentTcpa: string;
  }) {
  ```
- [ ] Replace `href={SITE.phoneHref}` with `href={phoneHref}`.
- [ ] Replace `Call anytime {SITE.phoneDisplay}` with `Call anytime {phoneDisplay}`.
- [ ] Thread the consent string into `FormStep`. Replace:
  ```ts
  {step.type === "form" && <FormStep onDone={onFormDone} />}
  ```
  with:
  ```ts
  {step.type === "form" && (
    <FormStep onDone={onFormDone} consentTcpa={consentTcpa} />
  )}
  ```

### 7c. `src/app/apply/[intent]/page.tsx`

- [ ] Add imports (after the existing imports):
  ```ts
  import { getTenantConfig } from "@/server/tenant/config";
  import { buildConsentTcpa } from "@/content/site";
  ```
- [ ] In the async page body, resolve config and pass props. Change:
  ```ts
    const { intent } = await params;
    if (!isIntent(intent) || !FLOW[intent]) notFound();

    return <Wizard intent={intent} />;
  ```
  to:
  ```ts
    const { intent } = await params;
    if (!isIntent(intent) || !FLOW[intent]) notFound();

    const config = await getTenantConfig();
    return (
      <Wizard
        intent={intent}
        phoneHref={config.contact.phoneHref}
        phoneDisplay={config.contact.phoneDisplay}
        consentTcpa={buildConsentTcpa(config)}
      />
    );
  ```

### 7d. `src/components/nav/MobileDrawer.tsx`

- [ ] Remove the import:
  ```ts
  import { SITE } from "@/content/site";
  ```
- [ ] Add props. Change:
  ```ts
  export function MobileDrawer() {
  ```
  to:
  ```ts
  export function MobileDrawer({
    phoneHref,
    shortName,
  }: {
    phoneHref: string;
    shortName: string;
  }) {
  ```
- [ ] Replace the brand text span content `MSFG` (`<span className="text-[23px] …">MSFG</span>`) with `{shortName}`.
- [ ] Replace `href={SITE.phoneHref}` (bottom CTA) with `href={phoneHref}`.

### 7e. `src/components/officers/OfficerDirectory.tsx`

- [ ] Change the import:
  ```ts
  import { SITE } from "@/content/site";
  ```
  to:
  ```ts
  import type { TenantConfig } from "@/content/site";
  ```
- [ ] Add a `states` prop. Change:
  ```ts
  export function OfficerDirectory() {
    const [stateFilter, setStateFilter] = useState(ALL);
  ```
  to:
  ```ts
  type StateRef = TenantConfig["legal"]["states"][number];

  export function OfficerDirectory({ states }: { states: StateRef[] }) {
    const [stateFilter, setStateFilter] = useState(ALL);
  ```
- [ ] Replace the `stateOptions` memo's `SITE.states` reference and add `states` to its deps. Change:
  ```ts
    const stateOptions = useMemo(
      () => [
        { value: ALL, label: "All states" },
        ...SITE.states.map((s) => ({ value: s.code, label: s.name })),
      ],
      [],
    );
  ```
  to:
  ```ts
    const stateOptions = useMemo(
      () => [
        { value: ALL, label: "All states" },
        ...states.map((s) => ({ value: s.code, label: s.name })),
      ],
      [states],
    );
  ```
- [ ] Forward `states` to each card. Change:
  ```ts
  <OfficerCard key={officer.nmls} officer={officer} />
  ```
  to:
  ```ts
  <OfficerCard key={officer.nmls} officer={officer} states={states} />
  ```

### 7f. `src/app/(marketing)/loan-officers/page.tsx`

- [ ] Add imports (after the existing imports):
  ```ts
  import { getTenantConfig } from "@/server/tenant/config";
  ```
- [ ] Make the page async + pass `states`. Change:
  ```ts
  export default function LoanOfficersPage() {
    return (
  ```
  to:
  ```ts
  export default async function LoanOfficersPage() {
    const config = await getTenantConfig();
    return (
  ```
- [ ] Replace `<OfficerDirectory />` with `<OfficerDirectory states={config.legal.states} />`.

- [ ] Type-check + run all tests:
  ```bash
  npx tsc --noEmit && npx vitest run
  ```
  Expected: no type errors; all tests pass.

- [ ] Commit:
  ```bash
  git add src/components/apply/steps/FormStep.tsx src/components/apply/Wizard.tsx "src/app/apply/[intent]/page.tsx" src/components/nav/MobileDrawer.tsx src/components/officers/OfficerDirectory.tsx "src/app/(marketing)/loan-officers/page.tsx"
  git commit -m "feat(tenant): client visible components receive tenant strings via props"
  ```

---

## Task 8 — Verify + (orchestrator-owned) deploy

**Files:**
- Test: `src/components/theme/tenantThemeCss.test.ts` (extend — swap proof already added in Task 4; verify it covers a full second tenant)
- Test: `src/lib/schema.test.ts` (create — swap-proof JSON-LD)

### 8a. Swap-proof unit test for `localBusinessSchema`

A throwaway second-tenant config (different colors + name + NMLS) asserts the JSON-LD reflects it. (`<TenantTheme>` CSS swap is already proven by the `buildTenantThemeCss` "swap proof" test in Task 4.)

- [ ] Create `src/lib/schema.test.ts`:

```ts
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
    expect(s.identifier.value).toBe("1234567");
    expect(s.areaServed).toHaveLength(7);
  });

  it("reflects a swapped second tenant (config-only retheme)", () => {
    const acme: TenantConfig = {
      ...DEFAULT_TENANT_CONFIG,
      brand: { ...DEFAULT_TENANT_CONFIG.brand, shortName: "Acme", legalName: "Acme Lending, LLC" },
      contact: { ...DEFAULT_TENANT_CONFIG.contact, nmls: "9999999" },
      legal: {
        ...DEFAULT_TENANT_CONFIG.legal,
        states: [{ code: "CA", name: "California" }],
      },
    };
    const s = localBusinessSchema(acme, "https://acme.com");
    expect(s["@id"]).toBe("https://acme.com#org");
    expect(s.url).toBe("https://acme.com");
    expect(s.name).toBe("Acme Lending, LLC");
    expect(s.alternateName).toBe("Acme");
    expect(s.identifier.value).toBe("9999999");
    expect(s.areaServed).toEqual([{ "@type": "State", name: "California" }]);
  });
});
```

- [ ] Run it (expected **PASS**):
  ```bash
  npx vitest run src/lib/schema.test.ts
  ```

### 8b. DB-free gates + commit the test

- [ ] Run the type + unit gates (neither touches the DB):
  ```bash
  npx tsc --noEmit
  npx vitest run
  ```
  Expected: no type errors; all tests pass. (`npm run build` is intentionally NOT run here — in Phase B it reads the DB at build time and requires the migration first; see 8d. It runs in 8e.)

- [ ] Commit the swap-proof test:
  ```bash
  git add src/lib/schema.test.ts
  git commit -m "test(tenant): swap-proof JSON-LD for a second tenant config"
  ```

### 8c. Visual parity note (MSFG, zero visual change)

- [ ] **Manual parity check (record outcome, do not block on tooling):** MSFG home / category / `/rates` / `/loan-officers` / `/apply/buy` must render identical to pre-Phase-B. The mechanism that guarantees this: `DEFAULT_TENANT_CONFIG` equals today's `site.ts` + `globals.css` values, and `<TenantTheme>` injects those same values, so every computed `--color-*` / `--radius-*` / `--lip` / `--font-sans` equals the current hex/value (the `buildTenantThemeCss` MSFG test asserts the byte-exact mapping). Confirm the footer legal strip, nav phone link, hero stats, family cards, rates disclaimer, and officer state names are unchanged.

### 8d. ⚠️ Build-time DB dependency (NEW in Phase B — read before deploying)

Phase B makes the statically-prerendered marketing pages read `getTenantConfig()`, which runs a Prisma query (`tenant.findUnique({ select: { config } })`). Three consequences the executor MUST account for:

- **`next build` now needs DB connectivity.** Static generation executes that query at build time. The deploy build runs locally where `.env`'s `DATABASE_URL` → the RDS `msfg_web` (reachable), so it works — but a build with the DB unreachable will FAIL. (Previously these pages read only content modules, so the build needed no DB.)
- **The `config` column must exist BEFORE the build.** A build run before the migration would `SELECT "config"` from a table lacking it → build error. So **apply the migration to `msfg_web` before `npm run build`/deploy.** The migration is purely additive (one nullable column) and the still-running old app never references `config`, so applying it early is zero-risk to the live app. (`getTenantOrigin()` only selects `domains`, which already exists, so sitemap/robots are unaffected — only the config-reading pages gate on this.)
- **Pages stay static (`○`).** In dedicated mode `getTenant()` resolves from `TENANT_SLUG` without `headers()` (see `resolve.ts`), so Next still statically prerenders these routes with build-time config baked in — preserving today's behavior. Shared-mode per-request rendering (ISR/dynamic) is a later concern.

### 8e. Orchestrator-owned, go-ahead-gated deploy (same discipline as Phase A)

> Do NOT run these without explicit user go-ahead. The live DB is the isolated `msfg_web`. **Order matters: migration → seed → build+deploy.**

- [ ] Apply the additive migration to live `msfg_web`:
  ```bash
  npx prisma migrate deploy
  ```
- [ ] Seed MSFG's config (idempotent; sets `tenant_msfg.config = DEFAULT_TENANT_CONFIG`):
  ```bash
  npm run db:seed
  ```
- [ ] NOW build + deploy. The build's static generation reads the now-present, seeded `config`. **Confirm the marketing routes still print as `○ (Static)`** in the build output (a flip to `ƒ (Dynamic)` would signal an unintended request-API dependency to fix):
  ```bash
  scripts/deploy-ec2.sh https://staging.msfg.us staging
  ```
- [ ] Health + SEO spot check: staging `/api/v1/health` → `{ok,db:up}`; and `sitemap.xml` / `robots.txt` / the homepage canonical+OG+JSON-LD resolve to the staging origin and otherwise match today's output.

---

## Spec coverage map (self-review)

| Spec section | Task(s) |
|---|---|
| §1 Config storage & shape — schema sections (brand/theme/contact/legal/seo/marketing/features) | Task 1 |
| §1 `DEFAULT_TENANT_CONFIG` = today's MSFG values | Task 1 |
| §1 Derived legal strings via helpers (not stored) | Task 1 (`buildLegalStrip`/`buildConsentTcpa`/`statesLine`) |
| §1 `SITE.url`/`SITE.env` NOT in config (env-derived) | Task 1 shim + Task 3 `tenantOrigin` |
| §1 Migration `config Json?` + seed MSFG | Task 2 |
| §2 `getTenantConfig()` cached per tenantId + fallback | Task 3 |
| §2 Server components read config; client via props | Task 6 (server) + Task 7 (client) |
| §3 `<TenantTheme>` server `<style>` in `<head>`, maps theme→CSS vars, no FOUC | Task 4 |
| §3 `@theme` stays build-time default; utilities unchanged | Task 4 (override-only) |
| §3 Logos in config.brand.logos | Task 1 (schema + DEFAULT paths) — consumed where brand text/marks render (Footer/Nav/Family use `shortName`; logo image asset adoption beyond text is deferred, see note below) |
| §3 Font via `config.theme.fontFamily` → `--font-sans` | Task 1 + Task 4 |
| §4 `tenantOrigin(tenant)` single source of absolute URLs | Task 3 |
| §4 `generateMetadata()` from config + origin (metadataBase/title/desc/OG/robots) | Task 4 |
| §4 `localBusinessSchema(config, origin)` | Task 5 |
| §4 sitemap/robots use origin; robots env-aware | Task 5 |
| §5 Migration + seed applied to live `msfg_web` (gated) | Task 8d |
| §6 Verification gates (tsc/vitest/build) | Task 8b |
| §6 Visual parity + token audit | Task 4 (CSS test) + Task 8c |
| §6 Swap proof (second tenant) | Task 4 (theme CSS) + Task 8a (JSON-LD) |
| §6 SEO check (MSFG → msfg.us) | Task 8c/8d |

**Deferred per spec Non-goals (explicitly NOT done here):** `integrations` config section; per-tenant nav/wizard/AI-script structure; tenant admin UI; custom per-tenant web *fonts* (only a font *stack* via `--font-sans`); dynamic `next/og` image generation (`seo.ogImage` URL only); per-host sitemap/robots in *shared* mode.

**Note on logos (§3):** the current chrome (`Nav`/`Footer`/`Family`/`Mark`) renders the brand as **text** (`shortName`) and a generated SVG `Mark`, not an `<img>` logo. Phase B seeds `config.brand.logos` (paths) so the data exists, and routes all brand *text* through `shortName`. Swapping the rendered chrome to consume `logos.horizontal`/`logos.white`/`logos.mark` as `<img>`/themed marks is a small follow-up (no new schema) and is intentionally left out of the visible-component edits to preserve byte-identical MSFG render; flag for the orchestrator if image-based logos are wanted in Phase B.
