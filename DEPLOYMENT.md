# MSFG.us — Deployment runbook (staging → apex)

Deploy target: **Vercel** (GitHub-connected) · data/auth in **AWS** · **staging-first**, then cut over to the apex `msfg.us`.

Everything is env-driven and degrades gracefully — you can deploy with a subset of credentials and light up each integration as its env vars are added. The app builds and runs with no secrets at all.

---

## 0. Prerequisites

- A **GitHub** account (create a **private** repo for this code).
- A **Vercel** account.
- An **AWS Postgres** database reachable from Vercel (public endpoint + SG allowlist, or RDS Proxy / PgBouncer). For serverless, prefer a **pooled** `DATABASE_URL` and a direct `DIRECT_URL` for migrations.
- The credential values you'll set as env vars (see the table in §7). None are committed — set them in Vercel + a local `.env.local`.
- DNS control for `msfg.us` (to add `staging.msfg.us`, then the apex).

---

## 1. Push the repo to GitHub

The project is already a git repo with clean history (no secrets — `.env*` and `design-reference/` are gitignored).

```bash
# create a PRIVATE repo and push (GitHub CLI)
gh repo create msfg/msfg.us --private --source=. --remote=origin --push
# …or manually:
# git remote add origin git@github.com:<org>/msfg.us.git && git push -u origin main
```

## 2. Create the initial database migration (once)

There are no migration files yet (the schema exists, but no DB was connected during the build). With your `DATABASE_URL`/`DIRECT_URL` in `.env.local`:

```bash
cp .env.example .env.local        # then fill in DATABASE_URL + DIRECT_URL
npm run db:migrate -- --name init # creates prisma/migrations/ + applies to your DB
npm run db:seed                   # loads placeholder officers/rates/programs/testimonials
git add prisma/migrations && git commit -m "chore: initial prisma migration" && git push
```

For later deploys against an already-migrated DB, run `npm run db:deploy` (`prisma migrate deploy`) from CI or locally — **not** in the Vercel build (Vercel's build IPs are dynamic and may not be allowlisted on your RDS).

## 3. Create the Vercel project

1. Vercel → **Add New → Project** → import the GitHub repo. Framework auto-detects **Next.js**; leave build/install commands at defaults (`next build`; `postinstall` runs `prisma generate`).
2. Don't deploy yet — set env vars first (§4), then deploy.

## 4. Set environment variables in Vercel

Add the vars from §7 to the Vercel project (Production + Preview as needed). **For the staging environment, set `NEXT_PUBLIC_SITE_ENV` to `staging` (NOT `production`)** so `robots.ts` returns `Disallow: /` and the site is never indexed, and `NEXT_PUBLIC_SITE_URL=https://staging.msfg.us`.

Mirror the same values into your local `.env.local` for local testing.

## 5. Add the staging domain

1. Vercel → Project → **Domains** → add `staging.msfg.us`.
2. At your DNS provider, add the CNAME Vercel shows (e.g. `staging` → `cname.vercel-dns.com`).
3. Redeploy (or it auto-deploys on push). Confirm `https://staging.msfg.us/robots.txt` shows `Disallow: /`.

## 6. Configure the integrations (as you enable them)

- **Cognito** (`app.msfgco.com` SSO): on the msfg.us app client, register **Allowed callback URL** `https://staging.msfg.us/auth/callback` and **Allowed sign-out URL** `https://staging.msfg.us`. Set `COGNITO_CLIENT_ID`, `COGNITO_HOSTED_UI_DOMAIN` (+ `COGNITO_CLIENT_SECRET` if confidential). Grant type: Authorization code; scopes include `openid email profile`.
- **GHL**: set `GHL_API_TOKEN`, `GHL_LOCATION_ID`, `GHL_PIPELINE_ID`, `GHL_STAGE_ID` (outbound leads → contacts/opportunities). For inbound two-way sync, register the webhook **`https://staging.msfg.us/api/v1/webhooks/ghl`** in GHL and set either `GHL_WEBHOOK_SECRET` (HMAC) or `GHL_WEBHOOK_PUBLIC_KEY_VERIFY=true` (marketplace RSA/Ed25519 — built-in keys). For scheduling set `NEXT_PUBLIC_GHL_CALENDAR_ID` (+ per-officer `calendarId` in `src/content/officers.ts`); for live chat set `NEXT_PUBLIC_GHL_CHAT_WIDGET_ID`.
- **Assistant**: set `ANTHROPIC_API_KEY` (+ optional `ANTHROPIC_BASE_URL` for an internal gateway).
- **Public API**: set `MSFG_API_KEYS` (mint with `openssl rand -hex 32`; format `partner:<key>:<secret>` for HMAC, or a bare `<key>`). Set `CRON_SECRET` so the Vercel cron (`/api/internal/retry-ghl`, every 15 min — see `vercel.json`) is authenticated.

## 7. Environment variable reference

| Var | Scope | Needed for | Notes |
|---|---|---|---|
| `DATABASE_URL` | secret | everything DB | pooled connection string |
| `DIRECT_URL` | secret | migrations | direct (non-pooled) |
| `NEXT_PUBLIC_SITE_URL` | public | SEO/canonical | `https://staging.msfg.us`, later `https://msfg.us` |
| `NEXT_PUBLIC_SITE_ENV` | public | indexing | `staging` (noindex) / `production` |
| `ANTHROPIC_API_KEY` | secret | AI assistant | optional; assistant disabled without it |
| `ANTHROPIC_BASE_URL` | secret | AI (gateway) | optional |
| `GHL_API_TOKEN` / `GHL_LOCATION_ID` / `GHL_PIPELINE_ID` / `GHL_STAGE_ID` | secret | GHL outbound | optional |
| `GHL_WEBHOOK_SECRET` **or** `GHL_WEBHOOK_PUBLIC_KEY_VERIFY` | secret | GHL inbound | one of the two |
| `NEXT_PUBLIC_GHL_CALENDAR_ID` / `NEXT_PUBLIC_GHL_CHAT_WIDGET_ID` | public | scheduling / chat | optional |
| `COGNITO_CLIENT_ID` / `COGNITO_HOSTED_UI_DOMAIN` | secret | SSO | enables auth; `COGNITO_USER_POOL_ID` defaults to `us-west-1_S6iE2uego` |
| `COGNITO_CLIENT_SECRET` | secret | SSO (confidential) | optional |
| `LOS_API_BASE` / `LOS_PATH` | secret | application handoff | optional |
| `NEXT_PUBLIC_APP_URL` | public | app deep link | defaults to `https://app.msfgco.com` |
| `MSFG_API_KEYS` | secret | public API writes | optional |
| `PUBLIC_API_RATE_RPM` / `PUBLIC_API_CORS_ORIGINS` | secret | public API | optional (defaults 60 / `*`) |
| `CRON_SECRET` | secret | retry cron auth | recommended |
| `SENTRY_DSN` | secret | error tracking | optional (SDK not yet wired) |

Full annotated list lives in `.env.example`.

## 8. Verify the staging deploy (acceptance checklist)

- `GET https://staging.msfg.us/api/v1/health` → `{ "ok": true, "db": "up" }`
- `https://staging.msfg.us/robots.txt` → `Disallow: /` (noindexed)
- Click through all 7 pages + the `/apply/buy` wizard at desktop + mobile widths.
- Submit a test lead via the wizard → confirm a row in Postgres (`npm run db:studio`) **and** a contact/opportunity in your GHL staging sub-account.
- Toggle the homepage **AI mode** → the assistant answers (with `ANTHROPIC_API_KEY` set) and tool calls work.
- If GHL inbound is configured: move the test lead's stage in GHL → confirm `Lead.crmStatus` updates.
- If Cognito is configured: complete the apply flow → sign-in via Hosted UI → "Continue in the MSFG app" deep link.
- `GET /api/v1/public/rates` → 200 with rate-limit headers; `GET /developers` renders; `POST /api/v1/public/leads` with a valid `x-api-key` → 201.
- Lighthouse: LCP < 2s, no console errors.

## 9. Apex cutover (when staging is signed off)

1. Swap all `[PLACEHOLDER]` data for real content (search the codebase for `[PLACEHOLDER]`): company NMLS #, loan-officer roster (names/NMLS/photos/calendars), rate feed, testimonials, contact info; replace logo placeholders with real SVGs exported from `/MSFG/Logos/full-color+2.ai` (+ favicon).
2. In Vercel set `NEXT_PUBLIC_SITE_ENV=production` and `NEXT_PUBLIC_SITE_URL=https://msfg.us`.
3. Add `msfg.us` (+ `www`) domains in Vercel; point apex DNS (A/ALIAS) + `www` CNAME; set a 308 to the canonical host.
4. Register the production Cognito callback/sign-out URLs and the production GHL webhook URL.
5. Confirm `robots.txt` now allows indexing; submit `https://msfg.us/sitemap.xml` to Google Search Console.
6. Keep `staging.msfg.us` (noindexed) as the ongoing pre-prod environment.
