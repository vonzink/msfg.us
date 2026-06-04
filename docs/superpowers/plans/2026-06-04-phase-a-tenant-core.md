# Phase A — Tenant Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the app fully tenant-aware — a `Tenant` table, a `tenantId` on every tenant-owned row (backfilled to MSFG), automatic query scoping, and request→tenant resolution — with **MSFG running in dedicated mode so behavior is byte-for-byte identical.**

**Architecture:** Add a `Tenant` model and `tenantId` FK to every tenant-owned model. A Prisma client extension auto-injects `tenantId` into reads/writes so a query can't cross tenants. A server-side `getTenant()` resolves the tenant from `TENANT_SLUG` (dedicated mode, pinned to `msfg`) or the request host (shared mode). `getTenantDb()` returns a tenant-scoped Prisma client; call sites that touch tenant data switch to it. Raw `getDb()` remains for system/auth/bootstrap.

**Tech Stack:** Next.js 16 (App Router), Prisma 7 + `@prisma/adapter-pg` (Postgres on RDS, DB `msfg_web`), Vitest (new, for unit tests), TypeScript strict.

---

## Constraints & invariants (from the platform charter)

- **Zero behavior change for MSFG.** `TENANT_SLUG=msfg` pins dedicated mode; every scoped query returns MSFG's data (the only tenant), so the site renders identically and the lead pipeline works as before.
- **Never read/write across tenants.** The scoping extension is the enforcement layer, not manual `where` clauses.
- **`getDb()` stays raw** (migrations, health check, the API-key auth lookup that *establishes* the tenant). Tenant-data access goes through `getTenantDb()`.
- MSFG stays live; this ships behind a migration + a redeploy with no user-visible change.

## File structure

| File | Responsibility |
|---|---|
| `vitest.config.ts` (create) | Vitest config (node env, `@/*` alias) |
| `prisma/schema.prisma` (modify) | `Tenant` model; `tenantId` + relation on every tenant-owned model; per-tenant composite uniques |
| `prisma/migrations/<ts>_tenant_core/migration.sql` (create, hand-edited) | DDL + **backfill** (insert MSFG tenant, set `tenant_id` on all rows, then NOT NULL) |
| `src/server/tenant/types.ts` (create) | `TenantContext` type; the list of tenant-scoped model names |
| `src/server/tenant/resolve.ts` (create) | `resolveTenantSlug(host)` (pure) + `getTenant()` (dedicated/host, cached) |
| `src/server/tenant/scoping.ts` (create) | `buildScopedArgs()` (pure) + `tenantScope(tenantId)` Prisma extension |
| `src/lib/db.ts` (modify) | keep `getDb()`; add `getTenantDb()` (scoped, cached per tenant) |
| `src/middleware.ts` (create) | resolve tenant from host, set `x-tenant-slug` header; pass-through in dedicated mode |
| `src/lib/env.ts` (modify) | add `TENANT_SLUG`, `TENANT_MODE` |
| `.env` / `.env.example` (modify) | `TENANT_SLUG=msfg`, `TENANT_MODE=dedicated` |
| call sites (modify) | `leadService`, `ai/transcript`, public API reads, GHL webhook handler → `getTenantDb()` |
| `prisma/seed.ts` (modify) | upsert the MSFG tenant; stamp `tenantId` on seeded rows |

---

### Task 1: Add Vitest

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (scripts + devDeps)

- [ ] **Step 1: Install Vitest**

```bash
npm install -D vitest vite-tsconfig-paths
```

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
```

- [ ] **Step 3: Add the test script** — in `package.json` `scripts`, add: `"test": "vitest run"`, `"test:watch": "vitest"`.

- [ ] **Step 4: Sanity check** — Run: `npx vitest run` → Expected: "No test files found" (exit 0). Commit:

```bash
git add vitest.config.ts package.json package-lock.json
git commit -m "test: add Vitest harness"
```

---

### Task 2: Tenant types + the scoped-model list

**Files:**
- Create: `src/server/tenant/types.ts`

- [ ] **Step 1: Write the file**

```ts
/** Minimal tenant context attached to a request. */
export type TenantContext = {
  id: string;
  slug: string;
  name: string;
};

/**
 * Prisma model names that carry tenantId and MUST be auto-scoped. ApiKey is
 * intentionally EXCLUDED: the public-API auth lookup hashes the inbound key and
 * finds the row globally (the key is what establishes the tenant), so scoping it
 * would make auth impossible. Tenant itself is also excluded.
 */
export const TENANT_SCOPED_MODELS = [
  "Lead",
  "LoanOfficer",
  "LoanProgram",
  "RateRow",
  "Testimonial",
  "Application",
  "ApplicationStep",
  "ChatSession",
  "ChatMessage",
  "WebhookEvent",
] as const;

export type TenantScopedModel = (typeof TENANT_SCOPED_MODELS)[number];

export function isTenantScopedModel(model: string | undefined): model is TenantScopedModel {
  return !!model && (TENANT_SCOPED_MODELS as readonly string[]).includes(model);
}
```

> Note: `ApplicationStep` has no direct `tenantId` in the schema today (it cascades from `Application`). Task 3 adds `tenantId` to it directly so scoping is uniform and cheap. Keep it in the list.

- [ ] **Step 2: Commit**

```bash
git add src/server/tenant/types.ts
git commit -m "feat(tenant): scoped-model registry + context type"
```

---

### Task 3: Schema — `Tenant` model + `tenantId` everywhere

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add the `Tenant` model** (after the datasource/generator blocks):

```prisma
model Tenant {
  id        String   @id @default(cuid())
  slug      String   @unique
  name      String
  domains   String[] @default([])
  status    String   @default("active")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("tenants")
}
```

- [ ] **Step 2: Add `tenantId` to each scoped model.** For every model in `TENANT_SCOPED_MODELS`, add the field + index, and convert any **global** unique that is really per-tenant into a composite with `tenantId`. Apply these exact edits:

- `Lead`: add `tenantId String` and `@@index([tenantId])`. Change `idempotencyKey String @unique` → `idempotencyKey String` plus `@@unique([tenantId, idempotencyKey])`.
- `LoanOfficer`: add `tenantId String`, `@@index([tenantId])`. Change `nmls String @unique` → `nmls String` plus `@@unique([tenantId, nmls])`.
- `LoanProgram`: add `tenantId String`, `@@index([tenantId])`. Change existing `@@unique([category, name])` → `@@unique([tenantId, category, name])`.
- `RateRow`: add `tenantId String`, `@@index([tenantId])`. Change `@@unique([segment, product, subLabel])` → `@@unique([tenantId, segment, product, subLabel])`.
- `Testimonial`: add `tenantId String`, `@@index([tenantId])`.
- `Application`: add `tenantId String`, `@@index([tenantId])`. Change `idempotencyKey String @unique` → `idempotencyKey String` plus `@@unique([tenantId, idempotencyKey])`.
- `ApplicationStep`: add `tenantId String`, `@@index([tenantId])`.
- `ChatSession`: add `tenantId String`, `@@index([tenantId])`.
- `ChatMessage`: add `tenantId String`, `@@index([tenantId])`.
- `WebhookEvent`: add `tenantId String`, `@@index([tenantId])`. Keep `idempotencyKey String @unique` **global** (dedupe is provider-global) — do NOT make it composite.

Also add `tenantId String` + `@@index([tenantId])` to `ApiKey` (owner) **but keep `keyHash String @unique` global** (the key identifies the tenant; the auth lookup is global). ApiKey is NOT in `TENANT_SCOPED_MODELS`.

> Do not add explicit `tenant Tenant @relation` back-relations in Phase A — they're unnecessary for scoping and would force `Tenant` to declare every back-relation. A bare indexed `tenantId String` column is enough. (Referential integrity is enforced by the backfill + app invariants; a later phase can add FKs if desired.)

- [ ] **Step 3: Format + validate**

Run: `npx prisma format && npx prisma validate`
Expected: "The schema at prisma/schema.prisma is valid 🚀"

- [ ] **Step 4: Commit** (schema only — migration is Task 4):

```bash
git add prisma/schema.prisma
git commit -m "feat(tenant): add Tenant model + tenantId on tenant-owned models"
```

---

### Task 4: Migration with backfill (the critical, careful step)

**Files:**
- Create: `prisma/migrations/<timestamp>_tenant_core/migration.sql`

Prisma can't auto-backfill, so we generate the migration `--create-only`, hand-insert the tenant row + backfill, then apply. The `msfg_web` role needs `CREATEDB` for `migrate dev`'s shadow DB.

- [ ] **Step 1: Temporarily grant CREATEDB** (the role needs it only to create the shadow DB):

```bash
H=msfg-webhook-postgres-public.cghqooasg1vk.us-east-1.rds.amazonaws.com
PGSSLMODE=require PGPASSWORD='<RDS master pw>' psql -h "$H" -U postgres -d postgres -c "ALTER ROLE msfg_web CREATEDB;"
```

- [ ] **Step 2: Generate the migration without applying**

Run: `npm run db:migrate -- --name tenant_core --create-only`
Expected: a new `prisma/migrations/<ts>_tenant_core/migration.sql` is written (NOT applied).

- [ ] **Step 3: Hand-edit the migration.** Open the generated `migration.sql`. It will contain `CREATE TABLE "tenants"`, `ALTER TABLE ... ADD COLUMN "tenantId" TEXT NOT NULL` (which would FAIL on existing rows), and the unique-index changes. **Restructure it to this exact order** so existing rows are backfilled before NOT NULL is enforced. Replace each `ADD COLUMN "tenantId" TEXT NOT NULL` with a nullable add; then backfill; then set NOT NULL. The final file must read:

```sql
-- 1. Tenant table
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- 2. Seed tenant #1 (MSFG). Deterministic id so app + seed agree.
INSERT INTO "tenants" ("id","slug","name","updatedAt")
VALUES ('tenant_msfg', 'msfg', 'Mountain State Financial Group', CURRENT_TIMESTAMP);

-- 3. Add tenantId as NULLABLE on every scoped table + ApiKey
ALTER TABLE "leads" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "loan_officers" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "loan_programs" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "rate_rows" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "testimonials" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "applications" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "application_steps" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "chat_sessions" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "chat_messages" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "webhook_events" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "api_keys" ADD COLUMN "tenantId" TEXT;

-- 4. Backfill all existing rows to MSFG
UPDATE "leads"              SET "tenantId" = 'tenant_msfg' WHERE "tenantId" IS NULL;
UPDATE "loan_officers"      SET "tenantId" = 'tenant_msfg' WHERE "tenantId" IS NULL;
UPDATE "loan_programs"      SET "tenantId" = 'tenant_msfg' WHERE "tenantId" IS NULL;
UPDATE "rate_rows"          SET "tenantId" = 'tenant_msfg' WHERE "tenantId" IS NULL;
UPDATE "testimonials"       SET "tenantId" = 'tenant_msfg' WHERE "tenantId" IS NULL;
UPDATE "applications"       SET "tenantId" = 'tenant_msfg' WHERE "tenantId" IS NULL;
UPDATE "application_steps"  SET "tenantId" = 'tenant_msfg' WHERE "tenantId" IS NULL;
UPDATE "chat_sessions"      SET "tenantId" = 'tenant_msfg' WHERE "tenantId" IS NULL;
UPDATE "chat_messages"      SET "tenantId" = 'tenant_msfg' WHERE "tenantId" IS NULL;
UPDATE "webhook_events"     SET "tenantId" = 'tenant_msfg' WHERE "tenantId" IS NULL;
UPDATE "api_keys"           SET "tenantId" = 'tenant_msfg' WHERE "tenantId" IS NULL;

-- 5. Enforce NOT NULL now that every row has a tenant
ALTER TABLE "leads"             ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "loan_officers"     ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "loan_programs"     ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "rate_rows"         ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "testimonials"      ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "applications"      ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "application_steps" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "chat_sessions"     ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "chat_messages"     ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "webhook_events"    ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "api_keys"          ALTER COLUMN "tenantId" SET NOT NULL;

-- 6. Swap global uniques for per-tenant composites + add indexes
DROP INDEX IF EXISTS "leads_idempotencyKey_key";
CREATE UNIQUE INDEX "leads_tenantId_idempotencyKey_key" ON "leads"("tenantId","idempotencyKey");
DROP INDEX IF EXISTS "loan_officers_nmls_key";
CREATE UNIQUE INDEX "loan_officers_tenantId_nmls_key" ON "loan_officers"("tenantId","nmls");
DROP INDEX IF EXISTS "loan_programs_category_name_key";
CREATE UNIQUE INDEX "loan_programs_tenantId_category_name_key" ON "loan_programs"("tenantId","category","name");
DROP INDEX IF EXISTS "rate_rows_segment_product_subLabel_key";
CREATE UNIQUE INDEX "rate_rows_tenantId_segment_product_subLabel_key" ON "rate_rows"("tenantId","segment","product","subLabel");
DROP INDEX IF EXISTS "applications_idempotencyKey_key";
CREATE UNIQUE INDEX "applications_tenantId_idempotencyKey_key" ON "applications"("tenantId","idempotencyKey");

CREATE INDEX "leads_tenantId_idx" ON "leads"("tenantId");
CREATE INDEX "loan_officers_tenantId_idx" ON "loan_officers"("tenantId");
CREATE INDEX "loan_programs_tenantId_idx" ON "loan_programs"("tenantId");
CREATE INDEX "rate_rows_tenantId_idx" ON "rate_rows"("tenantId");
CREATE INDEX "testimonials_tenantId_idx" ON "testimonials"("tenantId");
CREATE INDEX "applications_tenantId_idx" ON "applications"("tenantId");
CREATE INDEX "application_steps_tenantId_idx" ON "application_steps"("tenantId");
CREATE INDEX "chat_sessions_tenantId_idx" ON "chat_sessions"("tenantId");
CREATE INDEX "chat_messages_tenantId_idx" ON "chat_messages"("tenantId");
CREATE INDEX "webhook_events_tenantId_idx" ON "webhook_events"("tenantId");
CREATE INDEX "api_keys_tenantId_idx" ON "api_keys"("tenantId");
```

> Verify the real table/column/index names against the generated file (snake_case from `@@map`; index names from Prisma). Adjust `DROP INDEX` names to match what Prisma actually created (run `\d "leads"` etc. if unsure). The deterministic id `tenant_msfg` is reused by the seed (Task 9) and resolver (Task 5).

- [ ] **Step 4: Apply the migration**

Run: `npm run db:migrate -- --name tenant_core` (applies the edited SQL; if it says "already created", use `npx prisma migrate deploy`).
Expected: "Your database schema is now in sync."

- [ ] **Step 5: Verify backfill** — every row has a tenant, counts unchanged:

```bash
PGSSLMODE=require PGPASSWORD='<msfg_web pw>' psql -h "$H" -U msfg_web -d msfg_web -tAc \
"SELECT 'officers',count(*) FROM loan_officers WHERE \"tenantId\"='tenant_msfg'
 UNION ALL SELECT 'rates',count(*) FROM rate_rows WHERE \"tenantId\"='tenant_msfg'
 UNION ALL SELECT 'orphans', count(*) FROM leads WHERE \"tenantId\" IS NULL;"
```
Expected: `officers|6`, `rates|12`, `orphans|0`.

- [ ] **Step 6: Revoke CREATEDB** (least privilege) and commit:

```bash
PGSSLMODE=require PGPASSWORD='<RDS master pw>' psql -h "$H" -U postgres -d postgres -c "ALTER ROLE msfg_web NOCREATEDB;"
git add prisma/migrations prisma/schema.prisma
git commit -m "feat(tenant): tenant_core migration with MSFG backfill"
```

---

### Task 5: Tenant resolution (pure logic + getTenant)

**Files:**
- Create: `src/server/tenant/resolve.ts`
- Test: `src/server/tenant/resolve.test.ts`
- Modify: `src/lib/env.ts`

- [ ] **Step 1: Add env vars** — in `src/lib/env.ts` `envSchema`, add:

```ts
  // Multi-tenancy. dedicated = one pinned tenant (TENANT_SLUG); shared = resolve
  // the tenant from the request host. MSFG runs dedicated/msfg → zero change.
  TENANT_MODE: z.enum(["dedicated", "shared"]).default("dedicated"),
  TENANT_SLUG: z.string().min(1).default("msfg"),
```

- [ ] **Step 2: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { resolveTenantSlug } from "./resolve";

describe("resolveTenantSlug", () => {
  it("strips www + port and lowercases", () => {
    expect(resolveTenantSlug("WWW.msfg.us:3000", {})).toBe("msfg.us");
  });
  it("maps a known host via the domain map", () => {
    expect(resolveTenantSlug("acme.com", { "acme.com": "acme" })).toBe("acme");
  });
  it("returns null for an unknown host", () => {
    expect(resolveTenantSlug("nope.example", {})).toBeNull();
  });
});
```

- [ ] **Step 3: Run it (fails)** — Run: `npx vitest run src/server/tenant/resolve.test.ts` → Expected: FAIL ("resolveTenantSlug is not a function").

- [ ] **Step 4: Implement `resolve.ts`**

```ts
import "server-only";
import { headers } from "next/headers";
import { serverEnv } from "@/lib/env";
import { getDb } from "@/lib/db";
import type { TenantContext } from "./types";

/** Normalize a host and map it to a tenant slug. Pure (host→slug). */
export function resolveTenantSlug(
  host: string | null | undefined,
  domainMap: Record<string, string>,
): string | null {
  if (!host) return null;
  const h = host.toLowerCase().replace(/:\d+$/, "").replace(/^www\./, "");
  return domainMap[h] ?? null;
}

// Tenant lookups are tiny + stable within a process; cache by slug.
const cache = new Map<string, TenantContext>();

/** Resolve the active tenant for this request. Dedicated mode pins TENANT_SLUG. */
export async function getTenant(): Promise<TenantContext> {
  const slug =
    serverEnv.TENANT_MODE === "dedicated"
      ? serverEnv.TENANT_SLUG
      : (await slugFromHost()) ?? serverEnv.TENANT_SLUG; // fall back to default

  const cached = cache.get(slug);
  if (cached) return cached;

  const row = await getDb().tenant.findUnique({ where: { slug } });
  if (!row) throw new Error(`Unknown tenant slug "${slug}"`);
  const ctx: TenantContext = { id: row.id, slug: row.slug, name: row.name };
  cache.set(slug, ctx);
  return ctx;
}

/** Read the host the middleware resolved (x-tenant-slug) or the raw Host header. */
async function slugFromHost(): Promise<string | null> {
  const h = await headers();
  const fromMiddleware = h.get("x-tenant-slug");
  if (fromMiddleware) return fromMiddleware;
  // Shared mode without a domain map yet → null (caller falls back to default).
  return resolveTenantSlug(h.get("host"), {});
}
```

> `getDb().tenant` is the RAW (unscoped) client — correct, since resolving the tenant precedes scoping.

- [ ] **Step 5: Run tests (pass)** — Run: `npx vitest run src/server/tenant/resolve.test.ts` → Expected: PASS (3 tests). Then `npm install -D server-only` if not present (Next bundles it; install only if the import errors).

- [ ] **Step 6: Commit**

```bash
git add src/server/tenant/resolve.ts src/server/tenant/resolve.test.ts src/lib/env.ts
git commit -m "feat(tenant): resolution (dedicated TENANT_SLUG / host) + tests"
```

---

### Task 6: Query-scoping extension (pure builder + extension)

**Files:**
- Create: `src/server/tenant/scoping.ts`
- Test: `src/server/tenant/scoping.test.ts`

- [ ] **Step 1: Write the failing test** (the pure arg-builder is the security core):

```ts
import { describe, it, expect } from "vitest";
import { buildScopedArgs } from "./scoping";

const T = "tenant_msfg";

describe("buildScopedArgs", () => {
  it("injects tenantId into a read where", () => {
    expect(buildScopedArgs("findMany", { where: { email: "a@b.c" } }, T))
      .toEqual({ where: { AND: [{ email: "a@b.c" }, { tenantId: T }] } });
  });
  it("adds where when none given", () => {
    expect(buildScopedArgs("findFirst", {}, T)).toEqual({ where: { tenantId: T } });
  });
  it("forces tenantId on create data", () => {
    expect(buildScopedArgs("create", { data: { email: "a@b.c" } }, T))
      .toEqual({ data: { email: "a@b.c", tenantId: T } });
  });
  it("forces tenantId on every createMany row", () => {
    expect(buildScopedArgs("createMany", { data: [{ a: 1 }, { a: 2 }] }, T))
      .toEqual({ data: [{ a: 1, tenantId: T }, { a: 2, tenantId: T }] });
  });
  it("scopes update/delete by where", () => {
    expect(buildScopedArgs("updateMany", { where: { id: "x" }, data: { name: "n" } }, T))
      .toEqual({ where: { AND: [{ id: "x" }, { tenantId: T }] }, data: { name: "n" } });
  });
  it("forces tenantId on upsert create + scopes where", () => {
    expect(buildScopedArgs("upsert", { where: { id: "x" }, create: { a: 1 }, update: { b: 2 } }, T))
      .toEqual({ where: { AND: [{ id: "x" }, { tenantId: T }] }, create: { a: 1, tenantId: T }, update: { b: 2 } });
  });
});
```

- [ ] **Step 2: Run it (fails)** — Run: `npx vitest run src/server/tenant/scoping.test.ts` → Expected: FAIL.

- [ ] **Step 3: Implement `scoping.ts`**

```ts
import { Prisma } from "@prisma/client";
import { isTenantScopedModel } from "./types";

type AnyArgs = Record<string, any>;

/** Merge a tenantId filter/value into Prisma operation args. Pure + unit-tested. */
export function buildScopedArgs(operation: string, args: AnyArgs, tenantId: string): AnyArgs {
  const a: AnyArgs = { ...(args ?? {}) };

  // Force tenantId onto created rows.
  if (operation === "create" || operation === "upsert") {
    if (a.data) a.data = { ...a.data, tenantId };
  }
  if (operation === "createMany") {
    const rows = Array.isArray(a.data) ? a.data : [a.data];
    a.data = rows.map((r: AnyArgs) => ({ ...r, tenantId }));
    return a;
  }

  // Constrain reads/updates/deletes by tenantId.
  const needsWhere = operation !== "create" && operation !== "createMany";
  if (needsWhere) {
    a.where = a.where ? { AND: [a.where, { tenantId }] } : { tenantId };
  }
  return a;
}

/** A Prisma client extension that auto-scopes all tenant-owned models. */
export function tenantScope(tenantId: string) {
  return Prisma.defineExtension({
    name: "tenant-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!isTenantScopedModel(model)) return query(args as AnyArgs);
          return query(buildScopedArgs(operation, args as AnyArgs, tenantId));
        },
      },
    },
  });
}
```

- [ ] **Step 4: Run tests (pass)** — Run: `npx vitest run src/server/tenant/scoping.test.ts` → Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/tenant/scoping.ts src/server/tenant/scoping.test.ts
git commit -m "feat(tenant): auto-scoping Prisma extension + tests"
```

---

### Task 7: `getTenantDb()`

**Files:**
- Modify: `src/lib/db.ts`

- [ ] **Step 1: Add the scoped accessor.** Keep the existing `getDb()` untouched. Append:

```ts
import { tenantScope } from "@/server/tenant/scoping";
import { getTenant } from "@/server/tenant/resolve";

// Scoped clients are cheap wrappers; cache one per tenantId.
const scopedCache = new Map<string, ReturnType<ReturnType<typeof getDb>["$extends"]>>();

/** Prisma client auto-scoped to the active tenant. Use for ALL tenant data. */
export async function getTenantDb() {
  const tenant = await getTenant();
  let scoped = scopedCache.get(tenant.id);
  if (!scoped) {
    scoped = getDb().$extends(tenantScope(tenant.id));
    scopedCache.set(tenant.id, scoped);
  }
  return scoped;
}
```

> If the `ReturnType<...>` generic is awkward for the Prisma 7 client type, type it as `ReturnType<typeof getDb>` loosely or `any` for the cache map only — the returned value keeps full types.

- [ ] **Step 2: Typecheck** — Run: `npx tsc --noEmit` → Expected: clean. Commit:

```bash
git add src/lib/db.ts
git commit -m "feat(tenant): getTenantDb() scoped client accessor"
```

---

### Task 8: Middleware (host → x-tenant-slug)

**Files:**
- Create: `src/middleware.ts`

- [ ] **Step 1: Write it** (pass-through in dedicated mode; sets the header in shared mode):

```ts
import { NextResponse, type NextRequest } from "next/server";

// Edge middleware: no DB. In shared mode it forwards the host as x-tenant-slug
// for the Node-side resolver; in dedicated mode it does nothing (TENANT_SLUG wins).
export function middleware(req: NextRequest) {
  if ((process.env.TENANT_MODE ?? "dedicated") === "dedicated") {
    return NextResponse.next();
  }
  const host = req.headers.get("host")?.toLowerCase().replace(/:\d+$/, "").replace(/^www\./, "");
  const res = NextResponse.next();
  if (host) res.headers.set("x-tenant-slug", host);
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

> Phase A runs dedicated, so this is effectively a no-op now; it's the seam shared mode uses later. Reads `process.env` directly (middleware can't import the zod env / `server-only`).

- [ ] **Step 2: Build check** — Run: `npm run build` → Expected: green (middleware compiles). Commit:

```bash
git add src/middleware.ts
git commit -m "feat(tenant): host-resolution middleware (no-op in dedicated mode)"
```

---

### Task 9: Route the data layer through `getTenantDb()` + seed the tenant

**Files:**
- Modify: `src/server/leads/leadService.ts`, `src/server/ai/transcript.ts`, `src/server/webhooks/ghlHandler.ts`, `src/app/api/v1/public/{rates,programs,loan-officers}/route.ts` (only those that read the DB), `prisma/seed.ts`

- [ ] **Step 1: Migrate each tenant-data call site.** The transformation is mechanical: replace the unscoped client with the scoped one. In each file, change `const db = getDb();` (or inline `getDb().model…`) to `const db = await getTenantDb();` and drop the now-redundant manual `tenantId`/cross-tenant `where` if any. **Do NOT change** `src/app/api/v1/health/route.ts` (raw ping), `src/server/api/auth.ts` (ApiKey lookup is global), or `src/server/tenant/resolve.ts` (resolves before scoping).
  - `leadService.ts`: `captureLead` + `dispatchToGhl` lookups → `getTenantDb()`. (`tenantId` is now injected automatically on create.)
  - `ai/transcript.ts`: `createChatSession`/`appendMessage` → `getTenantDb()`.
  - `webhooks/ghlHandler.ts`: the Lead lookups/updates → `getTenantDb()` (so inbound GHL events only touch this tenant's leads).
  - public `rates`/`programs`/`loan-officers` routes: if they read the DB, use `getTenantDb()`; if they still read `src/content/*` modules, leave them (Phase B moves content to the DB).

- [ ] **Step 2: Seed the MSFG tenant + stamp rows.** In `prisma/seed.ts`, before seeding content, upsert the tenant and use the **scoped** client (or set `tenantId: 'tenant_msfg'` explicitly since seed runs outside a request):

```ts
const TENANT_ID = "tenant_msfg";
await prisma.tenant.upsert({
  where: { slug: "msfg" },
  update: {},
  create: { id: TENANT_ID, slug: "msfg", name: "Mountain State Financial Group" },
});
```
Then add `tenantId: TENANT_ID` to every `create`/`update` payload and every `where` natural-key lookup in the seed (officers, programs, rates, testimonials), matching the new composite uniques (e.g. officer upsert keys on `tenantId_nmls`).

- [ ] **Step 3: Typecheck + unit tests** — Run: `npx tsc --noEmit && npx vitest run` → Expected: clean + all tests pass. Commit:

```bash
git add -A
git commit -m "feat(tenant): scope data access + seed via getTenantDb / MSFG tenant"
```

---

### Task 10: Verify zero behavior change + deploy

**Files:** none (verification + deploy)

- [ ] **Step 1: Set the env** — add to `.env` and `.env.example`: `TENANT_MODE="dedicated"` and `TENANT_SLUG="msfg"`.

- [ ] **Step 2: Re-seed (idempotent) against the real DB** — Run: `npm run db:seed` → Expected: "Seeded: 6 officers, 10 programs, 12 rate rows, 3 testimonials." and no duplicate rows (counts unchanged from Task 4 Step 5).

- [ ] **Step 3: Build the standalone** — Run: `bash scripts/pack-standalone.sh` → Expected: green build, bundle assembled. Confirm `src/server/tenant/**` compiled in.

- [ ] **Step 4: Local smoke E2E** — start the standalone with the real `.env` on a spare port and probe (as in the deploy verification): `/api/v1/health` → `{ok:true,db:up}`; `POST /api/v1/leads` with a test payload → `{ok:true,leadId,…}`; then `psql` confirm the new lead row has `tenantId='tenant_msfg'`. Confirm `/rates` and `/loan-officers` still render the 12 rates / 6 officers.

- [ ] **Step 5: Deploy** — Run: `scripts/deploy-ec2.sh` → pm2 reload; then verify on the box: health `db:up` + homepage renders + a test lead persists with `tenantId='tenant_msfg'`.

- [ ] **Step 6: Final commit / tag**

```bash
git add .env.example
git commit -m "chore(tenant): pin dedicated mode (TENANT_SLUG=msfg) + verify zero-change"
git push origin main
```

---

## Self-Review

**Spec coverage (Phase A section of the design doc):**
- ✅ `Tenant` + `tenantId` on all tenant-owned tables — Tasks 3–4.
- ✅ Backfill every row to MSFG — Task 4 (steps 2–5).
- ✅ Prisma scoping extension (can't cross tenants) — Task 6 + wired in Task 7/9.
- ✅ Resolution middleware, dedicated mode pinned to MSFG — Tasks 5 + 8.
- ✅ Zero behavior change verified — Task 10.

**Placeholder scan:** angle-bracket items are intentional secrets/timestamps the operator fills at run time (`<RDS master pw>`, `<ts>`); all code is complete. No "TODO/handle edge cases" left.

**Type consistency:** `getTenant()`/`TenantContext`/`getTenantDb()`/`tenantScope()`/`buildScopedArgs()`/`isTenantScopedModel()`/`TENANT_SCOPED_MODELS` are defined once (Tasks 2/5/6/7) and referenced consistently; the deterministic tenant id `tenant_msfg` is used identically in the migration (Task 4), resolver (Task 5), and seed (Task 9).

**Scope:** single subsystem (tenant core); produces working, identical-behavior MSFG. Good.

**Known caveat to flag at execution:** Step "verify the real index names" in Task 4 — the operator must reconcile the hand-edited `DROP INDEX` names against what Prisma actually generated (names can differ). This is the one spot requiring eyes-on.
