# MSFG.us

The new public website for **Mountain State Financial Group, LLC** (MSFG): marketing pages, an AI mortgage assistant, the apply funnel, and a small admin CMS. Licensed in CO · ND · SD · MN · TX · MI · IN.

| | |
|---|---|
| Staging | <https://staging.msfg.us> (noindex) |
| Production | Not cut over yet. `msfg.us` still serves the previous site. |
| Hosting | Self-hosted on EC2: Next.js standalone bundle under pm2, behind nginx. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) |
| Repo | <https://github.com/vonzink/msfg.us> |

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Prisma 7 on PostgreSQL · Vitest.

Integrations: Go High Level (CRM), AWS Cognito (sign-in), the Mortgage Brain and DeepSeek/Claude (AI assistant), Google Places (address lookup), the MSFG loan application at app.msfgco.com (funnel hand-off).

## Getting started

```bash
npm install                 # also runs `prisma generate`
cp .env.example .env.local  # every variable is documented in .env.example
npm run db:up               # local Postgres in Docker (port 5434)
npx prisma migrate deploy   # apply migrations
npm run db:seed             # load officers, rates, programs
npm run dev                 # http://localhost:3000
```

Local database details and the schema-change workflow are in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Everyday commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run check` | Lint, typecheck and tests. Run this before you push. |
| `npm run lint` / `typecheck` / `test` | The three checks individually |
| `npm run test:watch` | Vitest in watch mode |
| `npm run build` | Production build (standalone bundle) |
| `npm run db:up` / `db:down` | Start / stop the local Postgres container |
| `npm run db:migrate` | Create and apply a migration against the local database |
| `npm run db:seed` | Seed content from `src/content/` |
| `npm run db:studio` | Browse the database in Prisma Studio |
| `npm run glossary:generate` | Rebuild `src/content/glossary.ts` from the markdown source |

## Where things live

```
src/
  app/            Routes only. Pages stay thin and hand off to components.
    (marketing)/  Public pages that share the nav and footer
    apply/        The apply funnel (own layout, no site chrome)
    admin/        CMS: site config, per-page SEO, officer sync
    auth/         Cognito login, callback, logout
    api/          v1/ = app and partner API, internal/ = cron endpoints
  components/     React components, grouped by the feature they belong to
  content/        Typed copy and configuration: nav, pages, funnel steps, legal text
  lib/            Shared helpers that are safe on client and server
  server/         Server-only code: AI, CMS, leads, integrations, tenant, webhooks
  validation/     Zod schemas for the lead and application API contracts
prisma/           Database schema, migrations, seed
scripts/          Deploy and maintenance scripts (see scripts/README.md)
public/           Static assets: brand logos, officer photos, the MBS training page
docs/             Guides, runbooks and design history (see docs/README.md)
test/             Shared test stubs. Tests themselves sit next to the code as *.test.ts
```

**[docs/CODEBASE.md](docs/CODEBASE.md) is the full map.** It has a folder-by-folder guide and a "I want to change X, where do I go?" table.

## Conventions

Code conventions, design tokens and the multi-tenant rules are in [AGENTS.md](AGENTS.md). It is written for AI coding agents and is just as useful for people.

## Local-only folders

These are gitignored and will not exist on a fresh clone.

- `design-reference/` holds the original design handoff (prototype HTML/JSX and the source zip). It is the visual reference for the site.
- `output/` holds Playwright screenshots from local QA runs.
