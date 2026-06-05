# CMS & SEO Management — Phases 0–2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the CMS foundation — a generic draft→publish→history versioning engine, an authenticated `/admin` area with per-tenant RBAC, and a working config editor that edits the live `TenantConfig` (branding, contact, SEO strings, feature flags) through the full draft → preview → publish → rollback loop, with MSFG live throughout.

**Architecture:** A single `Editable`/`Revision` model pair stores versioned JSON for every editable thing; a centralized **versioning service** (explicit `tenantId`, base Prisma client) is the only access path. The live site reads the latest `PUBLISHED` revision through `unstable_cache` (tagged per tenant); publishing writes a new revision and calls `revalidateTag`, replacing the stale in-process `Map`. Editors preview unpublished drafts via Next.js **Draft Mode**. The `/admin` area reuses the existing Cognito session, gated by an `AdminUser`/`Membership` RBAC layer enforced in the route-group layout and re-checked in every server action.

**Tech Stack:** Next.js 16.2.7 (App Router) · React 19 · TypeScript (strict) · Prisma 7 (`@prisma/adapter-pg`) / Postgres · Zod 4 · Tailwind v4 · Vitest 4 (node env). Path alias `@/*` → `src/*`.

**Source spec:** `docs/superpowers/specs/2026-06-05-cms-seo-management-design.md` (Phases 0–2 only; Phases 3–5 — SEO tools, media, relational content — are out of scope and planned later).

---

## Deviations from the spec (plan-time decisions)

These refine the approved design after pinning exact Next 16 / repo facts. All are intentional:

1. **Caching uses `unstable_cache` + `revalidateTag`, not `'use cache'`/Cache Components.** Enabling `cacheComponents: true` is an app-wide rendering change; `unstable_cache` (supported "caching without Cache Components" path) gives per-tenant tagged invalidation with zero global config change. Isolated behind `src/server/cms/cache.ts` so a future migration touches one file.
2. **`/admin` is guarded in the `admin/layout.tsx` server component + re-checked in every server action**, not in middleware. Next 16 deprecates `middleware`→`proxy`, and edge middleware can't run the Prisma role lookup. This matches the repo's existing per-route `getSession()` convention. The existing `src/middleware.ts` (tenant header) is left untouched.
3. **Real `admin/` route segment**, not a `(admin)` route group — a group would not produce the `/admin` URL. It still gets its own layout and escapes the `(marketing)` chrome because it lives outside that group.
4. **The versioning service takes an explicit `tenantId` and uses the base `getDb()` client** (not the auto-scoping `getTenantDb()`), because `unstable_cache` callbacks must not read request context (`headers()`/`getTenant()`), and the scoped client bans `update`/`delete`. Safety comes from the service always filtering by the passed `tenantId` and only mutating rows it read within that tenant. CMS models are therefore **not** added to `TENANT_SCOPED_MODELS`.
5. **First-admin bootstrap via `ADMIN_BOOTSTRAP_EMAILS` env allowlist.** Matching sessions get `isPlatformAdmin=true` so the owner can reach `/admin` before any `Membership` row exists. Member-management UI is a later phase.
6. **TDD scope:** the repo has no React component test setup (Vitest node-env only). TDD is applied to all server/pure logic; React UI is verified via `npx tsc --noEmit`, `npm run lint`, `npm run build`, and explicit manual dev checks.

---

## File structure

**Create:**
- `src/server/cms/revisions.ts` — pure revision selectors (`nextVersion`, `findPublished`, `findDraft`).
- `src/server/cms/revisions.test.ts` — unit tests for the above.
- `src/server/cms/versioning.ts` — versioning service (`ensureEditable`, `getPublishedData`, `getDraftData`, `saveDraft`, `publish`, `listHistory`, `rollback`).
- `src/server/cms/versioning.test.ts` — service tests (mocked `getDb`).
- `src/server/cms/cache.ts` — tag helpers (`configTag`) + `revalidateCmsTag` wrapper.
- `src/server/cms/config-form.ts` — pure config merge helper (`mergeConfig`).
- `src/server/cms/config-form.test.ts` — merge tests.
- `src/server/admin/roles.ts` — pure helpers (`roleSatisfies`, bootstrap-email allowlist).
- `src/server/admin/roles.test.ts` — pure-helper tests.
- `src/server/admin/access.ts` — `getAdminContext`, `requireRole` (service; imports `./roles`).
- `src/components/admin/fields/TextField.tsx`, `TextAreaField.tsx`, `SwitchField.tsx` — reusable client form fields.
- `src/app/admin/layout.tsx` — admin chrome + auth guard.
- `src/app/admin/page.tsx` — dashboard.
- `src/app/no-access/page.tsx` — 403 page (outside `admin/` to avoid the guard redirect loop).
- `src/app/admin/config/page.tsx` — config editor (server).
- `src/app/admin/config/ConfigEditor.tsx` — config form (client).
- `src/app/admin/config/actions.ts` — server actions.
- `src/app/admin/config/history/page.tsx` — revision history + rollback.
- `src/app/admin/preview/enable/route.ts`, `src/app/admin/preview/disable/route.ts` — Draft Mode toggles.

**Modify:**
- `prisma/schema.prisma` — add enums + `AdminUser`, `Membership`, `Editable`, `Revision`, `AuditLog`.
- `src/server/tenant/config.ts` — `getTenantConfig()` reads the published `CONFIG` revision via `unstable_cache` + Draft Mode branch; remove the `configCache` Map.
- `src/server/tenant/config.test.ts` — extend for the new read path.
- `src/lib/env.ts` — add `ADMIN_BOOTSTRAP_EMAILS`.
- `prisma/seed.ts` — seed the initial `CONFIG` revision from the tenant's config (idempotent).

---

# PHASE 0 — Foundation

## Task 0.1: Prisma models + migration

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add enums and models to `prisma/schema.prisma`**

Append to the end of `prisma/schema.prisma`:

```prisma
enum AdminRole {
  OWNER
  ADMIN
  EDITOR
  VIEWER
}

enum RevisionState {
  DRAFT
  PUBLISHED
  ARCHIVED
}

enum EditableKind {
  CONFIG
  PAGE_SEO
  REDIRECTS
  NAV
  OFFICER
  RATE
  TESTIMONIAL
  PROGRAM
}

model AdminUser {
  id              String       @id @default(cuid())
  cognitoSub      String       @unique
  email           String
  name            String
  isPlatformAdmin Boolean      @default(false)
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt
  memberships     Membership[]

  @@map("admin_users")
}

model Membership {
  id        String    @id @default(cuid())
  userId    String
  tenantId  String
  role      AdminRole
  createdAt DateTime  @default(now())
  user      AdminUser @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, tenantId])
  @@index([tenantId])
  @@map("memberships")
}

model Editable {
  id        String       @id @default(cuid())
  tenantId  String
  kind      EditableKind
  key       String
  createdAt DateTime     @default(now())
  revisions Revision[]

  @@unique([tenantId, kind, key])
  @@index([tenantId])
  @@map("editables")
}

model Revision {
  id          String        @id @default(cuid())
  tenantId    String
  editableId  String
  version     Int
  state       RevisionState @default(DRAFT)
  data        Json
  authorId    String?
  note        String?
  createdAt   DateTime      @default(now())
  publishedAt DateTime?
  editable    Editable      @relation(fields: [editableId], references: [id], onDelete: Cascade)

  @@unique([editableId, version])
  @@index([tenantId])
  @@index([editableId, state])
  @@map("revisions")
}

model AuditLog {
  id         String   @id @default(cuid())
  tenantId   String
  userId     String?
  action     String
  editableId String?
  meta       Json?
  at         DateTime @default(now())

  @@index([tenantId, at])
  @@map("audit_logs")
}
```

- [ ] **Step 2: Create the migration**

Run: `npx prisma migrate dev --name cms_foundation`
Expected: creates `prisma/migrations/<timestamp>_cms_foundation/migration.sql`, applies it, and regenerates the client. Output ends with `Your database is now in sync with your schema.`

- [ ] **Step 3: Verify the client typechecks**

Run: `npx tsc --noEmit`
Expected: PASS (no errors). The new models (`getDb().adminUser`, `.membership`, `.editable`, `.revision`, `.auditLog`) are now typed.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(cms): add Editable/Revision/AdminUser/Membership/AuditLog models"
```

---

## Task 0.2: Pure revision selectors (TDD)

**Files:**
- Create: `src/server/cms/revisions.ts`
- Test: `src/server/cms/revisions.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/server/cms/revisions.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { nextVersion, findPublished, findDraft } from "./revisions";

const rev = (version: number, state: string) => ({ version, state });

describe("nextVersion", () => {
  it("returns 1 for no revisions", () => {
    expect(nextVersion([])).toBe(1);
  });
  it("returns max version + 1", () => {
    expect(nextVersion([rev(1, "ARCHIVED"), rev(3, "PUBLISHED"), rev(2, "DRAFT")])).toBe(4);
  });
});

describe("findPublished", () => {
  it("returns null when none published", () => {
    expect(findPublished([rev(1, "DRAFT")])).toBeNull();
  });
  it("returns the highest-version PUBLISHED revision", () => {
    const r = findPublished([rev(1, "PUBLISHED"), rev(2, "ARCHIVED"), rev(3, "PUBLISHED")]);
    expect(r?.version).toBe(3);
  });
});

describe("findDraft", () => {
  it("returns null when no draft", () => {
    expect(findDraft([rev(1, "PUBLISHED")])).toBeNull();
  });
  it("returns the highest-version DRAFT revision", () => {
    const r = findDraft([rev(1, "DRAFT"), rev(2, "DRAFT")]);
    expect(r?.version).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/server/cms/revisions.test.ts`
Expected: FAIL — `Failed to resolve import "./revisions"`.

- [ ] **Step 3: Write the implementation**

Create `src/server/cms/revisions.ts`:

```typescript
/** Pure selectors over a list of revisions. No DB, no I/O — unit-tested. */

/** The next version number = current max + 1 (1 when there are none). */
export function nextVersion(revisions: { version: number }[]): number {
  return revisions.reduce((max, r) => Math.max(max, r.version), 0) + 1;
}

/** The live revision: highest-version PUBLISHED, or null. */
export function findPublished<T extends { version: number; state: string }>(
  revisions: T[],
): T | null {
  return (
    revisions
      .filter((r) => r.state === "PUBLISHED")
      .sort((a, b) => b.version - a.version)[0] ?? null
  );
}

/** The working draft: highest-version DRAFT, or null. */
export function findDraft<T extends { version: number; state: string }>(
  revisions: T[],
): T | null {
  return (
    revisions
      .filter((r) => r.state === "DRAFT")
      .sort((a, b) => b.version - a.version)[0] ?? null
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/server/cms/revisions.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/cms/revisions.ts src/server/cms/revisions.test.ts
git commit -m "feat(cms): pure revision selectors"
```

---

## Task 0.3: Versioning service (TDD)

**Files:**
- Create: `src/server/cms/versioning.ts`
- Test: `src/server/cms/versioning.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/server/cms/versioning.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));

import { getDb } from "@/lib/db";
import { saveDraft, publish, getPublishedData } from "./versioning";

const T = "tenant_msfg";

type Rev = {
  id: string;
  tenantId: string;
  editableId: string;
  version: number;
  state: string;
  data: unknown;
  authorId: string | null;
  note: string | null;
};

function fakeDb(initial: { editable?: { id: string }; revisions?: Rev[] } = {}) {
  const revisions: Rev[] = initial.revisions ?? [];
  const editable = initial.editable ?? { id: "ed1" };
  return {
    revisions,
    editable: {
      upsert: vi.fn(async () => editable),
      findUnique: vi.fn(async () => editable),
    },
    revision: {
      findMany: vi.fn(async () => revisions),
      findFirst: vi.fn(async ({ where, orderBy }: any) => {
        const matched = revisions
          .filter((r) => r.state === where.state)
          .sort((a, b) => b.version - a.version);
        return matched[0] ?? null;
      }),
      create: vi.fn(async ({ data }: any) => ({ id: "new", ...data })),
      update: vi.fn(async ({ where, data }: any) => ({ ...revisions.find((r) => r.id === where.id), ...data })),
    },
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
}

beforeEach(() => vi.clearAllMocks());

describe("saveDraft", () => {
  it("creates a v1 DRAFT when none exists", async () => {
    const db = fakeDb({ revisions: [] });
    (getDb as any).mockReturnValue(db);
    await saveDraft(T, "CONFIG", "default", { brand: { shortName: "X" } }, "u1");
    expect(db.revision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tenantId: T, version: 1, state: "DRAFT", authorId: "u1" }),
    });
  });

  it("updates the existing DRAFT instead of creating a new one", async () => {
    const db = fakeDb({
      revisions: [{ id: "d1", tenantId: T, editableId: "ed1", version: 1, state: "DRAFT", data: {}, authorId: "u1", note: null }],
    });
    (getDb as any).mockReturnValue(db);
    await saveDraft(T, "CONFIG", "default", { brand: { shortName: "Y" } }, "u1");
    expect(db.revision.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "d1" } }));
    expect(db.revision.create).not.toHaveBeenCalled();
  });
});

describe("publish", () => {
  it("promotes the draft and archives the prior published", async () => {
    const db = fakeDb({
      revisions: [
        { id: "p1", tenantId: T, editableId: "ed1", version: 1, state: "PUBLISHED", data: {}, authorId: null, note: null },
        { id: "d2", tenantId: T, editableId: "ed1", version: 2, state: "DRAFT", data: {}, authorId: "u1", note: null },
      ],
    });
    (getDb as any).mockReturnValue(db);
    await publish(T, "CONFIG", "default", "u1");
    // draft promoted
    expect(db.revision.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "d2" }, data: expect.objectContaining({ state: "PUBLISHED" }) }),
    );
    // prior published archived
    expect(db.revision.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "p1" }, data: { state: "ARCHIVED" } }),
    );
  });

  it("throws when there is no draft to publish", async () => {
    const db = fakeDb({ revisions: [] });
    (getDb as any).mockReturnValue(db);
    await expect(publish(T, "CONFIG", "default", "u1")).rejects.toThrow(/no draft/i);
  });
});

describe("getPublishedData", () => {
  it("returns the published revision's data, scoped by tenantId", async () => {
    const db = fakeDb({
      revisions: [{ id: "p1", tenantId: T, editableId: "ed1", version: 1, state: "PUBLISHED", data: { ok: true }, authorId: null, note: null }],
    });
    (getDb as any).mockReturnValue(db);
    const data = await getPublishedData(T, "CONFIG", "default");
    expect(data).toEqual({ ok: true });
    // scoping: every revision query carries tenantId
    expect(db.revision.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: T }) }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/server/cms/versioning.test.ts`
Expected: FAIL — `Failed to resolve import "./versioning"`.

- [ ] **Step 3: Write the implementation**

Create `src/server/cms/versioning.ts`:

```typescript
import "server-only";
import type { Prisma, EditableKind } from "@prisma/client";
import { getDb } from "@/lib/db";
import { nextVersion, findDraft, findPublished } from "./revisions";

/**
 * The CMS versioning service: the single access path to Editable/Revision rows.
 * Always filtered by an explicit `tenantId` (cache-safe — no request context),
 * uses the base Prisma client, and only mutates rows it read within the tenant.
 */

async function ensureEditable(tenantId: string, kind: EditableKind, key: string) {
  return getDb().editable.upsert({
    where: { tenantId_kind_key: { tenantId, kind, key } },
    update: {},
    create: { tenantId, kind, key },
  });
}

/** Latest PUBLISHED revision's `data`, or null. */
export async function getPublishedData<T = unknown>(
  tenantId: string,
  kind: EditableKind,
  key: string,
): Promise<T | null> {
  const ed = await getDb().editable.findUnique({
    where: { tenantId_kind_key: { tenantId, kind, key } },
    select: { id: true },
  });
  if (!ed) return null;
  const rev = await getDb().revision.findFirst({
    where: { tenantId, editableId: ed.id, state: "PUBLISHED" },
    orderBy: { version: "desc" },
  });
  return (rev?.data as T) ?? null;
}

/** Latest DRAFT revision's `data`, or null. */
export async function getDraftData<T = unknown>(
  tenantId: string,
  kind: EditableKind,
  key: string,
): Promise<T | null> {
  const ed = await getDb().editable.findUnique({
    where: { tenantId_kind_key: { tenantId, kind, key } },
    select: { id: true },
  });
  if (!ed) return null;
  const rev = await getDb().revision.findFirst({
    where: { tenantId, editableId: ed.id, state: "DRAFT" },
    orderBy: { version: "desc" },
  });
  return (rev?.data as T) ?? null;
}

/** Create the single DRAFT (or update it if one exists). */
export async function saveDraft(
  tenantId: string,
  kind: EditableKind,
  key: string,
  data: unknown,
  authorId?: string,
  note?: string,
) {
  const ed = await ensureEditable(tenantId, kind, key);
  const revisions = await getDb().revision.findMany({ where: { tenantId, editableId: ed.id } });
  const draft = findDraft(revisions);
  const json = data as Prisma.InputJsonValue;
  if (draft) {
    return getDb().revision.update({
      where: { id: draft.id },
      data: { data: json, authorId: authorId ?? draft.authorId, note: note ?? draft.note },
    });
  }
  return getDb().revision.create({
    data: {
      tenantId,
      editableId: ed.id,
      version: nextVersion(revisions),
      state: "DRAFT",
      data: json,
      authorId: authorId ?? null,
      note: note ?? null,
    },
  });
}

/** Promote the current DRAFT to PUBLISHED; archive the prior PUBLISHED. */
export async function publish(
  tenantId: string,
  kind: EditableKind,
  key: string,
  authorId?: string,
) {
  const ed = await ensureEditable(tenantId, kind, key);
  const revisions = await getDb().revision.findMany({ where: { tenantId, editableId: ed.id } });
  const draft = findDraft(revisions);
  if (!draft) throw new Error("No draft to publish");
  const prev = findPublished(revisions);
  const ops = [
    getDb().revision.update({
      where: { id: draft.id },
      data: { state: "PUBLISHED", publishedAt: new Date(), authorId: authorId ?? draft.authorId },
    }),
    ...(prev
      ? [getDb().revision.update({ where: { id: prev.id }, data: { state: "ARCHIVED" } })]
      : []),
  ];
  const [published] = await getDb().$transaction(ops);
  return published;
}

/** Full revision history (newest first). */
export async function listHistory(tenantId: string, kind: EditableKind, key: string) {
  const ed = await getDb().editable.findUnique({
    where: { tenantId_kind_key: { tenantId, kind, key } },
    select: { id: true },
  });
  if (!ed) return [];
  return getDb().revision.findMany({
    where: { tenantId, editableId: ed.id },
    orderBy: { version: "desc" },
  });
}

/** Copy a historical revision's data into a new/updated DRAFT (review then publish). */
export async function rollback(
  tenantId: string,
  kind: EditableKind,
  key: string,
  toVersion: number,
  authorId?: string,
) {
  const ed = await ensureEditable(tenantId, kind, key);
  const revisions = await getDb().revision.findMany({ where: { tenantId, editableId: ed.id } });
  const target = revisions.find((r) => r.version === toVersion);
  if (!target) throw new Error(`No revision v${toVersion}`);
  const note = `Rolled back to v${toVersion}`;
  const draft = findDraft(revisions);
  const json = target.data as Prisma.InputJsonValue;
  if (draft) {
    return getDb().revision.update({
      where: { id: draft.id },
      data: { data: json, authorId: authorId ?? null, note },
    });
  }
  return getDb().revision.create({
    data: {
      tenantId,
      editableId: ed.id,
      version: nextVersion(revisions),
      state: "DRAFT",
      data: json,
      authorId: authorId ?? null,
      note,
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/server/cms/versioning.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/cms/versioning.ts src/server/cms/versioning.test.ts
git commit -m "feat(cms): versioning service (draft/publish/rollback/history)"
```

---

## Task 0.4: Cache tag helpers

**Files:**
- Create: `src/server/cms/cache.ts`

- [ ] **Step 1: Write the implementation**

Create `src/server/cms/cache.ts`:

```typescript
import "server-only";
import { revalidateTag } from "next/cache";

/** Cache tag for a tenant's published config. Keep tag strings centralized. */
export function configTag(tenantId: string): string {
  return `t:${tenantId}:config`;
}

/**
 * Invalidate a CMS cache tag. In THIS Next build `revalidateTag` REQUIRES a
 * cache-profile arg; `"max"` = stale-while-revalidate (publish marks the tag
 * stale; the next request re-fetches). The single-arg form is deprecated and
 * fails `tsc`. Wrapped here so the signature is isolated to one call site.
 */
export function revalidateCmsTag(tag: string): void {
  revalidateTag(tag, "max");
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS. (`revalidateTag` requires the second cache-profile arg in this Next build — encoded as `revalidateTag(tag, "max")` above; the single-arg form is deprecated and errors. Ref: `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidateTag.md`.)

- [ ] **Step 3: Commit**

```bash
git add src/server/cms/cache.ts
git commit -m "feat(cms): cache tag helpers"
```

---

## Task 0.5: Route `getTenantConfig` through the versioning engine

**Files:**
- Modify: `src/server/tenant/config.ts`
- Modify: `src/server/tenant/config.test.ts`

- [ ] **Step 1: Replace the config read path in `src/server/tenant/config.ts`**

Replace the `configCache` block and `getTenantConfig` (currently `config.ts:46-63`) with:

```typescript
import { unstable_cache } from "next/cache";
import { draftMode } from "next/headers";
import { getPublishedData, getDraftData } from "@/server/cms/versioning";
import { configTag } from "@/server/cms/cache";

/**
 * Cached reader for a tenant's PUBLISHED config revision. Per-tenant tag so a
 * publish can `revalidateTag(configTag(id))`. Falls back to DEFAULT via
 * parseTenantConfig when no published revision exists.
 */
function publishedConfigReader(tenantId: string) {
  return unstable_cache(
    async () => parseTenantConfig(await getPublishedData(tenantId, "CONFIG", "default")),
    ["tenant-config", tenantId],
    { tags: [configTag(tenantId)] },
  );
}

/** Resolve the active tenant's config. Draft Mode editors see the working draft. */
export async function getTenantConfig(): Promise<TenantConfig> {
  const tenant = await getTenant();

  let isDraft = false;
  try {
    isDraft = (await draftMode()).isEnabled;
  } catch {
    isDraft = false; // outside a request scope (e.g. unit tests)
  }
  if (isDraft) {
    const draft = await getDraftData(tenant.id, "CONFIG", "default");
    if (draft != null) return parseTenantConfig(draft);
  }

  return publishedConfigReader(tenant.id)();
}
```

Delete the old `const configCache = new Map...` line and the old body of `getTenantConfig`. **Keep** `parseTenantConfig`, `tenantOrigin`, `getTenantOrigin`, and the `originCache` Map unchanged (domains aren't CMS-edited in this phase).

- [ ] **Step 2: Update the test to cover the new path**

In `src/server/tenant/config.test.ts`, add these mocks near the top (with the existing `vi.mock` calls):

```typescript
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
}));
vi.mock("next/headers", () => ({
  draftMode: vi.fn(async () => ({ isEnabled: false })),
}));
vi.mock("@/server/cms/versioning", () => ({
  getPublishedData: vi.fn(),
  getDraftData: vi.fn(),
}));
vi.mock("@/server/cms/cache", () => ({ configTag: (id: string) => `t:${id}:config` }));
```

Then add this describe block (keep the existing `parseTenantConfig`/`tenantOrigin` tests):

```typescript
import { getTenantConfig } from "./config";
import { getTenant } from "./resolve";
import { getPublishedData, getDraftData } from "@/server/cms/versioning";
import { draftMode } from "next/headers";

describe("getTenantConfig", () => {
  it("returns parsed published config when not in draft mode", async () => {
    (getTenant as any).mockResolvedValue({ id: "tenant_msfg", slug: "msfg", name: "MSFG" });
    (draftMode as any).mockResolvedValue({ isEnabled: false });
    (getPublishedData as any).mockResolvedValue({
      ...DEFAULT_TENANT_CONFIG,
      brand: { ...DEFAULT_TENANT_CONFIG.brand, shortName: "Pub" },
    });
    const cfg = await getTenantConfig();
    expect(cfg.brand.shortName).toBe("Pub");
    expect(getDraftData).not.toHaveBeenCalled();
  });

  it("returns the draft config when draft mode is enabled", async () => {
    (getTenant as any).mockResolvedValue({ id: "tenant_msfg", slug: "msfg", name: "MSFG" });
    (draftMode as any).mockResolvedValue({ isEnabled: true });
    (getDraftData as any).mockResolvedValue({
      ...DEFAULT_TENANT_CONFIG,
      brand: { ...DEFAULT_TENANT_CONFIG.brand, shortName: "Draft" },
    });
    const cfg = await getTenantConfig();
    expect(cfg.brand.shortName).toBe("Draft");
  });

  it("falls back to DEFAULT when no published revision exists", async () => {
    (getTenant as any).mockResolvedValue({ id: "tenant_msfg", slug: "msfg", name: "MSFG" });
    (draftMode as any).mockResolvedValue({ isEnabled: false });
    (getPublishedData as any).mockResolvedValue(null);
    const cfg = await getTenantConfig();
    expect(cfg).toEqual(DEFAULT_TENANT_CONFIG);
  });
});
```

Ensure `getTenant` is mocked (the existing file already does `vi.mock("./resolve", () => ({ getTenant: vi.fn() }))`).

- [ ] **Step 3: Run the tests**

Run: `npm run test -- src/server/tenant/config.test.ts`
Expected: PASS (existing tests + 3 new).

- [ ] **Step 4: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/tenant/config.ts src/server/tenant/config.test.ts
git commit -m "feat(cms): read tenant config from published revision via tagged cache"
```

---

## Task 0.6: Seed the initial CONFIG revision

**Files:**
- Modify: `prisma/seed.ts`

- [ ] **Step 1: Add a config-revision seed step**

In `prisma/seed.ts`, add this function (uses the base client already created in the file as `prisma`, and `TENANT_ID`/`DEFAULT_TENANT_CONFIG` already imported):

```typescript
async function seedConfigRevision() {
  const tenantId = TENANT_ID;
  // Seed from the tenant's stored config, else the bundled default.
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { config: true } });
  const data = (tenant?.config ?? DEFAULT_TENANT_CONFIG) as unknown as Prisma.InputJsonValue;

  const editable = await prisma.editable.upsert({
    where: { tenantId_kind_key: { tenantId, kind: "CONFIG", key: "default" } },
    update: {},
    create: { tenantId, kind: "CONFIG", key: "default" },
  });

  const existingPublished = await prisma.revision.findFirst({
    where: { tenantId, editableId: editable.id, state: "PUBLISHED" },
  });
  if (existingPublished) return; // idempotent — don't clobber edited config

  await prisma.revision.create({
    data: { tenantId, editableId: editable.id, version: 1, state: "PUBLISHED", data, publishedAt: new Date(), note: "Seed" },
  });
}
```

Add `await seedConfigRevision();` inside `main()` immediately after `await seedTenant();`. Ensure `Prisma` is imported (the file already imports from `@prisma/client` for `Prisma.InputJsonValue`).

- [ ] **Step 2: Run the seed**

Run: `npm run db:seed`
Expected: completes without error; the existing summary line prints. (Requires a reachable dev `DATABASE_URL`.)

- [ ] **Step 3: Verify the revision exists**

Run: `npm run test -- src/server/cms` (regression: all CMS unit tests still pass)
Expected: PASS. Optionally open `npm run db:studio` and confirm one `revisions` row with `state=PUBLISHED, version=1` for the MSFG tenant.

- [ ] **Step 4: Commit**

```bash
git add prisma/seed.ts
git commit -m "feat(cms): seed initial published CONFIG revision (idempotent)"
```

---

## Phase 0 checkpoint

Run the full suite and build:

```bash
npm run test && npx tsc --noEmit && npm run lint && npm run build
```

Expected: all pass; the MSFG site builds and renders unchanged (config now sourced from the published revision). This is a natural review/checkpoint boundary before Phase 1.

---

# PHASE 1 — Auth/RBAC + admin shell

## Task 1.1: Add the bootstrap-admin env var

**Files:**
- Modify: `src/lib/env.ts`

- [ ] **Step 1: Add `ADMIN_BOOTSTRAP_EMAILS` to the env schema**

In `src/lib/env.ts`, inside the `z.object({ ... })` passed to the env schema (near the `COGNITO_*` vars), add:

```typescript
  // Comma-separated emails granted platform-admin on first sign-in (bootstrap
  // before any Membership row exists). Lower-cased + matched case-insensitively.
  ADMIN_BOOTSTRAP_EMAILS: z.string().optional(),
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS. `serverEnv.ADMIN_BOOTSTRAP_EMAILS` is now typed `string | undefined`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/env.ts
git commit -m "feat(admin): add ADMIN_BOOTSTRAP_EMAILS env var"
```

---

## Task 1.2: Pure access helpers (TDD)

**Files:**
- Create: `src/server/admin/roles.ts`
- Test: `src/server/admin/roles.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/server/admin/roles.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { roleSatisfies, parseEmailAllowlist, isBootstrapAdmin } from "./roles";

describe("roleSatisfies", () => {
  it("platform admin always satisfies", () => {
    expect(roleSatisfies(null, "OWNER", true)).toBe(true);
  });
  it("null role never satisfies for non-platform users", () => {
    expect(roleSatisfies(null, "VIEWER", false)).toBe(false);
  });
  it("EDITOR meets EDITOR but not ADMIN", () => {
    expect(roleSatisfies("EDITOR", "EDITOR", false)).toBe(true);
    expect(roleSatisfies("EDITOR", "ADMIN", false)).toBe(false);
  });
  it("OWNER meets lower roles", () => {
    expect(roleSatisfies("OWNER", "ADMIN", false)).toBe(true);
  });
});

describe("parseEmailAllowlist", () => {
  it("returns [] for undefined", () => {
    expect(parseEmailAllowlist(undefined)).toEqual([]);
  });
  it("splits, trims, lowercases, drops blanks", () => {
    expect(parseEmailAllowlist("A@x.com, b@Y.com ,")).toEqual(["a@x.com", "b@y.com"]);
  });
});

describe("isBootstrapAdmin", () => {
  it("matches case-insensitively", () => {
    expect(isBootstrapAdmin("Owner@MSFG.us", ["owner@msfg.us"])).toBe(true);
  });
  it("is false when not listed or email missing", () => {
    expect(isBootstrapAdmin("x@y.com", ["owner@msfg.us"])).toBe(false);
    expect(isBootstrapAdmin(undefined, ["owner@msfg.us"])).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/server/admin/roles.test.ts`
Expected: FAIL — `Failed to resolve import "./roles"`.

- [ ] **Step 3: Write the implementation**

Create `src/server/admin/roles.ts`:

```typescript
import type { AdminRole } from "@prisma/client";

/** Role precedence; higher number = more privilege. Pure — no I/O. */
const RANK: Record<AdminRole, number> = { VIEWER: 0, EDITOR: 1, ADMIN: 2, OWNER: 3 };

/** Does `role` (for the active tenant) meet the `min` requirement? Platform admins always pass. */
export function roleSatisfies(
  role: AdminRole | null,
  min: AdminRole,
  isPlatformAdmin: boolean,
): boolean {
  if (isPlatformAdmin) return true;
  if (!role) return false;
  return RANK[role] >= RANK[min];
}

/** Parse the comma-separated bootstrap allowlist into lower-cased emails. */
export function parseEmailAllowlist(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Is this email on the bootstrap allowlist (case-insensitive)? */
export function isBootstrapAdmin(email: string | undefined, allowlist: string[]): boolean {
  return !!email && allowlist.includes(email.toLowerCase());
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/server/admin/roles.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/admin/roles.ts src/server/admin/roles.test.ts
git commit -m "feat(admin): pure RBAC + bootstrap-allowlist helpers"
```

---

## Task 1.3: Admin access service

**Files:**
- Create: `src/server/admin/access.ts`

- [ ] **Step 1: Write the implementation**

Create `src/server/admin/access.ts`:

```typescript
import "server-only";
import { redirect } from "next/navigation";
import type { AdminRole, AdminUser } from "@prisma/client";
import { getDb } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { getTenant } from "@/server/tenant/resolve";
import { serverEnv } from "@/lib/env";
import type { TenantContext } from "@/server/tenant/types";
import { roleSatisfies, parseEmailAllowlist, isBootstrapAdmin } from "./roles";

export type AdminContext = {
  user: AdminUser;
  tenant: TenantContext;
  role: AdminRole | null;
  isPlatformAdmin: boolean;
};

/**
 * Resolve the current admin: read the Cognito session, upsert an AdminUser by
 * cognitoSub, resolve the active tenant, and load the membership/role.
 * Returns null when not signed in.
 */
export async function getAdminContext(): Promise<AdminContext | null> {
  const session = await getSession();
  if (!session) return null;

  const allowlist = parseEmailAllowlist(serverEnv.ADMIN_BOOTSTRAP_EMAILS);
  const bootstrap = isBootstrapAdmin(session.email, allowlist);

  const user = await getDb().adminUser.upsert({
    where: { cognitoSub: session.sub },
    update: {
      email: session.email ?? "",
      name: session.name ?? "",
      ...(bootstrap ? { isPlatformAdmin: true } : {}),
    },
    create: {
      cognitoSub: session.sub,
      email: session.email ?? "",
      name: session.name ?? "",
      isPlatformAdmin: bootstrap,
    },
  });

  const tenant = await getTenant();
  const membership = await getDb().membership.findUnique({
    where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } },
  });

  return { user, tenant, role: membership?.role ?? null, isPlatformAdmin: user.isPlatformAdmin };
}

/**
 * Require an authenticated admin with at least `min` role for the active tenant.
 * Redirects to login (unauthenticated) or /no-access (insufficient role).
 * Returns the context for the caller to use.
 */
export async function requireRole(min: AdminRole): Promise<AdminContext> {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/auth/login?returnTo=/admin");
  if (!roleSatisfies(ctx.role, min, ctx.isPlatformAdmin)) redirect("/no-access");
  return ctx;
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/server/admin/access.ts
git commit -m "feat(admin): session→AdminUser context + requireRole guard"
```

---

## Task 1.4: Admin layout (guard + chrome) and no-access page

**Files:**
- Create: `src/app/admin/layout.tsx`
- Create: `src/app/no-access/page.tsx`

> Note: `/no-access` lives **outside** `admin/` so the guard's redirect target is not itself guarded (no redirect loop).

- [ ] **Step 1: Create the no-access page**

Create `src/app/no-access/page.tsx`:

```tsx
export default function NoAccessPage() {
  return (
    <div className="mx-auto max-w-md px-6 py-24 text-center">
      <h1 className="text-2xl font-extrabold text-ink">No access</h1>
      <p className="mt-3 text-muted">
        You&apos;re signed in but not authorized for this workspace. Ask an owner to grant you access.
      </p>
      <a href="/auth/logout" className="mt-6 inline-block font-semibold text-spring-2 hover:underline">
        Sign out
      </a>
    </div>
  );
}
```

- [ ] **Step 2: Create the admin layout**

Create `src/app/admin/layout.tsx`:

```tsx
import Link from "next/link";
import { requireRole } from "@/server/admin/access";
import { Mark } from "@/components/ui/Mark";

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/config", label: "Content & SEO" },
  { href: "/admin/config/history", label: "History" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireRole("VIEWER");
  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="grid grid-cols-[240px_1fr] max-[980px]:grid-cols-1">
        <aside className="border-r border-line bg-paper-2 p-5 max-[980px]:border-b max-[980px]:border-r-0">
          <div className="mb-6 flex items-center gap-2">
            <Mark size={26} label="Admin home" />
            <span className="font-bold">Admin</span>
          </div>
          <nav className="flex flex-col gap-1">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="rounded-md px-3 py-2 text-[15px] font-semibold hover:bg-line focus:outline-none focus-visible:ring-2 focus-visible:ring-spring"
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="mt-6 border-t border-line pt-4 text-[13px] text-muted">
            <div className="font-semibold text-ink">{ctx.user.name || ctx.user.email}</div>
            <div>{ctx.tenant.name}</div>
            <div className="uppercase tracking-wide">
              {ctx.isPlatformAdmin ? "Platform" : (ctx.role ?? "—")}
            </div>
            <a href="/auth/logout" className="mt-2 inline-block font-semibold text-spring-2 hover:underline">
              Sign out
            </a>
          </div>
        </aside>
        <main className="p-8 max-[600px]:p-5">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/layout.tsx src/app/no-access/page.tsx
git commit -m "feat(admin): guarded admin layout + no-access page"
```

---

## Task 1.5: Admin dashboard page

**Files:**
- Create: `src/app/admin/page.tsx`

- [ ] **Step 1: Create the dashboard**

Create `src/app/admin/page.tsx`:

```tsx
import Link from "next/link";
import { requireRole } from "@/server/admin/access";

export default async function AdminDashboard() {
  const ctx = await requireRole("VIEWER");
  return (
    <div>
      <h1 className="text-2xl font-extrabold">Dashboard</h1>
      <p className="mt-2 text-muted">
        {ctx.user.email} · {ctx.tenant.name} ·{" "}
        {ctx.isPlatformAdmin ? "Platform admin" : (ctx.role ?? "no role")}
      </p>
      <div className="mt-6 grid grid-cols-2 gap-4 max-[600px]:grid-cols-1">
        <Link
          href="/admin/config"
          className="rounded-lg border border-line bg-paper p-5 shadow-card transition-shadow hover:shadow-pop"
        >
          <div className="font-bold">Content &amp; SEO</div>
          <div className="mt-1 text-[14px] text-muted">
            Edit branding, contact, SEO strings, and feature flags.
          </div>
        </Link>
        <Link
          href="/admin/config/history"
          className="rounded-lg border border-line bg-paper p-5 shadow-card transition-shadow hover:shadow-pop"
        >
          <div className="font-bold">History</div>
          <div className="mt-1 text-[14px] text-muted">Review and roll back published versions.</div>
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: PASS — `/admin`, `/admin/config` (placeholder until Phase 2), and `/no-access` compile.

- [ ] **Step 3: Manual verification**

1. Set `ADMIN_BOOTSTRAP_EMAILS=<your-cognito-email>` in `.env`.
2. Run `npm run dev`, visit `/admin`. Unauthenticated → redirected to Cognito login; after login → dashboard renders with your email/tenant/"Platform admin".
3. Temporarily unset the env var + clear cookies; sign in again → `/no-access` (no membership, not bootstrap).
4. Restore the env var.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/page.tsx
git commit -m "feat(admin): dashboard page"
```

---

# PHASE 2 — Config editor (the full loop)

> **Scope note:** Phase 2 implements the editor for the **brand, contact, seo, and features** sections — enough to prove the complete draft → preview → publish → rollback loop end-to-end on real config + SEO strings. The remaining scalar sections (`theme`, `legal`, `marketing`) reuse the exact same field components and `set*` pattern — a mechanical extension deferred to keep this milestone focused. Array editors (e.g. `legal.states`) are a later refinement.

## Task 2.1: Reusable form field components

**Files:**
- Create: `src/components/admin/fields/TextField.tsx`
- Create: `src/components/admin/fields/TextAreaField.tsx`
- Create: `src/components/admin/fields/SwitchField.tsx`

- [ ] **Step 1: Create `TextField.tsx`**

```tsx
"use client";

export function TextField({
  label,
  name,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  const id = `f-${name}`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[12px] font-bold uppercase tracking-[0.03em] text-muted">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-[46px] rounded-md border-[1.5px] border-line bg-paper px-3.5 text-[15px] text-ink outline-none focus:border-spring"
      />
    </div>
  );
}
```

- [ ] **Step 2: Create `TextAreaField.tsx`**

```tsx
"use client";

export function TextAreaField({
  label,
  name,
  value,
  onChange,
  rows = 3,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}) {
  const id = `f-${name}`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[12px] font-bold uppercase tracking-[0.03em] text-muted">
        {label}
      </label>
      <textarea
        id={id}
        name={name}
        value={value}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border-[1.5px] border-line bg-paper px-3.5 py-2.5 text-[15px] text-ink outline-none focus:border-spring"
      />
    </div>
  );
}
```

- [ ] **Step 3: Create `SwitchField.tsx`**

```tsx
"use client";

import { Switch } from "@/components/ui/Switch";

export function SwitchField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-line bg-paper px-3.5 py-3">
      <span className="text-[14px] font-semibold text-ink">{label}</span>
      <Switch checked={checked} onChange={onChange} label={label} />
    </div>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/fields
git commit -m "feat(admin): reusable form field components"
```

---

## Task 2.2: Config merge helper (TDD)

**Files:**
- Create: `src/server/cms/config-form.ts`
- Test: `src/server/cms/config-form.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/server/cms/config-form.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { mergeConfig } from "./config-form";

describe("mergeConfig", () => {
  it("overrides scalars within a section, preserving untouched siblings", () => {
    const base = { brand: { shortName: "A", legalName: "L" }, features: { x: true } };
    expect(mergeConfig(base, { brand: { shortName: "B" } })).toEqual({
      brand: { shortName: "B", legalName: "L" },
      features: { x: true },
    });
  });
  it("replaces arrays wholesale", () => {
    expect(mergeConfig({ seo: { keywords: ["a", "b"] } }, { seo: { keywords: ["c"] } })).toEqual({
      seo: { keywords: ["c"] },
    });
  });
  it("adds new sections", () => {
    expect(mergeConfig({}, { features: { y: false } })).toEqual({ features: { y: false } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/server/cms/config-form.test.ts`
Expected: FAIL — `Failed to resolve import "./config-form"`.

- [ ] **Step 3: Write the implementation**

Create `src/server/cms/config-form.ts`:

```typescript
type Obj = Record<string, unknown>;

function isPlainObject(v: unknown): v is Obj {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/**
 * Merge editor `patch` over a `base` config, one level deep into each section.
 * Scalars and arrays in a patched section override; untouched siblings persist.
 * Pure — no I/O.
 */
export function mergeConfig(base: unknown, patch: unknown): Obj {
  const b = isPlainObject(base) ? base : {};
  const p = isPlainObject(patch) ? patch : {};
  const out: Obj = { ...b };
  for (const [key, value] of Object.entries(p)) {
    if (isPlainObject(value) && isPlainObject(b[key])) {
      out[key] = { ...(b[key] as Obj), ...value };
    } else {
      out[key] = value;
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/server/cms/config-form.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/cms/config-form.ts src/server/cms/config-form.test.ts
git commit -m "feat(cms): config merge helper"
```

---

## Task 2.3: Config server actions

**Files:**
- Create: `src/app/admin/config/actions.ts`

- [ ] **Step 1: Write the implementation**

Create `src/app/admin/config/actions.ts`:

```typescript
"use server";

import { requireRole } from "@/server/admin/access";
import {
  saveDraft,
  publish,
  rollback,
  getDraftData,
  getPublishedData,
} from "@/server/cms/versioning";
import { mergeConfig } from "@/server/cms/config-form";
import { revalidateCmsTag, configTag } from "@/server/cms/cache";
import { TenantConfigSchema } from "@/content/site";
import { getDb } from "@/lib/db";

/** Merge the editor's section patch over the current config and save it as the draft. */
export async function saveConfigDraftAction(patch: Record<string, unknown>) {
  const ctx = await requireRole("EDITOR");
  const base =
    (await getDraftData(ctx.tenant.id, "CONFIG", "default")) ??
    (await getPublishedData(ctx.tenant.id, "CONFIG", "default")) ??
    {};
  const merged = mergeConfig(base, patch);
  const parsed = TenantConfigSchema.parse(merged); // throws on invalid → surfaced to the editor
  await saveDraft(ctx.tenant.id, "CONFIG", "default", parsed, ctx.user.id);
  await getDb().auditLog.create({
    data: { tenantId: ctx.tenant.id, userId: ctx.user.id, action: "config.save_draft" },
  });
  return { ok: true as const };
}

/** Publish the current draft and invalidate the live config cache. */
export async function publishConfigAction() {
  const ctx = await requireRole("EDITOR");
  await publish(ctx.tenant.id, "CONFIG", "default", ctx.user.id);
  revalidateCmsTag(configTag(ctx.tenant.id));
  await getDb().auditLog.create({
    data: { tenantId: ctx.tenant.id, userId: ctx.user.id, action: "config.publish" },
  });
  return { ok: true as const };
}

/** Copy a historical version into a new draft (review, then publish). */
export async function rollbackConfigAction(version: number) {
  const ctx = await requireRole("EDITOR");
  await rollback(ctx.tenant.id, "CONFIG", "default", version, ctx.user.id);
  await getDb().auditLog.create({
    data: { tenantId: ctx.tenant.id, userId: ctx.user.id, action: "config.rollback", meta: { version } },
  });
  return { ok: true as const };
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/config/actions.ts
git commit -m "feat(admin): config save-draft/publish/rollback server actions"
```

---

## Task 2.4: Draft Mode preview routes

**Files:**
- Create: `src/app/admin/preview/enable/route.ts`
- Create: `src/app/admin/preview/disable/route.ts`

- [ ] **Step 1: Create the enable route**

Create `src/app/admin/preview/enable/route.ts`:

```typescript
import { draftMode } from "next/headers";
import { redirect } from "next/navigation";
import { requireRole } from "@/server/admin/access";

/** Turn on Draft Mode for the current editor, then open the requested public path. */
export async function GET(request: Request) {
  await requireRole("EDITOR");
  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path") ?? "/";
  const dm = await draftMode();
  dm.enable();
  redirect(path.startsWith("/") ? path : "/");
}
```

- [ ] **Step 2: Create the disable route**

Create `src/app/admin/preview/disable/route.ts`:

```typescript
import { draftMode } from "next/headers";
import { redirect } from "next/navigation";

/** Exit Draft Mode and return to the editor. */
export async function GET() {
  const dm = await draftMode();
  dm.disable();
  redirect("/admin/config");
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/preview
git commit -m "feat(admin): Draft Mode preview enable/disable routes"
```

---

## Task 2.5: Config editor page + client form

**Files:**
- Create: `src/app/admin/config/page.tsx`
- Create: `src/app/admin/config/ConfigEditor.tsx`

- [ ] **Step 1: Create the server page**

Create `src/app/admin/config/page.tsx`:

```tsx
import { requireRole } from "@/server/admin/access";
import { getDraftData, getPublishedData } from "@/server/cms/versioning";
import { parseTenantConfig } from "@/server/tenant/config";
import { ConfigEditor } from "./ConfigEditor";

export default async function ConfigPage() {
  const ctx = await requireRole("EDITOR");
  const draft = await getDraftData(ctx.tenant.id, "CONFIG", "default");
  const published = await getPublishedData(ctx.tenant.id, "CONFIG", "default");
  const config = parseTenantConfig(draft ?? published ?? null);
  return <ConfigEditor initialConfig={config} hasDraft={draft != null} />;
}
```

- [ ] **Step 2: Create the client editor**

Create `src/app/admin/config/ConfigEditor.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { TenantConfig } from "@/content/site";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/admin/fields/TextField";
import { TextAreaField } from "@/components/admin/fields/TextAreaField";
import { SwitchField } from "@/components/admin/fields/SwitchField";
import { saveConfigDraftAction, publishConfigAction } from "./actions";

export function ConfigEditor({
  initialConfig,
  hasDraft,
}: {
  initialConfig: TenantConfig;
  hasDraft: boolean;
}) {
  const [cfg, setCfg] = useState<TenantConfig>(initialConfig);
  const [status, setStatus] = useState(hasDraft ? "Unpublished draft loaded." : "");
  const [busy, setBusy] = useState(false);

  const setBrand = <K extends keyof TenantConfig["brand"]>(k: K, v: TenantConfig["brand"][K]) =>
    setCfg((c) => ({ ...c, brand: { ...c.brand, [k]: v } }));
  const setContact = <K extends keyof TenantConfig["contact"]>(k: K, v: TenantConfig["contact"][K]) =>
    setCfg((c) => ({ ...c, contact: { ...c.contact, [k]: v } }));
  const setSeo = <K extends keyof TenantConfig["seo"]>(k: K, v: TenantConfig["seo"][K]) =>
    setCfg((c) => ({ ...c, seo: { ...c.seo, [k]: v } }));
  const setFeature = <K extends keyof TenantConfig["features"]>(k: K, v: boolean) =>
    setCfg((c) => ({ ...c, features: { ...c.features, [k]: v } }));

  const patch = () => ({ brand: cfg.brand, contact: cfg.contact, seo: cfg.seo, features: cfg.features });

  async function onSave() {
    setBusy(true);
    try {
      await saveConfigDraftAction(patch());
      setStatus("Draft saved.");
    } catch (e) {
      setStatus(`Save failed: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      setBusy(false);
    }
  }

  async function onPublish() {
    setBusy(true);
    try {
      await saveConfigDraftAction(patch());
      await publishConfigAction();
      setStatus("Published. Live within seconds.");
    } catch (e) {
      setStatus(`Publish failed: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">Content &amp; SEO</h1>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" href="/admin/preview/enable?path=/">Preview</Button>
          <Button variant="dark" size="sm" onClick={onSave} disabled={busy}>Save draft</Button>
          <Button variant="green" size="sm" onClick={onPublish} disabled={busy}>Publish</Button>
        </div>
      </div>
      {status && (
        <p className="mb-5 text-[14px] font-semibold text-spring-2" role="status">
          {status}
        </p>
      )}

      <section className="mb-8">
        <h2 className="mb-3 text-[13px] font-bold uppercase tracking-wide text-muted">Brand</h2>
        <div className="grid gap-4">
          <TextField label="Short name" name="brand.shortName" value={cfg.brand.shortName} onChange={(v) => setBrand("shortName", v)} />
          <TextField label="Legal name" name="brand.legalName" value={cfg.brand.legalName} onChange={(v) => setBrand("legalName", v)} />
          <TextField label="Founded year" name="brand.foundedYear" type="number" value={String(cfg.brand.foundedYear)} onChange={(v) => setBrand("foundedYear", Number(v) || 0)} />
          <TextField label="Assistant name" name="brand.assistantName" value={cfg.brand.assistantName} onChange={(v) => setBrand("assistantName", v)} />
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-[13px] font-bold uppercase tracking-wide text-muted">Contact</h2>
        <div className="grid gap-4">
          <TextField label="Phone (display)" name="contact.phoneDisplay" value={cfg.contact.phoneDisplay} onChange={(v) => setContact("phoneDisplay", v)} />
          <TextField label="Phone (href)" name="contact.phoneHref" value={cfg.contact.phoneHref} onChange={(v) => setContact("phoneHref", v)} />
          <TextField label="Email" name="contact.email" value={cfg.contact.email} onChange={(v) => setContact("email", v)} />
          <TextField label="NMLS #" name="contact.nmls" value={cfg.contact.nmls} onChange={(v) => setContact("nmls", v)} />
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-[13px] font-bold uppercase tracking-wide text-muted">SEO</h2>
        <div className="grid gap-4">
          <TextField label="Default title" name="seo.titleDefault" value={cfg.seo.titleDefault} onChange={(v) => setSeo("titleDefault", v)} />
          <TextField label="Title template" name="seo.titleTemplate" value={cfg.seo.titleTemplate} onChange={(v) => setSeo("titleTemplate", v)} />
          <TextAreaField label="Description" name="seo.description" value={cfg.seo.description} onChange={(v) => setSeo("description", v)} />
          <TextField label="OG title" name="seo.ogTitle" value={cfg.seo.ogTitle} onChange={(v) => setSeo("ogTitle", v)} />
          <TextAreaField label="OG description" name="seo.ogDescription" value={cfg.seo.ogDescription} onChange={(v) => setSeo("ogDescription", v)} />
          <TextField
            label="Keywords (comma-separated)"
            name="seo.keywords"
            value={(cfg.seo.keywords ?? []).join(", ")}
            onChange={(v) => setSeo("keywords", v.split(",").map((s) => s.trim()).filter(Boolean))}
          />
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-[13px] font-bold uppercase tracking-wide text-muted">Features</h2>
        <div className="grid gap-3">
          <SwitchField label="Show family of companies" checked={cfg.features.showFamily} onChange={(v) => setFeature("showFamily", v)} />
          <SwitchField label="GHL chat" checked={cfg.features.ghlChat} onChange={(v) => setFeature("ghlChat", v)} />
          <SwitchField label="AI assistant" checked={cfg.features.aiAssistant} onChange={(v) => setFeature("aiAssistant", v)} />
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Build**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS — `/admin/config` compiles.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/config/page.tsx src/app/admin/config/ConfigEditor.tsx
git commit -m "feat(admin): config editor page + section form"
```

---

## Task 2.6: Revision history + rollback

**Files:**
- Create: `src/app/admin/config/history/page.tsx`

- [ ] **Step 1: Create the history page**

Create `src/app/admin/config/history/page.tsx`:

```tsx
import { requireRole } from "@/server/admin/access";
import { listHistory } from "@/server/cms/versioning";
import { rollbackConfigAction } from "../actions";

export default async function ConfigHistoryPage() {
  const ctx = await requireRole("EDITOR");
  const revisions = await listHistory(ctx.tenant.id, "CONFIG", "default");

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-extrabold">Config history</h1>
      <table className="mt-6 w-full text-[14px]">
        <thead>
          <tr className="border-b border-line text-left text-muted">
            <th className="py-2 font-semibold">Version</th>
            <th className="font-semibold">State</th>
            <th className="font-semibold">Saved</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {revisions.map((r) => (
            <tr key={r.id} className="border-b border-line">
              <td className="py-2 font-semibold">v{r.version}</td>
              <td>{r.state}</td>
              <td>{new Date(r.createdAt).toLocaleString()}</td>
              <td className="text-right">
                <form
                  action={async () => {
                    "use server";
                    await rollbackConfigAction(r.version);
                  }}
                >
                  <button type="submit" className="font-semibold text-spring-2 hover:underline">
                    Restore to draft
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-4 text-[13px] text-muted">
        Restoring copies that version into a new draft. Review it in the editor, then Publish.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Build + lint**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/config/history/page.tsx
git commit -m "feat(admin): config revision history + rollback"
```

---

## Task 2.7: End-to-end loop verification

**Files:** none (manual + suite).

- [ ] **Step 1: Run the full suite + build**

Run: `npm run test && npx tsc --noEmit && npm run lint && npm run build`
Expected: all PASS.

- [ ] **Step 2: Manually verify the full loop** (`npm run dev`, signed in as a bootstrap admin)

1. Visit `/admin/config`. Change **SEO → Default title** to e.g. `MSFG — DRAFT TEST`.
2. Click **Save draft** → status "Draft saved."
3. Click **Preview** (opens `/` with Draft Mode) → the browser tab shows the draft (view source: `<title>` reflects the draft title). Open `/` in a *different* browser/incognito → still the OLD published title (draft is private to you).
4. Back in the editor, click **Publish** → status "Published. Live within seconds."
5. Reload `/` in incognito → new title is live (the `configTag` entry was busted via `revalidateTag(tag, "max")`). **NOTE:** `"max"` is stale-while-revalidate — the FIRST request immediately after publish may still serve the stale cached config while it revalidates in the background; reload once more (or wait a beat) to see the new value. Expected, not a publish failure.
6. Visit `/admin/config/history` → see `v1 PUBLISHED`, `v2 PUBLISHED` (and the archived prior). Click **Restore to draft** on the older version → a new draft is created.
7. Visit `/admin/config` → the restored values are loaded as the draft. Publish to confirm rollback works.
8. Hit `/admin/preview/disable` to exit Draft Mode.

- [ ] **Step 3: Accessibility spot-check**

Tab through `/admin/config`: every field reaches its `<label>`, focus rings are visible (`focus:border-spring` / `focus-visible:ring`), Switches toggle via keyboard. Status messages use `role="status"`.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "test(admin): verify draft→preview→publish→rollback loop"
```

---

# Self-Review (completed during planning)

**Spec coverage (Phases 0–2):**
- `Editable/Revision/AdminUser/Membership/AuditLog` + migration → Task 0.1 ✓
- Versioning service (draft/publish/rollback/history) → Tasks 0.2, 0.3 ✓
- Tagged-cache reads + `revalidateTag`, replacing in-process Maps → Tasks 0.4, 0.5 ✓
- Migrate current config → published revision 1 → Task 0.6 ✓
- Draft Mode wiring → Task 0.5 (read branch) + Task 2.4 (enable/disable) ✓
- Cognito→AdminUser, Membership gating, `requireRole` → Tasks 1.2, 1.3 ✓
- Guarded `/admin` shell + dashboard → Tasks 1.4, 1.5 ✓
- Schema-driven config editor (brand/contact/seo/features) → Tasks 2.1, 2.5 ✓
- Full draft→preview→publish→rollback loop + audit → Tasks 2.3–2.7 ✓

**Known scope limits (intentional, documented above):** `theme`/`legal`/`marketing` config sections and array editors deferred within Phase 2; member-management UI, SEO tools, media, and relational-content versioning are Phases 3–5.

**Type consistency:** `requireRole`/`getAdminContext` return `AdminContext` ({user, tenant, role, isPlatformAdmin}); versioning fns share `(tenantId, kind, key, …)`; `configTag` used identically in `cache.ts`, `config.ts`, and `actions.ts`; `EditableKind` literal `"CONFIG"` + key `"default"` used everywhere. No mismatches found.

**Deployment note (out of scope, for later):** self-hosted Docker/AWS multi-instance revalidation needs a shared cache handler via the `cacheHandlers` config key (`node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/cacheHandlers.md`). On Vercel, `revalidateTag` works out of the box.
