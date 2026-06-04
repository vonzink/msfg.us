# Design: Multi-tenant platform foundation

**Status:** Approved (design) · **Scope:** Foundation only · **Date:** 2026-06-04

## Context

The codebase began as the single-company marketing site for **Mountain State Financial Group (MSFG)** — AI-first mortgage funnel, lead pipeline, GHL/Cognito/LOS integrations, a public API, and a self-hosted deployment. The owner now intends to run it for **many mortgage companies, small to large**, with per-company branding, APIs, AI providers, integrations, and the ability to deploy on **Docker, Vercel, or AWS**.

We are converting it into a **multi-tenant platform** before building more, so the expensive-to-retrofit parts (tenant scoping, config/secret isolation, provider pluggability, deploy portability) are done right and we don't rebuild later.

**Decisions locked (via discussion):**
- **Tenancy = Hybrid.** The app is *always* tenant-aware; a "dedicated" deployment is the same app pinned to one tenant with its own DB. One codebase, two run modes.
- **First pass = Foundation only.** Tenant-awareness, per-company config/branding/providers/integrations, pluggable AI (OpenAI/Claude/DeepSeek), portable deploy, tenant-scoped API + outbound webhooks — with **MSFG as tenant #1**. No admin UI, onboarding, billing, or analytics yet.
- **Per-tenant secrets = AES-256-GCM envelope encryption in the DB**, master key (KEK) in env, behind a `SecretStore` interface (KMS backend can be added later per tenant).
- MSFG stays **live throughout** the migration.

## Goals / Non-goals

**Goals:** add a company with **config + seed, never code**; per-tenant branding, copy, domains, AI provider+key, CRM/auth/LOS integrations, API keys, and outbound webhook subscriptions; run on Vercel **or** Docker/AWS unchanged; strict cross-tenant data isolation.

**Non-goals (later phases):** tenant admin UI · self-serve onboarding · billing/metering · per-tenant analytics dashboards · **2FA + passkeys (WebAuthn)** for admin/end-user auth · KMS/HSM-backed secrets.

## Architecture

### 1. Tenant model & resolution
- `Tenant` (id, slug, name, `domains String[]`, status, createdAt). Every tenant-owned row gains a non-null `tenantId` FK: Lead, LoanOfficer, RateRow, LoanProgram, Testimonial, Application, ApplicationStep, ChatSession, ChatMessage, WebhookEvent, ApiKey, plus the new config/secret/subscription tables.
- **Query isolation:** a Prisma client extension injects `tenantId` into every read/write for tenant-owned models, so a query cannot read or write across tenants by construction (defense beyond manual `where` clauses).
- **Resolution:** Next.js **middleware** maps the request `host` → tenant (custom domain or `<slug>.platform`) and attaches a request-scoped tenant context. **Dedicated mode:** `TENANT_SLUG` env pins one tenant and skips host lookup (own DB, single-tenant deployment). `TENANT_MODE = shared | dedicated`.
- Unknown host → a neutral 404/landing (never another tenant's content).

### 2. Per-tenant config & secrets
- `TenantConfig` (or typed JSON on `Tenant`): branding (logo/wordmark URLs, color tokens, font), site copy/legal (NMLS, licensed states, contact, disclosures), feature flags, and **integration settings** (AI provider+model; GHL location/pipeline/stage IDs; Cognito client id/domain; LOS base; public-API + webhook settings). Today's `src/content/*` + `SITE` become **MSFG's seeded defaults + the shape**, not the live source.
- `TenantSecret` (tenantId, key name, `ciphertext`, `iv`, `authTag`, `keyVersion`) — see Security. Holds AI keys, GHL token, Cognito secret, webhook signing secrets, partner-API secrets.

### 3. Branding / theming (runtime)
- Design tokens move from build-time CSS `@theme` to **runtime CSS variables** injected per tenant (a `<TenantTheme>` server component sets `--color-*`, radii, etc. on `:root` from the resolved tenant config). MSFG's current values are the **default fallback**. Logo/wordmark/copy come from tenant config. The design-system primitives and utility names are unchanged — only the *source* of the values changes.

### 4. Pluggable AI providers
- `AiProvider` interface (streaming chat + tool-calling) with adapters: **`OpenAICompatibleProvider`** (OpenAI, DeepSeek, and any compatible endpoint — differ only by baseURL/model/key) and **`AnthropicProvider`** (Claude — different wire format). `getAiProvider(tenant)` selects from tenant config. The system prompt, tools, guardrails, transcript recording, and the widget's SSE protocol stay shared/provider-agnostic. (Generalizes the current OpenAI-compatible layer and re-adds Claude.)

### 5. Pluggable integrations
- `CrmClient` (GHL today), auth (Cognito today), and the LOS client are already behind interfaces. They become **tenant-configured** — `getIntegrations(tenant)` builds clients from the tenant's settings + decrypted secrets — instead of reading global env.

### 6. External API + webhooks (tenant-scoped)
- **Inbound public API** (`/api/v1/public/*`): `ApiKey` gains `tenantId`; keys authenticate *and* scope all data to one tenant.
- **Inbound provider webhooks** (GHL etc.): resolve the tenant from the route/payload + signature.
- **Outbound webhooks (NEW):** `WebhookSubscription` (tenantId, destination URL, subscribed events, signing secret, active). The app emits **domain events** (`lead.created`, `application.submitted`, `chat.completed`, …); a **delivery worker** POSTs HMAC-signed payloads to subscribers with retries + exponential backoff + a `WebhookDelivery` log (status, attempts, response). This is the "transfer data to external systems other companies use" requirement.

### 7. Deployment portability
- Add a multi-stage **`Dockerfile`** (build → `output: standalone` runtime) so the app runs on any container host (AWS/ECS/EC2/VPS). **Vercel** stays native (no Docker). Current **EC2 + pm2** keeps working (already standalone). All configuration via **env + tenant DB** (12-factor). `TENANT_MODE`/`TENANT_SLUG` select shared vs dedicated.

## Security — per-tenant secrets

- **Envelope encryption.** A single master key (KEK), `TENANT_SECRETS_KEY` (256-bit, base64), lives in the deployment env. Each per-tenant secret is sealed with **AES-256-GCM** (authenticated) using a random 96-bit nonce; we persist `{ciphertext, iv, authTag, keyVersion}`. Pure Node `crypto` — zero deps, identical on Vercel/Docker/AWS.
- **`SecretStore` interface** (`seal(plaintext) → blob`, `open(blob) → plaintext`). Default `EnvelopeAesSecretStore` (env KEK). A `KmsSecretStore` can implement the same interface later for tenants requiring HSM-grade keys — no change to stored data.
- **Key property:** the KEK is **not** in the DB, so a DB dump alone is useless. Rotation via `keyVersion` (introduce `…_V2`, re-encrypt over time). Decrypt **only at point of use**; never log plaintext secrets.
- **Bootstrap secrets** (`DATABASE_URL`, the KEK itself) stay in env by necessity. Only *per-tenant* secrets move into the encrypted store.
- **Caveat (accepted):** the KEK lives in the app env, so a host compromise exposes secrets (true of any app secret). KMS is marginally stronger; the interface lets us upgrade per tenant without rework.

## Migration path (MSFG stays live)

- **Phase A — Tenant core.** Add `Tenant` + `tenantId` to all tenant-owned tables; backfill every existing row to the MSFG tenant; add the Prisma scoping extension; add resolution middleware running in **dedicated mode pinned to MSFG** → *zero behavior change*. Ship + verify MSFG identical.
- **Phase B — Config & branding.** Introduce `TenantConfig`; seed MSFG from today's `SITE`/`content`/tokens; switch the app to read tenant config; runtime theming. MSFG renders identically from config.
- **Phase C — Providers & integrations.** `AiProvider` abstraction (OpenAI/Claude/DeepSeek) + `SecretStore`; move integration creds into encrypted per-tenant secrets; `getAiProvider`/`getIntegrations(tenant)`.
- **Phase D — API & webhooks & portability.** Tenant-scope `ApiKey` + public API; add the outbound `WebhookSubscription` + event/delivery system; add the `Dockerfile`. Then: onboard a real second company as the acceptance test.

## What's already future-proof vs. what changes

- **Already aligned:** integration interfaces (`CrmClient`, webhook registry, LOS), env-driven config, `/api/v1` versioning, OpenAI-compatible AI layer, `output: standalone`, lazy env validation.
- **Changes:** add tenant scoping everywhere; build-time tokens → runtime per-tenant CSS vars; global env creds → per-tenant encrypted secrets; single `SITE`/content → tenant config + seeded defaults; add the second AI adapter (Claude), the outbound webhook platform, and the Dockerfile.

## Risks / open items

- Cross-tenant leakage is the top risk → the Prisma scoping extension + tests are mandatory, not optional.
- Runtime theming must avoid FOUC/CLS (inject CSS vars server-side before paint).
- Outbound webhook delivery needs idempotency + retry caps + a dead-letter view (delivery log).
- Deferred: admin UI, onboarding, billing, per-tenant analytics, **2FA/passkeys (WebAuthn)**, KMS-backed secrets.
