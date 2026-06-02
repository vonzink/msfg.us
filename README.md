# MSFG.us — marketing website

The new public marketing site for **Mountain State Financial Group, LLC** (MSFG) — an AI-first, conversion-focused mortgage funnel. Licensed in CO · ND · SD · MN · TX · MI · IN.

> Built from the design handoff in `MSFG.us.zip` (extracted to `design-reference/`, gitignored). The prototype there is the visual source of truth; this app recreates it in production Next.js. Full project plan: see the GSD plan referenced by the team.

## Stack

- **Next.js 16** (App Router) · **React 19** · **TypeScript**
- **Tailwind CSS v4** (CSS-first `@theme` tokens in `src/app/globals.css`)
- **Prisma 7** → **PostgreSQL** (AWS RDS) via the `@prisma/adapter-pg` driver adapter
- **Go High Level** (GHL) lead sync · **AWS Cognito** SSO (Phase 4) · **Anthropic Claude** assistant (Phase 2)
- Hosted on **Vercel** (staging-first)

## Getting started

```bash
npm install                 # also runs `prisma generate`
cp .env.example .env.local  # fill in DATABASE_URL etc. (see below)
npm run dev                 # http://localhost:3000
```

### Environment

Copy `.env.example` and set, at minimum, `DATABASE_URL`. GHL lead sync stays in `SKIPPED` state until `GHL_API_TOKEN` + `GHL_LOCATION_ID` are set. See `.env.example` for the full list (`DIRECT_URL`, `GHL_*`, `CRON_SECRET`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SITE_ENV`).

### Database

```bash
npm run db:migrate   # create/apply migrations against your dev DB
npm run db:seed      # load placeholder officers / rates / programs / testimonials
npm run db:studio    # browse + edit data
```

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` / `start` | Production build / serve |
| `npm run lint` | ESLint |
| `npm run db:migrate` / `db:deploy` | Prisma migrations (dev / prod) |
| `npm run db:seed` | Seed placeholder content |
| `npm run db:studio` | Prisma Studio |

## Structure

```
src/
  app/
    (marketing)/        # public pages (Nav + Footer layout): home, buy, refinance,
                        #   home-equity, rates, loan-officers
    apply/[intent]/     # the page-by-page application wizard (own chrome)
    api/v1/             # leads, health, webhooks/[provider]  (+ api/internal/retry-ghl)
    layout.tsx globals.css robots.ts sitemap.ts
  components/           # ui/ (primitives), nav/, home/, category/, rates/, officers/, apply/
  content/              # typed content + config (site, nav, categories, rates, officers, flows, ai-script)
  lib/                  # cn, finance, db, env, schema, leads
  server/               # leads/ (service), integrations/ghl/ (CRM client), webhooks/
  validation/           # zod schemas
prisma/                 # schema.prisma + seed.ts
```

## Status (Phase 1)

Pixel-faithful marketing site + lead capture pipeline (Postgres + GHL, idempotent, best-effort sync). AI widget is scripted; the apply account step is a UI mock. Next phases: Claude assistant + chat recording (P2), full GHL suite (P3), Cognito SSO into app.msfgco.com (P4), public API/webhook platform (P5).

**Before apex launch:** real NMLS #, loan-officer roster, rate feed, logo SVGs, GHL credentials, AWS Postgres connection, and DNS for `msfg.us`. Search the codebase for `[PLACEHOLDER]`.

See `AGENTS.md` for code conventions.
