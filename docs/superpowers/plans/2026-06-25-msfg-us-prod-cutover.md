# msfg.us Prod Cutover (GoHighLevel → Next.js funnel on EC2) — Implementation Plan

> **For agentic workers:** ops/infra plan. Steps use checkbox (`- [ ]`) syntax. Every prod-mutating step is **[OWNER-GATED]** — confirm before running. Nothing in Phase 3+ goes live without the owner's explicit go.
> **v2 — hardened after a 5-lens adversarial review (44 findings: 4 CRITICAL, 13 HIGH).** The CRITICALs were cutover-breakers; they're folded into Phases 0–2 below.

**Goal:** Replace the live GoHighLevel site at `msfg.us` with the new Next.js funnel (already on `staging.msfg.us`), so prod runs the passwordless `/continue` hand-off — with **zero lost leads**, no SEO damage, and a one-step DNS rollback.

**Architecture:** Stand up a **separate prod instance** on the existing EC2 box (`52.203.186.217`) — own dir, prod `.env`, pm2 process (`:3008`), nginx vhost, TLS. Validate end-to-end via the box IP *before* DNS. Cut over by repointing `msfg.us` in **Cloudflare to DNS-only (grey) → the box**. Roll back by reverting that one record set.

**Tech Stack:** Next.js standalone (built locally → rsync, never on the box), pm2, nginx + certbot (DNS-01), Prisma + RDS Postgres, Cloudflare DNS, AWS Cognito, GoHighLevel API.

---

## Current state (verified 2026-06-25)

| Thing | Value |
|---|---|
| Prod `msfg.us` today | GoHighLevel site (Cloudflare → Google origin); captures leads natively into GHL **and into its pipeline**. |
| New funnel | Next.js repo `WebProjects/msfg.us`, `main`@`90188bb`. Live only on `staging.msfg.us`. |
| Box | `52.203.186.217` (t3a.medium, **4 GB, 8 pm2 apps**, prior OOM). Funnel = pm2 `msfg-web`, `:3007`, dir `~/apps/msfg.us`, serves `staging.msfg.us` (has LE cert; `msfg.us` has **none** on the box). |
| Funnel DB | RDS `…rds.amazonaws.com:5432/msfg_web` (public, currently `sslmode=no-verify`). |
| Lead pipeline | **Postgres = system of record; GHL = best-effort mirror; GHL push failures are SWALLOWED** (`leadService.ts`). Recovery relies on a **Vercel cron** `/api/internal/retry-ghl` (15 min) — which **does not exist on EC2/pm2**. |
| Tenant model | `TENANT_MODE=dedicated`, `TENANT_SLUG=msfg`; `getTenant()` **throws** if the `msfg` Tenant row is absent → robots/sitemap/all pages 500. |
| Missing for prod | `HANDOFF_TOKEN_SECRET`, `GHL_API_TOKEN`, `GHL_LOCATION_ID`, **`GHL_PIPELINE_ID`, `GHL_STAGE_ID`**, `CRON_SECRET`, `NEXT_PUBLIC_GHL_*`, `DEEPSEEK_API_KEY`. |
| Build-env trap | repo `.env.local` sets `NEXT_PUBLIC_DEV_FUNNEL_BYPASS=1` + localhost `NEXT_PUBLIC_APP_URL` — `next build` loads `.env.local`, so it leaks into a prod bundle unless excluded. |
| DNS | `msfg.us` NOT in Route 53 → managed in **Cloudflare**. mortgage-app `/continue` only DECODES the handoff token (no signature check). |

---

## Phase 0 — Decisions & inputs (owner) — DO FIRST

- [ ] **0.1 GHL lead pipeline (CRITICAL).** Supply prod `GHL_API_TOKEN`, `GHL_LOCATION_ID`, **`GHL_PIPELINE_ID`, `GHL_STAGE_ID`**. Without pipeline+stage, the code creates a bare contact and **silently skips the opportunity** (`ghlClient.ts:172-195`) → leads never enter the sales pipeline. Confirm these point at the **prod** CRM location, not a sandbox.
- [ ] **0.2 GHL retry scheduler (CRITICAL).** The retry sweep is a Vercel cron → never fires on EC2. Decide: run a box cron/pm2-cron hitting `/api/internal/retry-ghl` every 15 min, with `CRON_SECRET` set (the route is **open** when `CRON_SECRET` is unset — set it). (Built in Task 1.6.)
- [ ] **0.3 Prod DB + seed (CRITICAL).** Recommendation: separate DB `msfg_web_prod` on the same RDS. **It MUST be seeded** (`npm run db:seed`) to create the `msfg` Tenant row — else every page 500s. (If instead reusing `msfg_web`, it's already seeded but mixes test data.) Decide.
- [ ] **0.4 Cloudflare proxy mode (CRITICAL).** **Decision: DNS-only (grey cloud)** for the cutover → the box LE cert is the single TLS source, `dig` is deterministic, rollback is a pure record swap with no SSL-mode coupling. (If orange is ever wanted: Cloudflare SSL=Full(strict) + origin cert + lock nginx 443 to Cloudflare IPs — out of scope here.)
- [ ] **0.5 `HANDOFF_TOKEN_SECRET`.** Generate `openssl rand -base64 32`. Add a prod fail-closed: refuse to mint with the dev fallback when `NEXT_PUBLIC_SITE_ENV=production` (code change in Task 1.3a).
- [ ] **0.6 Cognito callbacks.** Confirm `msfg.us` uses its **own** client id (not shared); add `https://msfg.us/auth/callback` + logout `https://msfg.us/` to that client's allowlist (exact, https, no wildcards); remove unused entries.
- [ ] **0.7 Redirect map (SEO).** Discovery, not guesswork: export Search Console "Pages" (indexed URLs), Google Ads final URLs, GHL funnel slugs, and crawl the live GHL site (wget/Screaming Frog). Produce old→new 301 map + a catch-all fallback (unmapped → `/` or a convert CTA, not a dead 404).
- [ ] **0.8 Analytics/pixels.** Inventory tags on the live GHL site (view-source/GTM/Tag Assistant): GA4, Google Ads conversion, Meta Pixel, GTM. Port to the Next.js app (single GTM container preferred) so conversion tracking survives.
- [ ] **0.9 RDS TLS + exposure.** Move prod conn to `sslmode=verify-full` with the RDS CA bundle; restrict the RDS security group to the box's IP (it's a public instance holding PII).
- [ ] **0.10 GHL site disposition + confidence window.** Keep GHL at `legacy.msfg.us` for rollback/marketing or retire. Define the window: e.g. **7 days at ≥ baseline lead volume + zero accumulating FAILED rows** before retiring.

---

## Phase 1 — Build the prod instance on the box (NOT live; DNS still → GHL)

### Task 1.1 — Prod DB: create, migrate, **seed**

- [ ] **Step 1: [OWNER-GATED] Create the prod DB.**
```bash
psql "postgresql://<admin>@…rds.amazonaws.com:5432/postgres?sslmode=verify-full&sslrootcert=<rds-ca>.pem" -c 'CREATE DATABASE msfg_web_prod;'
```
- [ ] **Step 2: Migrate (locally).** First assert a clean baseline:
```bash
cd WebProjects/msfg.us
PROD="postgresql://<user>:<pw>@<host>:5432/msfg_web_prod?sslmode=verify-full&sslrootcert=<rds-ca>.pem"
DATABASE_URL="$PROD" DIRECT_URL="$PROD" npx prisma migrate status   # expect: clean / no failed
DATABASE_URL="$PROD" DIRECT_URL="$PROD" npm run db:deploy           # migrate deploy
```
- [ ] **Step 3: SEED (CRITICAL — creates the `msfg` Tenant row, officers, programs, rates).**
```bash
DATABASE_URL="$PROD" DIRECT_URL="$PROD" npm run db:seed
```
- [ ] **Step 4: Verify the tenant exists** (else all pages 500):
```bash
psql "$PROD" -c "select slug from \"Tenant\" where slug='msfg';"   # expect 1 row
```

### Task 1.3a — Code: prod fail-closed handoff secret (small change)

**Files:** Modify `src/app/api/v1/applications/route.ts` (the `?? "local-unsigned-dev-secret"` fallback).
- [ ] Throw (500) instead of using the dev fallback when `NODE_ENV/SITE_ENV=production` and `HANDOFF_TOKEN_SECRET` is missing/short. Commit. (TDD: add a test that mint throws in prod-mode without the secret.)

### Task 1.2 — Prod `.env` on the box (server-only runtime vars)

- [ ] **Step 1: [OWNER-GATED] Write `~/apps/msfg.us-prod/.env`** (chmod 600). Include the full GHL pipeline set + CRON_SECRET + verify-full DB:
```
PORT=3008
HOSTNAME=127.0.0.1
NEXT_PUBLIC_SITE_URL=https://msfg.us
NEXT_PUBLIC_SITE_ENV=production
DATABASE_URL=postgresql://<user>:<pw>@<host>:5432/msfg_web_prod?sslmode=verify-full&sslrootcert=/home/ubuntu/rds-ca.pem
DIRECT_URL=…same…
LOS_API_BASE=https://app.msfgco.com
HANDOFF_TOKEN_SECRET=<openssl rand -base64 32>
CRON_SECRET=<openssl rand -base64 24>
COGNITO_CLIENT_ID=<prod client>
COGNITO_HOSTED_UI_DOMAIN=<domain>
AUTH_REDIRECT_URI=https://msfg.us/auth/callback
AUTH_LOGOUT_REDIRECT_URI=https://msfg.us/
TENANT_SECRETS_KEY=<prod key>
GOOGLE_PLACES_API_KEY=<key>
GHL_API_TOKEN=<token>
GHL_LOCATION_ID=<location>
GHL_PIPELINE_ID=<pipeline>
GHL_STAGE_ID=<stage>
ADMIN_BOOTSTRAP_EMAILS=<exactly the operator address(es)>
```
- [ ] **Step 2: Verify keys + perms.** `ssh … 'ls -l ~/apps/msfg.us-prod/.env; sed "s/=.*//" ~/apps/msfg.us-prod/.env | sort'` → mode `-rw-------`; includes all GHL_* + CRON_SECRET + HANDOFF_TOKEN_SECRET.

### Task 1.3 — Build prod bundle locally (clean env) + ship

- [ ] **Step 1: Clean-env override** (avoid `.env.local` leaking the dev bypass):
```bash
cd WebProjects/msfg.us
mv .env.local .env.local.bak 2>/dev/null || true   # keep dev bypass OUT of prod build
cat > .env.production.local <<EOF                    # gitignored
NEXT_PUBLIC_APP_URL=https://app.msfgco.com
NEXT_PUBLIC_GHL_CALENDAR_BASE=<…>
NEXT_PUBLIC_GHL_CALENDAR_ID=<…>
NEXT_PUBLIC_GHL_CHAT_WIDGET_ID=<…>
NEXT_PUBLIC_GHL_CHAT_LOADER_SRC=<…>
NEXT_PUBLIC_GHL_CHAT_RESOURCES_URL=<…>
NEXT_PUBLIC_GHL_LOCATION_ID=<…>
EOF
```
- [ ] **Step 2: Build (indexable).** `bash scripts/pack-standalone.sh https://msfg.us production`
- [ ] **Step 3: Assert the bundle (fail-closed).**
```bash
grep -rhoE 'https://app\.msfgco\.com|http://localhost:3001' .next/standalone/.next .next/static | sort | uniq -c   # only app.msfgco.com
grep -rq '0000000000b0\|NEXT_PUBLIC_DEV_FUNNEL_BYPASS' .next/standalone .next/static && echo "DEV LEAK — ABORT" || echo "clean"
# robots baked as production (Allow:/, not Disallow:/)
ls .next/standalone/.next/server/app/robots* 2>/dev/null
```
- [ ] **Step 4: Restore `.env.local`** (`mv .env.local.bak .env.local`).
- [ ] **Step 5: rsync to the PROD dir (preserve .env).** `rsync -az --delete --exclude='.env' .next/standalone/ ubuntu@52.203.186.217:~/apps/msfg.us-prod/`
- [ ] **Step 6: Add `@anthropic-ai/sdk` to `pack-standalone.sh`'s copy loop** (it's in `outputFileTracingIncludes` but missing from the fallback loop).

### Task 1.4 — pm2 prod process (:3008), persistent + memory-bounded

- [ ] **Step 1: Pre-checks** — `ss -ltnp | grep :3008` (empty) and `pm2 list | grep msfg-web-prod` (empty).
- [ ] **Step 2: Start via an ecosystem file** (so env reloads on restart, with a memory cap):
```js
// ~/apps/msfg.us-prod/ecosystem.config.js
module.exports = { apps: [{ name:'msfg-web-prod', script:'server.js', cwd:'/home/ubuntu/apps/msfg.us-prod',
  env_file:'.env', max_memory_restart:'400M', node_args:'--max-old-space-size=384' }] }
```
`pm2 start ecosystem.config.js && pm2 save`
- [ ] **Step 3: Reboot persistence** — `systemctl is-enabled pm2-ubuntu` (or run `pm2 startup systemd` + the printed sudo cmd once), then `pm2 save`.
- [ ] **Step 4: Smoke (incl. robots/sitemap — the seed gate):**
```bash
ssh … 'for p in / /apply/buy /robots.txt /sitemap.xml; do printf "%s " "$p"; curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3008$p; done'
```
Expected: all `200`. (`/robots.txt` 500 ⇒ seed missing.)
- [ ] **Step 5: Memory** — record `free -m` before/after; confirm headroom on the 4 GB box.

### Task 1.5 — nginx vhost + TLS (DNS-only target; cert via DNS-01)

- [ ] **Step 1: [OWNER-GATED] Issue the cert via DNS-01** (works while DNS still → GHL; needs a Cloudflare API token at `~/.secrets/cloudflare.ini`, chmod 600):
```bash
sudo certbot certonly --dns-cloudflare --dns-cloudflare-credentials ~/.secrets/cloudflare.ini \
  -d msfg.us -d www.msfg.us --non-interactive --agree-tos -m vonzink@gmail.com
```
- [ ] **Step 2: Write the vhost** (443 + 80→443 redirect + www→apex 301). Don't symlink until the cert exists.
```nginx
server { listen 80; listen [::]:80; server_name msfg.us www.msfg.us; return 301 https://msfg.us$request_uri; }
server { listen 443 ssl; listen [::]:443 ssl; server_name www.msfg.us;
  ssl_certificate /etc/letsencrypt/live/msfg.us/fullchain.pem; ssl_certificate_key /etc/letsencrypt/live/msfg.us/privkey.pem;
  return 301 https://msfg.us$request_uri; }
server { listen 443 ssl; listen [::]:443 ssl; server_name msfg.us;
  ssl_certificate /etc/letsencrypt/live/msfg.us/fullchain.pem; ssl_certificate_key /etc/letsencrypt/live/msfg.us/privkey.pem;
  # NO HSTS during the confidence window (or max-age=60) so rollback isn't sticky
  location / { proxy_pass http://127.0.0.1:3008; proxy_http_version 1.1;
    proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto $scheme; } }
```
- [ ] **Step 3: Enable + verify no conflict** — symlink, `sudo nginx -t`, confirm no `default_server` clash and `staging.msfg.us` still 200 with its own cert, then `sudo systemctl reload nginx`.
- [ ] **Step 4: Verify auto-renew** — `sudo certbot renew --dry-run`; confirm `/etc/letsencrypt/renewal/msfg.us.conf` uses `authenticator = dns-cloudflare`. Ensure the Cloudflare token stays valid (renewal depends on it).

### Task 1.6 — GHL retry scheduler on the box (CRITICAL — no Vercel cron here)

- [ ] **Step 1:** Add a system crontab (or pm2-cron) hitting the retry sweep with the secret:
```bash
ssh … 'crontab -l 2>/dev/null; ( crontab -l 2>/dev/null; echo "*/15 * * * * curl -s -m 30 -H \"Authorization: Bearer $CRON_SECRET\" http://127.0.0.1:3008/api/internal/retry-ghl >/dev/null 2>&1" ) | crontab -'
```
(Source `CRON_SECRET` from the prod `.env`; do not hardcode.)
- [ ] **Step 2:** Verify a forced-failure lead recovers (Task 2.1 Step 4).

---

## Phase 2 — Validate BEFORE the flip (via box IP; DNS still → GHL)

### Task 2.1 — End-to-end + lead-pipeline go/no-go (the hard gate)

- [ ] **Step 1: Site via box IP (grey-path representative).**
```bash
curl -s -o /dev/null -w "%{http_code}\n" --resolve msfg.us:443:52.203.186.217 https://msfg.us/
for p in /robots.txt /sitemap.xml; do curl -s --resolve msfg.us:443:52.203.186.217 https://msfg.us$p | head -1; done   # 200; robots has Allow:/ + Sitemap:
```
- [ ] **Step 2: Funnel → passwordless.** Walk `/apply/buy` to finish; confirm auto-redirect to `https://app.msfgco.com/continue?t=…`, email pre-filled, "Email me a code" default.
- [ ] **Step 3: Lead pipeline (GO/NO-GO).** Submit a clearly-tagged test app (e.g. `+test` email, "QA" tag). Confirm in the **prod** GHL location: (a) **contact** created, (b) **opportunity** created in the **correct pipeline + stage**, (c) source/utm attributed. Then **delete the test contact/opportunity** from GHL.
- [ ] **Step 4: Failure recovery.** Force a GHL failure (temporarily bad token), submit a lead → row `syncStatus=FAILED` in DB; run the retry sweep (or wait 15 min) → row becomes `SYNCED` and appears in GHL. **This proves the box cron heals leads.**
- [ ] **Step 5: Cognito** — verify the prod callback works (no `redirect_mismatch`).

### Task 2.2 — Parity, redirects, analytics (hard gate)

- [ ] **Step 1: Parity checklist** — map every GHL page (from 0.7 crawl) to a Next route or a 301; **zero unresolved gaps** before Phase 3. Check legal/contact/brand pages render (DB-seeded).
- [ ] **Step 2: Redirects** — add `redirects()` in `next.config.ts` from the 0.7 map + a catch-all fallback; rebuild/redeploy; verify each via `--resolve`.
- [ ] **Step 3: Analytics** — port GTM/GA4/Ads/Meta tags (0.8); verify they fire (Tag Assistant against the `--resolve` host).
- [ ] **Step 4: Canonicals/sitemap** — add self-canonical to `/buy`,`/refinance`,`/home-equity`,`/`; reconcile `src/app/sitemap.ts` ROUTES with the actual `(marketing)/**` tree (add `/resources/mortgage-glossary`, etc.).

### Task 2.3 — Security pre-flip

- [ ] Rate-limit + session-bind `POST /api/v1/applications` (reuse the `/api/v1/public/*` token-bucket); it's currently unauth + unthrottled.
- [ ] Confirm `/admin` requires auth on prod and `ADMIN_BOOTSTRAP_EMAILS` is minimized to the operator only.
- [ ] Confirm RDS `sslmode=verify-full` works end-to-end (0.9) and the RDS SG is restricted to the box.

---

## Phase 3 — DNS cutover — [OWNER-GATED, in Cloudflare]

- [ ] **Step 1: Baseline** — record current GHL lead volume/hour + contact→opportunity rate (for post-flip reconciliation). Capture current HSTS: `curl -sI https://msfg.us | grep -i strict-transport`.
- [ ] **Step 2: Full Cloudflare export** — export the ENTIRE zone state for `msfg.us`/`www`: records, **proxy mode**, Page Rules, Redirect Rules, SSL/TLS mode, cache rules. This is the rollback source of truth (not just a screenshot).
- [ ] **Step 3: Lower TTL to 60s** on `msfg.us` + `www` (only effective in DNS-only mode).
- [ ] **Step 4: [OWNER-GATED] Flip** — set `msfg.us` A → `52.203.186.217` and `www` A → `52.203.186.217` (or CNAME www→apex), **DNS-only (grey)**, both together. Schedule for a low-traffic window.
- [ ] **Step 5: Verify (deterministic for grey).**
```bash
dig +short msfg.us            # MUST be 52.203.186.217
curl -sI https://msfg.us | grep -iE 'server|strict-transport'      # box nginx; HSTS short/absent
curl -s https://msfg.us/apply/buy | grep -c '_next/static'         # >0 (Next, not GHL)
curl -s -o /dev/null -w "robots=%{http_code}\n" https://msfg.us/robots.txt   # 200
```
- [ ] **Step 6: Re-run Phase 2.1 (real DNS)** incl. a real lead → opportunity in GHL.
- [ ] **Step 7: Monitor 1h** — pm2 logs, RDS conns, `free -m`, AND lead inserts vs GHL opportunity arrivals vs the Step-1 baseline. Watch `COUNT(syncStatus IN ('FAILED','PENDING'))`.

---

## Phase 4 — Rollback (keep ready)

- [ ] **Restore the EXACT prior Cloudflare state** from Phase 3 Step 2 (records + proxy mode + page/redirect rules), not just the A record. 60s TTL → ~1–2 min. The GHL site is untouched throughout, so it resumes immediately.
- [ ] **Caveat:** if any HSTS was emitted, browsers that cached it may force HTTPS to the box during rollback — mitigated by not emitting HSTS in Phase 1.5 Step 2.
- [ ] **Trigger if:** leads stop reaching GHL, opportunities not created, funnel errors, robots/sitemap 5xx, or lead volume drops vs baseline.

---

## Phase 5 — Post-cutover (after the 0.10 confidence window)

- [ ] Alert on `COUNT(syncStatus IN ('FAILED','PENDING') older than N min) > 0` (the swallowed-failure backstop).
- [ ] Search Console/Bing: confirm verification survives (prefer DNS-TXT via Cloudflare); submit the new sitemap; watch coverage.
- [ ] Move GHL to `legacy.msfg.us` or retire (0.10); inventory direct/campaign links first.
- [ ] Uptime check on `https://msfg.us/` + GHL lead-arrival alert.
- [ ] Consider moving the funnel off the shared 4 GB box (SPOF) to its own instance.

---

## Self-review / coverage
CRITICALs folded: retry cron on box (1.6), GHL pipeline+stage ids (0.1/1.2/2.1), Cloudflare DNS-only decided (0.4/1.5/3), prod DB seed + robots/sitemap gates (1.1/1.4/2.1). HIGHs folded: clean-env build / dev-bypass guard (1.3), NEXT_PUBLIC_GHL_* baked (1.3), production-baked assert (1.3/1.4), expanded go/no-go (2.1), lead-volume baseline (3.1/3.7), HSTS (1.5/3.1/4), full CF export rollback (3.2/4), certbot renew + DNS-01 (1.5), www/apex canonical (1.5/2.2), redirect discovery (0.7/2.2), analytics carryover (0.8/2.2), RDS verify-full + SG (0.9/2.3), token-mint rate-limit (2.3). MEDIUM/LOW folded: pm2 startup+ecosystem+mem cap+port check (1.4), test-data cleanup (2.1), HANDOFF fail-closed (1.3a), .env chmod/admin min (1.2/2.3), Cognito scoping (0.6), sitemap/canonical (2.2), nginx ordering/conflict (1.5), @anthropic-ai/sdk dep (1.3), confidence-window criteria (0.10), dig determinism (3.5).
**Open owner inputs gating execution:** 0.1 GHL ids, 0.3 DB choice, 0.6 Cognito client, 0.7 redirect map, 0.8 analytics, 0.9 RDS, 0.10 disposition, + Cloudflare token (DNS-01) and the flip.
