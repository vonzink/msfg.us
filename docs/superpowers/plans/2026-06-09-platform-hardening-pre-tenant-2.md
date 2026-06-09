# Platform Hardening (pre-tenant-#2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).
> **STATUS: NOT STARTED — deferred.** Execute this as one coherent phase **before onboarding tenant #2** (the acceptance test). Do NOT start piecemeal; nothing here has user-facing value while MSFG is the only (dedicated) tenant.

**Goal:** Close the tenant-isolation + config-ownership gaps a 2026-06-09 code audit found, so every tenant-owned concern resolves from tenant config / tenant DB rows / tenant secrets — not MSFG/static/global singletons.

**Why deferred:** MSFG runs in **dedicated mode** (`TENANT_MODE=dedicated`, `TENANT_SLUG=msfg`), so these are correctness gaps vs the *multi-tenant platform goal*, not live MSFG bugs. They bite the moment a shared deployment or a 2nd tenant exists. Pair execution with real tenant #2 onboarding (dedicated + shared) as the E2E acceptance test (the original Phase D intent).

**Audit source:** the 6/10 audit (Critical Issues §2, Structural §3). Verified-accurate findings. Already done as "quick-wins" (commit `e15624f`, NOT part of this plan): lint green, theme CSS-value validation.

**Tech Stack:** Next.js 16, TypeScript, Zod, Prisma 7/Postgres, Vitest. Conventions: tenant-scoped Prisma extension (`src/server/tenant/scoping.ts`), `getTenantDb()` / base `getDb()`, `SecretStore` (`src/server/secrets/`), `getTenantConfig()`.

**Sequencing (dependency order):**
T1 host→tenant resolution → T2 API-key tenant-scoping → T3 tenant content repos → T4 creds→TenantSecret → T5 DB FKs → T6 remove live SITE → T7 splits/typing. T2 depends on T1's resolver; T3 unblocks T2 reads; T4/T5/T6/T7 are largely independent.

---

### Task 1 — Shared-mode host→tenant resolution

**Problem (audit Critical #1):** `src/middleware.ts` writes the raw host into `x-tenant-slug`; `src/server/tenant/resolve.ts` trusts it as a *slug*. `acme.com` becomes slug `acme.com` (not the tenant whose `domains[]` contains it), and unknown hosts silently fall back to MSFG.

**Approach:**
- Add a host→tenant resolver backed by `Tenant.domains` (base `getDb()`, platform table). Cache per host (in-process map + short TTL, or `unstable_cache` tagged `tenants:domains`, busted when a tenant's domains change).
- Middleware (shared mode): set `x-tenant-id` (resolved tenant id), not a raw host. Or keep host in a header and resolve in `getTenant()` — but resolve **before** any tenant-scoped query.
- `getTenant()` (shared mode): look up by resolved id/host; **unknown host → 404/handled error**, never a silent MSFG fallback. Dedicated mode unchanged (pinned `TENANT_SLUG`).
- Normalize host (strip `www.`, port) consistently in one place.

**Files:** `src/middleware.ts`, `src/server/tenant/resolve.ts`, new `src/server/tenant/resolveHost.ts` (+ test).
**Acceptance:** unit tests for domain-map lookup (exact host, `www.` variant, unknown→error, dedicated bypass); a shared-mode integration check that two hosts resolve to two different tenants.

---

### Task 2 — Public API tenant-scoping by API key

**Problem (audit Critical #2):** `src/server/api/auth.ts` returns an auth record **without `tenantId`** (DB-key branch ~line 149; env-key branch has none). `src/server/api/respond.ts` passes only `apiKey`; `src/app/api/v1/public/leads/route.ts` calls `captureLead` which resolves tenant from host/default — not the key. So a partner key can write/read against the wrong tenant.

**Approach:**
- `ApiKey` rows already carry `tenantId`. Make the auth record `{ keyId, tenantId, scopes, source }`. Env-keys (bootstrap) → map to the configured platform/default tenant explicitly (documented), or deprecate env keys for multi-tenant.
- `withPublicApi`/`respond.ts` thread the resolved `tenantId` into a request context (`{ tenantId, keyId, scopes }`).
- New `src/server/public-api/authenticate.ts` (returns the record) + `context.ts` (builds the tenant-scoped context).
- Write endpoints: `captureLead` (and any write) take the key's `tenantId` — use `getTenantDbById(tenantId)` (Task 3 helper), never host/default.
- Read endpoints: serve the key's tenant (Task 3 repos).

**Files:** `src/server/api/auth.ts`, `src/server/api/respond.ts`, `src/app/api/v1/public/{leads,rates,programs,loan-officers}/route.ts`, new `src/server/public-api/{authenticate,context}.ts`, `src/server/leads/leadService.ts` (accept explicit tenantId).
**Acceptance:** a DB key for tenant B → `POST /public/leads` writes a Lead with `tenantId=B`; reads return B's content; an env/unknown key path is explicit (not silent-MSFG). Tests for auth record shape + tenant routing.

---

### Task 3 — Tenant content repositories (replace static reads)

**Problem (audit Critical #2 / Structural):** public `rates`/`programs`/`loan-officers` routes import static `@/content/*` (`RATE_DATA`, `CATS`, `OFFICERS`) instead of the tenant DB (which already has seeded rows).

**Approach:**
- New `src/server/content/{rates,programs,officers}.ts`: `listRates(tenantId)`, `listPrograms(tenantId)`, `listOfficers(tenantId)` — base `getDb()` with explicit `tenantId` (or a new `getTenantDbById`). Map DB rows → the public DTO shape currently produced from `@/content/*`.
- Add `getTenantDbById(tenantId)` to `src/lib/db.ts` (scoped client bound to an explicit tenant, for API-key/admin workflows) — audit Structural "normalize data access".
- Public read routes + the marketing pages (where they read static content for live data) call the repos. Keep `@/content/*` **only** as seed source (`prisma/seed.ts`) and typed default fallback.

**Files:** new `src/server/content/*.ts` (+ tests), `src/lib/db.ts` (`getTenantDbById`), the 3 public read routes, marketing rate/officer/program surfaces.
**Acceptance:** public reads reflect DB rows (edit a rate row → API shows it); `@/content/*` no longer imported by route handlers (grep guard in a test); repos are tenant-scoped (tenant B sees only B's rows).

---

### Task 4 — Integration credentials → TenantSecret + tenant integration config

**Problem (audit Critical #3 / Structural):** GHL (`ghlClient.ts`), LOS (`losClient.ts`), S3 (`s3.ts`), and AI provider creds are global env. This is the deferred "C2" work.

**Approach:**
- Per-tenant **integration config** in `TenantConfig` (non-secret: base URLs, IDs, feature flags) + per-tenant **secrets** in `TenantSecret` (tokens/keys) behind the existing `SecretStore`.
- `src/server/integrations/registry.ts`: `getIntegrations(tenant)` → resolves CRM/LOS/storage providers from tenant config + secrets (mirrors the `AiProvider`/`getMortgageBrain` pattern). Route handlers depend on interfaces, never read env creds directly.
- Keep env only for **bootstrap** secrets (`DATABASE_URL`, `TENANT_SECRETS_KEY`) + a documented env→secret transition fallback for MSFG during migration (as `getAiProvider` already does for `DEEPSEEK_API_KEY`).

**Files:** `src/server/integrations/{registry.ts,ghl/*,los/*}`, `src/server/storage/s3.ts`, `src/content/site.ts` (integration config sections + Zod), seed/seal scripts.
**Acceptance:** GHL/LOS/S3/AI creds resolve from `TenantSecret`/config for a given tenant; no integration reads `process.env.<cred>` directly (grep guard); MSFG keeps working via the seeded secrets + transition fallback.

---

### Task 5 — Database-enforced tenant ownership (FKs)

**Problem (audit Critical #5):** tenant-owned models carry `tenantId` but have **no FK to `Tenant`** — orphan rows / tenant-mismatch possible if the app-layer scoping is bypassed.

**Approach:**
- Add `tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)` to every tenant-owned model; add the back-relation on `Tenant`. Migration is additive (the FK + index); verify no orphan rows first (data check) then add `NOT VALID` → `VALIDATE` on the live RDS to avoid a long lock.
- Optional: composite-FK consistency for child→parent rows that also carry tenantId (e.g. `ApplicationStep`→`Application`) so a child can't reference a parent in another tenant.

**Files:** `prisma/schema.prisma`, a new migration, a pre-migration orphan-check script.
**Acceptance:** migration applies cleanly to a copy of prod; inserting a row with a non-existent `tenantId` is rejected by the DB; existing data validates.

---

### Task 6 — Remove live `SITE` singleton uses

**Problem (audit Critical #3):** the deprecated `SITE` shim (`src/content/site.ts`) is still live in env redirects (`src/lib/env.ts`), OpenAPI output (`openapi.json/route.ts`), and the dormant chat fallback copy (`ai/chat/route.ts`).

**Approach:** migrate each live `SITE.*` reader to `getTenantConfig()` (or the request tenant's origin/brand). OpenAPI: build per-tenant `servers`/info from the resolved tenant (Task 7 split helps). Auth redirect URIs: derive from the tenant origin. Keep `DEFAULT_TENANT_CONFIG` as **seed/fallback only**; reduce/remove `SITE` once no live importers remain.

**Files:** `src/lib/env.ts`, `src/app/api/v1/public/openapi.json/route.ts`, `src/app/api/v1/ai/chat/route.ts`, `src/content/site.ts` (shrink the shim).
**Acceptance:** grep shows no live (non-seed/fallback) `SITE` imports; auth/openapi/chat strings reflect the resolved tenant.

---

### Task 7 — Module splits + scoping typing (maintainability)

**Problem (audit Structural §3 + the deferred lint disable):** `src/server/ai/tools.ts` (~404 lines) mixes tool schemas + mortgage math + static catalogs + lead capture; the OpenAPI route owns a ~300-line spec; `src/server/tenant/scoping.ts` uses `Record<string, any>` (currently a justified eslint-disable).

**Approach:**
- Split `src/server/ai/tools.ts` → `src/server/ai/tools/{payment,rates,programs,leadCapture,index}.ts` (schemas + impls per tool; `index.ts` assembles `TOOLS` + `runTool`). Tools read tenant content via Task 3 repos.
- Split `openapi.json/route.ts` → reusable schema/build modules; the route assembles the response.
- Replace `scoping.ts` `Record<string, any>` with precise generics over Prisma op args (remove the disable) — do this carefully with full tests; it's the tenant-isolation core.

**Files:** `src/server/ai/tools/*`, `src/app/api/v1/public/openapi.json/` + a `src/server/api/openapi/*` builder, `src/server/tenant/scoping.ts`.
**Acceptance:** behavior-identical (tool calls + OpenAPI output unchanged in tests); scoping tests still pass with the precise types; no file regress >500 lines.

---

## Out of scope (fold into normal cleanup, not this phase)
- Hardcoded color tokenization (cosmetic; some are intentional one-offs).
- Logging consistency (route `console.error` → structured logger).
- `vite-tsconfig-paths` redundancy (trivial config cleanup).

## Acceptance for the phase
Onboard a **real tenant #2** end-to-end (one dedicated, one shared host) using only **config + seed + secrets, no code** — proving every tenant-owned concern resolves per-tenant. MSFG stays byte-identical throughout.
