# Design: Phase B — Per-tenant config, runtime theming & SEO

**Status:** Approved (design) · **Scope:** Phase B of the multi-tenant platform · **Date:** 2026-06-04
**Builds on:** Phase A (tenant core — `Tenant` model, `tenantId` scoping, `getTenant()`/`getTenantDb()`, dedicated/shared resolution). See `2026-06-04-multi-tenant-platform-design.md` §Phase B.

## Context

Phase A made every tenant-owned row tenant-scoped and pinned MSFG as tenant #1 in dedicated mode, with zero behavior change. But branding, copy, legal strings, design tokens, and SEO metadata are still **hardcoded** in `src/content/site.ts`, `src/app/globals.css` (`@theme`), `src/lib/schema.ts`, and the route `metadata` exports. A second company can't be added without code changes.

Phase B introduces **per-tenant configuration** and makes the app render from it: branding, copy, legal, theme tokens, and SEO all come from the resolved tenant's config. MSFG renders **pixel-identical** because its seeded config equals today's hardcoded values. After Phase B, adding a company is **config + seed, never code** (for everything except integrations/secrets, which are Phase C).

## Goals / Non-goals

**Goals:**
- A typed, validated `TenantConfig` covering brand, theme tokens, contact, legal, SEO, and marketing copy.
- Runtime per-tenant theming via server-injected CSS variables — no FOUC/CLS, no change to components or utility names.
- All SEO surfaces (metadata, JSON-LD, sitemap, robots) become tenant-config-driven with **correct per-tenant canonical domains**.
- MSFG renders identically; `tsc`/`vitest`/`build` green.
- Everything in `src/content/site.ts` + the design tokens becomes per-tenant.

**Non-goals (later phases):**
- Integration creds/IDs (AI provider+model, GHL location/pipeline/stage, Cognito client/domain, LOS base) and per-tenant **secrets** → **Phase C**. The config schema leaves room for an `integrations` section but Phase B neither stores nor consumes it.
- Per-tenant **structure**: navigation, the apply-wizard flow, and the AI assistant script stay shared defaults.
- Tenant admin UI / self-serve onboarding (config edited via seed + Prisma Studio for now).
- Custom per-tenant **web fonts** (build-time `next/font` limitation — see Theming); a per-tenant font *stack* via CSS var is in scope.
- Dynamic per-tenant **OG image generation** (`next/og`) — `seo.ogImage` URL is in scope; generation is a later enhancement.
- Per-host **sitemap/robots** in *shared* mode (Next's special files don't expose the request host) — lands when shared mode goes live; dedicated MSFG is unaffected.

## Decisions locked

| Decision | Choice |
|---|---|
| Config storage | **Typed JSON `config` column on `Tenant`**, validated by a Zod `TenantConfigSchema` (not a relational table). |
| Phase B scope | **All of `src/content/site.ts` + design tokens** become per-tenant. Structure (nav/wizard/AI script) stays shared. |
| Theming | Override Tailwind-v4 `@theme` CSS variables at `:root` via a **server-rendered `<style>`** in `<head>`; `@theme` stays the build-time default. |
| Legal strings | Stored **structured inputs** per tenant; the disclosure strings are **derived by shared helpers** (logic stays shared). |
| SEO canonical | A `tenantOrigin(tenant)` helper drives `metadataBase`/canonical/OG/JSON-LD/sitemap/robots. |
| Client access | Server components read config directly; client components receive needed strings via **props** (no new global client context). |

## Architecture

### 1. Config storage & shape
- **Migration:** add `config Json?` to `Tenant`. Single MSFG row is seeded (below); the column is nullable so the migration is trivial and the resolver falls back to defaults when absent.
- **`TenantConfigSchema`** (Zod) is the contract. `src/content/site.ts` is rewritten into three exports: the **schema**, `DEFAULT_TENANT_CONFIG` (today's MSFG values), and the **derive-helpers** (legal strings). It stops being the live source — it becomes the *shape + MSFG defaults + seed source*.
- **Not in the JSON config:** `SITE.url` and `SITE.env` are *not* tenant-config fields. The canonical origin is derived per request by `tenantOrigin(tenant)` (§4) from the tenant's domains, and the environment (staging vs production, for robots/noindex) stays the deploy-level `NEXT_PUBLIC_SITE_ENV`. Everything else in `site.ts` (brand, contact, legal, seo, marketing) moves into the config.
- Sections:
  - **brand** — `shortName`, `legalName`, `foundedYear`, `logos { horizontal, white, mark }` (paths/URLs).
  - **theme** — token overrides: emerald ramp (`green900…green600`, `greenGlow`), `spring`/`spring2`/`spring3`/`springSoft`, `mint`, neutrals (`ink`, `paper`, `paper2`, `muted`, `line`), on-dark set, radii (`sm/md/lg/xl`), `lip`, `fontFamily`. Each **optional**, defaulting to MSFG's value, so a partial config still renders.
  - **contact** — `phoneDisplay`, `phoneHref`, `email`, `nmls`, `nmlsConsumerAccessUrl`.
  - **legal** — `states[] {code,name}`; plus overridable string fields where copy is jurisdiction-specific (`texasNotice`, `ratesDisclaimer`). LEGAL_STRIP / CONSENT_TCPA are **derived** from structured inputs via helpers, not stored.
  - **seo** — `titleDefault`, `titleTemplate`, `description`, `ogTitle`, `ogDescription`, `siteName`, `ogImage?`, `keywords?`.
  - **marketing** (optional) — `tagline`, `stats[] {num,label}`, `familyOfCompanies[]`, `footerFamily[]`.
  - **features** — booleans (`showFamily`, `ghlChat`, `aiAssistant`, …) gating conditional render.
- **`DEFAULT_TENANT_CONFIG`** doubles as the Zod default/fallback and MSFG's seed, guaranteeing identical render and resilience to partial config.

### 2. Resolution & reading
- **`getTenantConfig()`** — request-scoped, **cached per `tenantId`** (mirrors `getTenantDb`'s cache). Loads `tenant.config`, Zod-parses with fallback to `DEFAULT_TENANT_CONFIG`, returns the typed object. Resolved off the Phase-A `getTenant()`.
- Server components (`Nav`, `Footer`, `Mark`, pages, layout) call `await getTenantConfig()`.
- **Client** components (e.g. forms needing the TCPA string, the AI widget needing the brand name) receive the specific strings as **props** from their server parents — no global client context, keeping the client bundle lean and avoiding hydration of the whole config.
- Derived legal strings become pure helpers — `buildLegalStrip(config)`, `buildConsentTcpa(config)` — called server-side.

### 3. Runtime theming (`<TenantTheme>`)
- A **server component** rendered in the root layout `<head>` emits:
  `<style>:root{ --color-green-800:…; --color-spring:…; --color-mint:…; --radius-md:…; --lip:…; --font-sans:… }</style>`
  mapping `config.theme` → the existing CSS variable names.
- **SSR'd before paint → no FOUC/CLS.** The `@theme` block in `globals.css` stays as the **build-time default** (so utilities exist and MSFG renders even with no override). `<TenantTheme>` only overrides variable *values*; **components, class names, and utilities never change.**
- **MSFG:** `config.theme` equals the `@theme` defaults → identical (the override is a harmless echo; we inject uniformly for all tenants).
- **Logos:** `config.brand.logos` consumed by `Nav`/`Footer`/`Mark` (replacing hardcoded asset refs).
- **Font:** Hanken stays shared in Phase B (`next/font` is build-time). `config.theme.fontFamily` overrides `--font-sans` to a system/web-safe stack for other tenants; bespoke per-tenant web-font loading is deferred.

### 4. SEO (per-tenant, fully optimized)
- **Canonical origin:** new `tenantOrigin(tenant)` helper — dedicated mode → the pinned tenant's primary domain (MSFG → `https://msfg.us`, unchanged); shared mode → the resolved tenant's `domains[0]`. It is the single source for every absolute URL below, eliminating cross-tenant canonical errors.
- **Metadata:** root `metadata` → `generateMetadata()` reading `getTenantConfig()` + `tenantOrigin()` (`metadataBase`, title default/template, description, OG, `robots` index/noindex by env). Per-route metadata sources brand strings from config.
- **JSON-LD:** `localBusinessSchema(config, origin)` — `FinancialService` with the tenant's `legalName`, `@id`/`url` = origin, `telephone`/`email`, `areaServed` = licensed states, NMLS identifier, languages. Per-tenant structured data = strong local SEO.
- **Sitemap / robots:** `sitemap.ts` emits `${origin}${route}` for the shared route list; `robots.ts` stays env-aware (staging `Disallow: /`, noindex) and points `sitemap`/`host` at `origin`. (Shared-mode per-host variants deferred — see Non-goals.)
- **Core Web Vitals:** server-side theme injection keeps LCP/CLS clean; no client-side token swap. `seo.ogImage` is a config URL; `next/og` generation deferred.

### 5. Seeding & migration
- `prisma/migrations/<ts>_add_tenant_config/` — `ALTER TABLE "tenants" ADD COLUMN "config" JSONB;` (nullable). Applied to live `msfg_web` (isolated DB) with the same pause-for-go-ahead discipline as Phase A.
- `prisma/seed.ts` — upsert `tenant_msfg.config = DEFAULT_TENANT_CONFIG` (today's MSFG values). Idempotent.

### 6. Verification (zero visual change)
- **Visual parity:** MSFG home/category/rates/officers/apply render identical (config = current values); token audit asserts computed `--color-*`/`--radius-*` equal the current hex.
- **Gates:** `tsc --noEmit`, `vitest`, `next build` green. New unit tests: `TenantConfigSchema` parse + defaults/fallback, the derive-helpers (legal strings byte-identical to today's for MSFG), `getTenantConfig` fallback, and `tenantOrigin` (dedicated vs shared).
- **Swap proof:** a throwaway second-tenant config in a test (different colors + name + NMLS) asserts `<TenantTheme>` overrides the vars and `localBusinessSchema`/metadata reflect the second tenant — proving config-only retheme works.
- **SEO check:** canonical/OG/sitemap/robots/JSON-LD for MSFG resolve to `msfg.us` and match today's output.

## Component / file change map

| Area | Change |
|---|---|
| `prisma/schema.prisma` | `Tenant.config Json?` + migration |
| `src/content/site.ts` | → `TenantConfigSchema` + `DEFAULT_TENANT_CONFIG` + derive-helpers |
| `src/server/tenant/config.ts` (new) | `getTenantConfig()` (cached) + `tenantOrigin()` |
| `src/components/theme/TenantTheme.tsx` (new) | server `<style>` CSS-var injector |
| `src/app/layout.tsx` | `<TenantTheme>` in `<head>`; `generateMetadata()` from config |
| `src/app/(marketing)/**/page.tsx` | metadata + body read config (brand/marketing strings) |
| `src/lib/schema.ts` | `localBusinessSchema(config, origin)` |
| `src/app/sitemap.ts`, `robots.ts` | use `tenantOrigin()` |
| `Nav`, `Footer`, `Mark`, family/stats sections | read config / take props |
| `prisma/seed.ts` | seed `tenant_msfg.config` |

## Risks / open items
- **Visual regression** is the top risk → token audit + side-by-side MSFG check are mandatory gates.
- **Client-prop sprawl:** if too many client components need config strings, revisit a minimal `TenantConfigProvider`; default to props.
- **Shared-mode sitemap/robots** and **custom fonts / dynamic OG** are explicitly deferred (Non-goals) — note them so they aren't assumed done.
- Config has **no admin UI**; edits are via seed/Prisma Studio until a later phase.
