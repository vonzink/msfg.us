# CMS & SEO Management System — Design

- **Date:** 2026-06-05
- **Status:** Approved (design); pending implementation plan
- **Topic:** A tenant-aware content + SEO editing layer for the MSFG.us multi-tenant platform
- **Related:** `docs/superpowers/specs/2026-06-04-multi-tenant-platform-design.md`, `docs/superpowers/specs/2026-06-04-phase-b-tenant-config-theming-design.md`

## 1. Purpose

Make the site **easy to edit and maintain** without code changes: branding, copy, SEO,
and content values are editable through an admin UI, with a safe draft → preview →
publish → rollback workflow. Built as a **multi-tenant foundation** — MSFG (tenant #1)
uses it now; other tenant companies can self-serve later. This directly serves the
platform invariant "**a new company = config + seed, never code.**"

## 2. Decisions (locked during brainstorming)

| Axis | Decision |
|---|---|
| **Audience** | Multi-tenant foundation. RBAC + per-tenant admin isolation from day one (only MSFG uses it at first). |
| **Edit scope** | The typed `TenantConfig` + existing DB content models. **Page layouts stay in code**; editors change the values that flow into them. No free-form page builder. |
| **Publish flow** | Draft → preview → publish, with version history and rollback. |
| **SEO depth** | Per-page meta overrides + dynamic sitemap + redirects (301/302) + basic per-page JSON-LD. (No OG-image generation, structured-data builder, SEO linting, or analytics hooks in this design.) |
| **Media** | Managed uploads behind an abstracted, S3-compatible storage interface (portable across Vercel + Docker/AWS). Sequenced as its own phase. |
| **Architecture** | Integrated `/admin` route group **inside the existing Next.js app** (not a separate app, not a headless CMS). |

### Why integrated `/admin`

The same app renders public pages *and* admin, so **draft preview via Next.js Draft
Mode is essentially free** — the existing renderer serves pending content; no
duplication. It reuses the DB, the Prisma tenant-scoping extension, `TenantConfigSchema`
types, Cognito auth, and the design system, and ships as one portable deployable.
Security separation is achieved by RBAC + route protection, not a separate process.

**Rejected:** a *separate admin app* (preview requires duplicating the renderer; doubles
tenant/auth/deploy plumbing) and a *headless CMS* (creates a second source of truth that
fights the Zod `TenantConfig`, the Prisma multi-tenant extension, Cognito, and the
design system).

## 3. Current-state findings (the seams this attaches to)

- **Config source of truth:** `TenantConfigSchema` (Zod) in `src/content/site.ts`, stored
  as JSON in the `Tenant.config` column, resolved per-request by `getTenantConfig()` in
  `src/server/tenant/config.ts`.
- **Stale-cache hazard:** `getTenantConfig()`/`getTenantOrigin()` use module-level
  `Map` caches keyed by `tenant.id` (`config.ts:48,66`). A publish would **not** bust
  them, and on multi-instance/serverless each instance is independently stale. The CMS
  **must replace these with Next's tagged cache** so `revalidateTag` on publish pushes
  changes live.
- **Tenant scoping:** `src/server/tenant/scoping.ts` auto-injects `tenantId` and **bans
  `findUnique/update/delete`** on the scoped client (forces `findFirst/updateMany/
  deleteMany`). Implication: in-tenant admin CRUD uses the **scoped** client (safe by
  construction); platform-super-admin cross-tenant reads use the **base/unscoped** client
  with explicit `tenantId` — a security boundary RBAC must enforce.
- **SEO today (Phase B):** `generateMetadata()` in the root layout reads `config.seo`;
  `src/app/sitemap.ts` is a hardcoded route list; `src/app/robots.ts` + JSON-LD read from
  config. All SEO strings are already config-driven.
- **Content models in Postgres (tenant-scoped):** `LoanOfficer`, `LoanProgram`,
  `RateRow`, `Testimonial`.
- **Auth:** user-facing Cognito OIDC exists (`/auth/login|callback|logout`). **No admin
  UI, no RBAC** — greenfield.
- **Next 16 primitives confirmed present** in bundled docs: `draft-mode`, `revalidateTag`,
  `revalidatePath`, `cacheHandlers`, `generate-metadata`. Next 16 uses **Cache
  Components** (`use cache` + `cacheTag`/`cacheLife`) — the CMS leans on these rather than
  the older `unstable_cache`.

## 4. Architecture

### 4.1 Versioning engine (the backbone)

One generic pair of models powers draft → publish → history for **everything** editable,
so we avoid scattering `draftX`/`statusX` columns across the schema.

- **`Editable`** — identifies an editable thing.
  `{ id, tenantId, kind, key, createdAt }`.
  - `kind` enum: `CONFIG | PAGE_SEO | REDIRECTS | NAV | OFFICER | RATE | TESTIMONIAL | PROGRAM`.
  - `key`: route path for `PAGE_SEO`; the record id for relational kinds; a fixed
    singleton (e.g. `"default"`) for `CONFIG`/`REDIRECTS`/`NAV`.
- **`Revision`** —
  `{ id, tenantId, editableId, version, state, data Json, authorId, note, createdAt, publishedAt }`.
  - `state` enum: `DRAFT | PUBLISHED | ARCHIVED`.

**Read semantics:**
- Live site → latest `PUBLISHED` revision's `data` for an `Editable`.
- Preview (Draft Mode on) → latest `DRAFT` revision, else falls back to `PUBLISHED`.
- History → all revisions for an `Editable`, ordered by `version`.
- Rollback → clone a chosen historical revision into a new `DRAFT`, then publish it
  (never mutate published rows in place).

Both models carry `tenantId` and ride the existing scoping extension.

**Config migration:** `getTenantConfig()` stops reading `Tenant.config` directly and
reads the latest `PUBLISHED` `CONFIG` revision instead. The current `Tenant.config` JSON
seeds revision 1. Same `TenantConfigSchema` validation. `Tenant.config` is retained as a
seed/fallback so a tenant with no revisions still resolves.

**Settings vs relational content:**
- `CONFIG / PAGE_SEO / REDIRECTS / NAV` are JSON-shaped → they live entirely in
  `Revision.data`. Clean fit; this is what Phases 0–3 use.
- The relational lists (`OFFICER/RATE/TESTIMONIAL/PROGRAM`) keep their existing tables as
  published truth and adopt the **same** draft/publish via a row-level `status` field +
  `Revision` snapshots for history. Sequenced into **Phase 5** (lower risk than global
  config/SEO).

### 4.2 Identity, RBAC, audit

- **`AdminUser`** `{ id, cognitoSub @unique, email, name, isPlatformAdmin, createdAt }`.
- **`Membership`** `{ id, userId, tenantId, role }` — role enum `OWNER | ADMIN | EDITOR | VIEWER`.
- **`AuditLog`** `{ id, tenantId, userId, action, editableId?, at, meta Json? }`.

**Roles:**
- `OWNER` — everything, including managing members.
- `ADMIN` — content + SEO + tenant settings (no member management).
- `EDITOR` — content + SEO (no settings/members).
- `VIEWER` — read + preview only.
- **Platform super-admin** (`isPlatformAdmin`) — spans all tenants; uses the unscoped
  client via an explicit tenant switcher.

### 4.3 Draft/publish + rendering, preview & cache (the crux)

- **Live rendering:** content reads (`getTenantConfig`, `getPageSeo`, nav, redirects map)
  are wrapped in Next 16 `use cache` functions tagged per tenant + kind, e.g.
  `cacheTag('t:<id>:config')`, `cacheTag('t:<id>:seo:/buy')`. Public pages stay
  static/ISR-fast.
- **Publish:** writes a new `PUBLISHED` revision, then calls
  `revalidateTag('t:<id>:<kind>...')` and `revalidatePath` for affected routes. Live
  within seconds. **This replaces the in-process `Map` caches.**
- **Preview:** the `/admin` "Preview" action enables Next.js **Draft Mode** (cookie) and
  opens the real route. Content readers detect `draftMode().isEnabled` and read the latest
  `DRAFT` revision, rendering dynamically. Same renderer, zero duplication.
- **Portability:** on Vercel, tag revalidation is native. On Docker/AWS `standalone`,
  configure a shared **`cacheHandlers`** (Redis/S3-backed) so revalidation propagates
  across instances. This is a deploy/infra requirement, not app code.

## 5. SEO subsystem (Phase 3)

- **Per-page meta:** `PAGE_SEO` editable keyed by route path.
  `data = { title?, description?, canonical?, ogTitle?, ogDescription?, ogImage?, robots?, jsonLd? }`.
  Each marketing route gets a `generateMetadata` that calls a shared `buildMetadata(path)`
  helper, which merges **global `config.seo` defaults ← per-page overrides**. Reads are
  tagged (`t:<id>:seo:<path>`) and draft-aware.
- **Dynamic sitemap:** `sitemap.ts` becomes a join of a **known-route registry in code**
  (layouts stay code) with per-route settings (`include`, `priority`, `changefreq`) stored
  in `PAGE_SEO`. Editors toggle inclusion + priority; routes cannot be invented.
- **Redirects:** `REDIRECTS` editable; `data = [{ from, to, type: 301|302, enabled }]`.
  Enforced in middleware (which already sets `x-tenant-slug`) against a per-tenant
  compiled redirect map read from the tagged cache and busted on publish.
- **JSON-LD:** per-page `jsonLd` (e.g. FAQ / Article / BreadcrumbList) rendered as a
  `<script type="application/ld+json">`; org/LocalBusiness stays sourced from
  `config.seo`.

## 6. Admin UI shell (Phase 1)

- `/admin` route group with its **own layout** (not the marketing Nav/Footer chrome),
  built from existing design tokens/primitives (`@/components/ui/*`, `@/lib/cn`).
- Nav: **Dashboard · Content · SEO · Media · Members · Audit**; a **tenant switcher** for
  platform admins.
- Server Components by default; `"use client"` islands for editing forms (controlled
  inputs, save-to-draft), the Preview action, and the Publish action.
- **Forms are generated from the Zod `TenantConfigSchema`** (single source of truth) —
  rendered per schema section (`brand`, `theme`, `contact`, `legal`, `seo`, `marketing`,
  `features`). Save → upsert a `DRAFT` revision; Preview → Draft Mode; Publish →
  revalidate. A draft-vs-published diff view is a nice-to-have, not required.

## 7. Media / assets (Phase 4)

- **`StorageProvider` interface** mirroring the platform's `SecretStore`/`AiProvider`
  pattern, with a default **S3-compatible adapter** (S3 / R2 / MinIO) → portable across
  Vercel + Docker/AWS. Platform bucket with per-tenant key prefixes `t/<tenantId>/…`;
  credentials resolved via `SecretStore`. Methods (minimum): `put(key, bytes, contentType)
  → url`, `delete(key)`.
- **`Asset`** `{ id, tenantId, key, url, kind, contentType, width?, height?, alt?, authorId, createdAt }`.
- Upload server action validates type/size → `put` → create `Asset` → return URL. An
  asset picker (choose existing or upload new) is wired into logo / OG-image / photo
  fields in the config and SEO editors.

## 8. Auth integration & access control

- Reuse the existing Cognito OIDC flow. On login, **upsert `AdminUser` by `cognitoSub`**.
- Access to `/admin/*` requires an authenticated session **and** either a `Membership`
  (role ≥ `EDITOR`) for the active tenant or `isPlatformAdmin`.
- **Two-layer guard:** middleware blocks `/admin/*` for unauthenticated/under-privileged
  requests; **server actions and route handlers re-check** via `requireRole(tenant, min)`.
  Never trust middleware alone.
- **DB-client boundary:** in-tenant admin → scoped client (auto `tenantId`);
  platform-admin cross-tenant operations → base/unscoped client with an explicit tenant
  selection. RBAC must enforce which client a code path may use.

## 9. Phasing (MSFG stays live throughout)

This spec is the overarching design. Implementation is decomposed so each increment gets
its own plan. **The first implementation plan covers Phases 0–2** (foundation + auth/shell
+ config editor) — the smallest slice that proves the full draft → preview → publish →
rollback loop end-to-end on config + SEO strings. Phases 3–5 are planned as we reach them.

| Phase | Delivers |
|---|---|
| **0 — Foundation** | `Editable / Revision / AdminUser / Membership / AuditLog` models + migration; versioning service (create draft, publish, rollback, list history); tagged-cache read helpers; **replace the in-process config Maps**; Draft Mode wiring; migrate current `Tenant.config` → revision 1. |
| **1 — Auth + shell** | Cognito → `AdminUser` upsert; `Membership` gating; `/admin` layout + middleware guard + `requireRole`; tenant switcher for platform admins. |
| **2 — Config editor** | Schema-driven `TenantConfig` forms; the **first full draft → preview → publish → rollback loop** + audit log. Delivers end-to-end editing of branding/theme/contact/legal/marketing/feature flags **and SEO strings**. |
| **3 — SEO tools** | Per-page meta overrides (`PAGE_SEO` + per-route `generateMetadata` merge); dynamic sitemap (route registry + settings); redirects (`REDIRECTS` + middleware enforcement); per-page JSON-LD. |
| **4 — Media** | `StorageProvider` interface + S3-compatible adapter; `Asset` model; upload pipeline; asset pickers wired into config/SEO editors. |
| **5 — Relational content** | `OFFICER/RATE/TESTIMONIAL/PROGRAM` adopt row-level `status` + `Revision` snapshots + admin CRUD pages. |

## 10. Testing strategy

- **TDD** throughout (per project skills).
- **Unit:** versioning service (draft/publish/rollback/version increment); scoped-vs-
  unscoped client boundary; schema↔form generation; SEO metadata merge; redirect matching;
  RBAC role matrix.
- **Integration:** DB writes + tagged-cache invalidation on publish (a published change is
  observed by a subsequent read); Draft Mode read path returns draft content.
- **End-to-end:** one test proving the draft → preview → publish loop on a sample config
  field.
- **Accessibility:** WCAG AA on admin forms (real `<label>`s, focus rings, `aria-*`).
- **Regression:** MSFG's existing `generateMetadata` / `sitemap` / `robots` output is
  unchanged after the config-source migration.

## 11. Plan-time details to resolve (against Next 16 bundled docs)

These are known decision points to confirm during planning — not open design questions:

1. **Cache Components API shape:** exact `use cache` / `cacheTag` / `cacheLife` usage and
   `cacheHandlers` config key in this Next 16 build (`node_modules/next/dist/docs`).
2. **Middleware runtime for redirects:** edge vs node, and therefore how the redirect map
   is read (precomputed cache entry vs other). Middleware must not make a live Prisma call
   per request.
3. **Relational-content versioning mechanics (Phase 5):** whether `Revision.data` stores a
   full row snapshot or a diff; how list-level publish batches row changes.
4. **Tenant storage config (Phase 4):** shared platform bucket + key prefixes vs
   per-tenant bucket; exact `SecretStore` keys for storage credentials.

## 12. Non-goals (this design)

- Free-form page builder / drag-and-drop layouts.
- OG-image generation, a structured-data builder UI, SEO linting/health checks, and
  Google Search Console / analytics integrations.
- Editing page **layouts** (only the values that flow into them).
- Duplicating the `com.msfg.mortgage` LOS schema.
