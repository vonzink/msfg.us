# Codebase map

How the repo is laid out, and where to go to change a given thing. Path alias: `@/` means `src/`.

## The one thing to know first

**Site-wide copy and settings have a default in code and a live value in the database.**

`src/content/site.ts` defines the shape of the site configuration (company name, phone, NMLS number, licensed states, logos, legal lines, AI settings) and MSFG's defaults. At runtime the app reads the **published config revision from the database** through `getTenantConfig()` in `src/server/tenant/config.ts`. The code default is only used when the database has no published revision.

So if you edit a value in `site.ts` and staging does not change, that is why. Change the live value at `/admin/config`, which publishes a new revision. Per-page titles and descriptions work the same way through `/admin/seo`.

Marketing pages are statically prerendered, so they pick up a new revision on the next deploy or cache revalidation.

## Folder guide

### `src/app/` (routes)

Route files stay thin: metadata plus a component from `src/components/`.

| Path | What is there |
|---|---|
| `layout.tsx`, `globals.css` | Root layout, fonts, tenant theme, and every design token (Tailwind v4 `@theme`) |
| `(marketing)/` | Public pages. `layout.tsx` wraps them in the nav and footer. One folder per URL. |
| `(marketing)/page.tsx` | Homepage |
| `(marketing)/buy`, `refinance`, `home-equity`, `veterans`, `reverse`, `investment`, `commercial` | Loan category pages. All render the same `CategoryPage` template with a different config key. |
| `(marketing)/calculators/investment` | Route for the investment property calculator. The calculator itself is in `src/calculators/investment/`. |
| `(marketing)/resources/mortgage-glossary` | Glossary |
| `(marketing)/licensing`, `privacy-notice`, `privacy-policy`, `terms`, `accessibility`, `texas-required-notice`, `nmls-consumer-access` | Legal and compliance pages |
| `apply/[intent]/` | The apply funnel for `buy`, `refi` and `cash`. Has its own layout with no site chrome. |
| `admin/` | CMS. `config/` edits site configuration, `seo/` edits per-page SEO, `officers/` re-imports the officer roster, `preview/` toggles draft preview. |
| `auth/` | Cognito `login`, `callback`, `logout` route handlers |
| `api/v1/` | App endpoints: `leads`, `applications`, `ai/chat`, `ai/ask`, `address`, `auth/me`, `health`, `webhooks/[provider]` |
| `api/v1/public/` | Partner API, authenticated by API key. `openapi.json` is its spec, shown at `/developers`. |
| `api/internal/` | Cron targets. `retry-ghl` retries failed CRM syncs. |
| `sitemap.ts`, `robots.ts` | XML sitemap and robots rules |

`/calculators/mbs` is not a route in `src/app`. It is a static page in `public/calculators/mbs/`, generated from the msfg-calc repo by `scripts/sync-where-the-money-goes.mjs` and wired up by a rewrite in `next.config.ts`.

### `src/components/` (UI)

Grouped by feature. Server Components by default, `"use client"` only where there is interaction.

| Folder | What is there |
|---|---|
| `ui/` | Primitives: `Button`, `Section`, `Mark`, `Switch`, `Breadcrumb`. Reuse these before writing new ones. |
| `nav/` | Header, mega-nav, mobile drawer, sign-in link |
| `Footer.tsx`, `CtaBand.tsx` | Site-wide footer and the call-to-action band used at the bottom of pages |
| `home/` | Homepage sections. `hero-chat/` is the AI chat in the hero. |
| `category/` | The category page template and its quick payment estimator |
| `apply/` | Funnel shell (`Wizard`), one component per step type in `steps/`, and the in-funnel AI panel in `ask-ai/` |
| `ai/` | The "Ask AI" launcher and markdown renderer for chat answers |
| `glossary/`, `officers/`, `rates/`, `legal/` | The body of each of those pages |
| `seo/` | JSON-LD structured data tags |
| `integrations/` | Go High Level chat widget, calendar embed, schedule-a-call button |
| `theme/` | Injects per-tenant brand colors as CSS variables |
| `admin/fields/` | Form fields for the admin editors |

### `src/calculators/` (calculators)

One self-contained folder per calculator: component, model, and tests. See "Adding a calculator" below.

### `src/content/` (copy and configuration)

Typed modules. This is where most wording changes happen.

| File | Controls |
|---|---|
| `site.ts` | Site configuration schema and MSFG defaults. Read "The one thing to know first" above. |
| `nav.ts` | Header menus and footer columns |
| `categories.ts` | Everything on the loan category pages: headline, programs, stats, estimator fields |
| `flows.ts` | Apply funnel steps, questions and options for each intent |
| `applyChatStarters.ts` | Suggested questions shown in the funnel's AI panel |
| `rates.ts` | Rate table shown on `/rates` |
| `officers.ts` | Bundled loan officer roster. Used as the seed source, and as a fallback when the officers table is empty. |
| `offices.ts` | Office directory on `/about` |
| `legal/` | Text of each legal page |
| `glossary.ts` | **Generated.** Do not edit. Edit `scripts/glossary-source/glossary-terms.md` and run `npm run glossary:generate`. |

### `src/lib/` (shared helpers)

| Path | What is there |
|---|---|
| `env.ts` | Validated server environment (`serverEnv`) and the "is this integration configured" checks |
| `db.ts` | Prisma client. `getTenantDb()` is tenant-scoped, `getDb()` is not. |
| `auth/` | Cognito helpers, session cookies, the `useAuth` client hook |
| `seo/` | `buildMetadata` for page metadata, `structuredData` for the homepage schema.org block |
| `leads.ts` | Browser-side lead and contact-request submission |
| `applyFields.ts`, `applyIntake.ts` | Funnel answer formatting, and mapping a lead into the loan application's intake format |
| `finance.ts` | Payment math shared across the site |
| `glossary/` | Glossary markdown parser and slug helper |
| `siteMap.ts` | Link groups for the human-readable `/sitemap` page |
| `analytics.ts`, `log.ts`, `cn.ts` | Event names, structured logger, class-name merge |

### `src/server/` (server-only)

Code that must never reach the browser. Vendor SDKs are wrapped behind interfaces so routes never import them directly.

| Folder | What is there |
|---|---|
| `tenant/` | Resolves which company a request is for, loads its config, scopes database queries to it |
| `cms/` | Versioned revisions behind the admin editors (draft, publish, history), per-page SEO |
| `admin/` | Admin roles and access checks |
| `leads/` | Lead capture service. Postgres is the record, CRM sync is best-effort. |
| `ai/` | Assistant prompt, tools, transcript recording. `providers/` holds the model adapters, `brain/` the Mortgage Brain client. |
| `integrations/` | `ghl/` CRM client, `los/` hand-off to the loan application, `address/` Google Places |
| `officers/` | Officer directory reads and the S3 roster import |
| `secrets/` | Encrypted per-tenant secrets |
| `api/` | Partner API auth, rate limiting, response helpers |
| `webhooks/` | Inbound webhook verification, dedupe and handlers |

### Outside `src/`

| Path | What is there |
|---|---|
| `prisma/schema.prisma`, `prisma/migrations/` | Database schema and its migration history |
| `prisma/seed.ts` | Seeds the database from `src/content/` |
| `scripts/` | Deploy and maintenance scripts. See `scripts/README.md`. |
| `public/brand/`, `public/officers/` | Logos and officer headshots |
| `test/stubs/` | Stub that lets Vitest import `server-only` modules |
| `next.config.ts` | Standalone output, image hosts, the `/calculators/mbs` rewrite |

## I want to change...

| Goal | Go to |
|---|---|
| Company phone, email, NMLS, states, logo, legal footer line | `/admin/config` for the live value. `src/content/site.ts` for the default. |
| A page's title or meta description | `/admin/seo` if the page is listed there. Otherwise the `buildMetadata(...)` call in that page's `page.tsx`. |
| Header or footer links | `src/content/nav.ts` |
| Wording on a loan category page | `src/content/categories.ts` |
| A question or option in the apply funnel | `src/content/flows.ts` |
| How a funnel step looks or behaves | `src/components/apply/steps/` |
| The homepage hero or its chat | `src/components/home/` |
| The rate table | `src/content/rates.ts` |
| A loan officer's details | The S3 roster, then re-import it at `/admin/officers`. `src/content/officers.ts` is the fallback copy. |
| A glossary term | `scripts/glossary-source/glossary-terms.md`, then `npm run glossary:generate` |
| Legal page text | `src/content/legal/` |
| Colors, radii, shadows, fonts | `@theme` in `src/app/globals.css` |
| What the AI assistant says or may do | `src/server/ai/prompt.ts` and `src/server/ai/tools.ts` |
| Which AI model is used | The `ai` section of the site config (default in `src/content/site.ts`). Adapters live in `src/server/ai/providers/`. |
| What gets sent to the CRM for a lead | `src/server/integrations/ghl/mappers.ts` |
| A database table or column | `prisma/schema.prisma`, then follow `docs/DEVELOPMENT.md` |
| An environment variable | Add it to `src/lib/env.ts` and document it in `.env.example` |

## Adding a marketing page

1. Create `src/app/(marketing)/<slug>/page.tsx`. Copy `buy/page.tsx` for the smallest working example.
2. Export `generateMetadata` using `buildMetadata("/<slug>", { title, description })`.
3. Add the path to `ROUTES` in `src/app/sitemap.ts` so it appears in the XML sitemap.
4. Link it from `src/content/nav.ts`. The `/sitemap` page builds itself from the nav.
5. Optional: add it to `SEO_ROUTES` in `src/app/admin/seo/routes.ts` to make its SEO editable in the admin.

## Adding a calculator

Calculators live in `src/calculators/`, one folder per calculator. Everything for a calculator goes in its folder except the route file. Copy `src/calculators/investment/` as the starting point.

```
src/calculators/
  investment/
    InvestmentCalculator.tsx   the "use client" component people interact with
    math.ts                    the model: pure functions, no React and no DOM
    fields.ts, gauges.ts       field definitions and rating scales
    Charts.tsx, Gauge.tsx      pieces of the UI
    *.test.ts                  tests, beside the file they cover
```

Steps for a new one:

1. Create `src/calculators/<name>/` with the same shape. Name the folder after the URL slug.
2. Add the route at `src/app/(marketing)/calculators/<name>/page.tsx`. Copy the investment one. It holds only metadata, breadcrumb, heading, and the calculator component.
3. Link it from `src/content/nav.ts` and add the path to `ROUTES` in `src/app/sitemap.ts`.

When two calculators need the same input, gauge or chart, move that piece to `src/calculators/shared/` rather than importing from one calculator into another.

Shared money helpers such as `formatUSD` and the amortization formula are in `src/lib/finance.ts`. Reuse them so every calculator rounds and formats the same way.

**Do not put calculator source in `public/calculators/`.** Next.js serves everything under `public/` to visitors exactly as it is on disk and never compiles it. That folder is only for finished static pages, such as `mbs/`, which is generated from the msfg-calc repo and must not be edited by hand.

## Tests

Tests sit beside the file they cover as `*.test.ts` and run with Vitest in a Node environment. There are no browser or component-render tests, so logic worth testing is kept in plain `.ts` files next to the component, as in `components/apply/steps/officerSearch.ts`.
