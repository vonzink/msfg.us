# Scripts

Run everything from the repo root.

## Deploy

| Script | Use |
|---|---|
| `deploy-ec2.sh [SITE_URL] [SITE_ENV]` | Build locally, rsync to the EC2 box, reload pm2. This is the script the runbook in `docs/DEPLOYMENT.md` documents. Defaults to staging. |
| `pack-standalone.sh [SITE_URL] [SITE_ENV]` | Build the standalone bundle only. Called by `deploy-ec2.sh`. |

A second deploy script, `deploy.sh`, sits at the repo root. It is marked as a draft and adds a dirty-tree guard, `--migrate`, and a health check. See the note at the top of `docs/DEPLOYMENT.md`.

## Content generation

| Script | Use |
|---|---|
| `generate-glossary.ts` | Rebuilds `src/content/glossary.ts` from `glossary-source/glossary-terms.md`. Run with `npm run glossary:generate`. |
| `sync-where-the-money-goes.mjs [path-to-msfg-calc]` | Copies the "Where the Money Goes" training page from the msfg-calc repo into `src/calculators/mbs/`. |
| `calculators/golden-mortgage.mjs [path-to-msfg-calc]` | Runs test scenarios through the dashboard's amortization code in the msfg-calc repo and records the results in `src/calculators/mortgage/golden.json`. The Mortgage calculator's tests must reproduce them. Rerun it when the dashboard math changes. |

## Operations

| Script | Use |
|---|---|
| `seal-secret.ts` | Encrypts the tenant's AI API key into the `tenant_secrets` table. |
| `smoke-brain.ts "<question>" [baseUrl]` | Sends one question to a running Mortgage Brain through the app's HTTP client. |

## One-off migrations (already run, kept for reference)

These edited the published site-config revision in the database. Read the header comment before running any of them again.

| Script | What it did |
|---|---|
| `update-logos.ts` | Pointed the published config at the MSFG Home Loans logo files. |
| `update-msfg-staging-config.cjs` | Wrote the real company contact details and office address (Prisma version). |
| `update-msfg-rds-config.cjs` | Same change using raw `pg`, for running on the EC2 box. |
