<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Platform direction — multi-tenant (READ FIRST)

This codebase is becoming a **multi-tenant platform** for many mortgage companies (hybrid: shared multi-tenant *and* dedicated single-tenant deployments from one codebase). **MSFG is tenant #1.** Full design: `docs/superpowers/specs/2026-06-04-multi-tenant-platform-design.md`. Build it foundation-first; MSFG stays live throughout.

**Invariants (do not violate):**
- **Tenant-aware always.** Every request resolves a tenant (by host, or pinned via `TENANT_SLUG` in dedicated mode). Every tenant-owned row carries `tenantId`; queries are tenant-scoped (Prisma extension) — never read/write across tenants.
- **No global singletons for config, secrets, or providers.** Branding, copy, AI provider+model, and integration creds come from **per-tenant config**, not module-level `SITE`/env. A new company = **config + seed, never code.**
- **Secrets:** per-tenant secrets are **AES-256-GCM envelope-encrypted in the DB** behind the `SecretStore` interface (master key `TENANT_SECRETS_KEY` in env). Only bootstrap secrets (`DATABASE_URL`, the KEK) live in env. Never log plaintext secrets; decrypt at point of use.
- **Pluggable AI:** all model calls go through the `AiProvider` interface — OpenAI/DeepSeek (OpenAI-compatible adapter) and Claude (Anthropic adapter), selected per tenant. Don't import a vendor SDK directly in a route. The assistant's **grounding/RAG** goes through a `KnowledgeRetriever` interface (tenant-aware — shared mortgage corpus + per-tenant docs; external RAG service or built-in pgvector). Keep the chat route provider- *and* retriever-agnostic; never hardcode a model or knowledge source.
- **Pluggable integrations** behind interfaces in `src/server/integrations/` (CRM/auth/LOS), tenant-configured.
- **Portable deploy:** must run on **Vercel** (native) *and* **Docker/AWS** (`output: standalone`). 12-factor: all runtime config via env + tenant DB. No host-specific APIs in app code.
- **External data:** inbound public API (`/api/v1/public/*`) is tenant-scoped by API key; outbound **webhook subscriptions** deliver signed domain events to companies' external systems.

The MSFG-specific conventions below remain the **defaults for tenant #1** and the design-system rules.

# MSFG.us — conventions

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · Prisma 7 / Postgres. Path alias `@/*` → `src/*`. **Visual source of truth:** `design-reference/design_handoff_msfg_site/` (read `PAGES.md` + the relevant `prototype/*` files; match high fidelity).

## Design tokens (Tailwind v4)

All tokens live in `src/app/globals.css` `@theme` and generate utilities. **Never hardcode hex** — use the token utilities:

- Emerald: `green-900/850/800/700/600/glow` · Action green: `spring`/`spring-2`/`spring-3`/`spring-soft` · Headline: `mint`
- Neutrals: `ink`, `paper`, `paper-2`, `muted`, `line` · On-dark: `on-dark`/`on-dark-2`/`on-dark-3`, `hair-dark`
- `rounded-sm/md/lg/xl/full` · `shadow-card/3d/pop/hero` · body font is Hanken (`font-sans`)
- Global helper classes: `wrap` (1240px container), `press-3d` (green-button 3D lip press), `step-in` (apply-step entrance), `hero-bg`, `cta-glow`, `ai-text`
- Responsive breakpoint is **980px** → use `max-[980px]:` / `min-[981px]:` (and `max-[900px]:` / `max-[600px]:` for grids)

## Primitives (reuse — don't recreate)

`@/components/ui/Button` (variant green|ghostDark|white|dark|ghost, size sm|md|lg, polymorphic via `href`) · `ui/Mark` · `ui/Section` (+ `SectionHead`, `Eyebrow`) · `ui/Switch` · `@/components/CtaBand` · `@/components/nav/Nav` + `Footer` (global chrome, in the `(marketing)` layout) · `@/lib/cn`, `@/lib/finance`.

## Patterns

- **Server Components by default.** `"use client"` only for interactivity (widgets, wizard, estimator, filters, toggles).
- **Content & config** live in typed `src/content/*.ts` modules; placeholder values are tagged `// [PLACEHOLDER]`. Phase 1 pages read these modules; they are also the seed source for Postgres.
- **Lead pipeline:** client → `POST /api/v1/leads` → `captureLead` (Postgres system-of-record, idempotent on `idempotencyKey`) → best-effort GHL sync (never blocks the user). Integrations sit behind interfaces in `src/server/integrations/` — route handlers depend on the interface, never a vendor SDK.
- **API:** public-stable under `/api/v1/*`; internal helpers under `/api/internal/*`. Webhook receiver verifies signature → dedupes on `WebhookEvent` → dispatches via registry.
- **a11y (WCAG AA):** mint/spring greens only on dark or as button bg with dark text — never small text on light. Keep visible focus rings; real `<label>`s; `aria-*` on disclosures/icon buttons.

## Don't

- Don't ship the prototype HTML; don't pull from `/MSFG/paint/` (unrelated image editor); don't duplicate the `com.msfg.mortgage` LOS schema (Phase 4 hands off to it).
- Don't call `Date.now()`/`new Date()` at module/render scope in statically-generated pages (breaks SSG determinism) — fine inside request-time route handlers.
