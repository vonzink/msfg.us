# Loan Officer Data Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `LoanOfficer` table the authoritative, updatable source for the loan-officer directory and the upcoming `find_loan_officer` AI tool — migrated to the real field shape, seeded from bundled content, refreshable from the S3 roster markdown, and rendered on the public page from the DB.

**Architecture:** A pure markdown parser turns `MSFG_Loan_Officers.md` into the existing `Officer` shape. The Prisma `LoanOfficer` model is migrated to carry those fields (multi-state `licensedStates[]`, `title`, `email`, `phone`, `bio[]`, `applyUrl`). The seed writes real columns from the bundled `OFFICERS` content; an EDITOR-only admin action re-imports from S3 (parse → diff → upsert/deactivate). The public page reads the DB (falling back to bundled content when empty). All tenant writes stamp `tenantId` explicitly via `getDb()` (the tenant-scoped client bans unique-by-where ops like `upsert`).

**Tech Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Prisma 7 / Postgres · Vitest · `@aws-sdk/client-s3` (new).

---

## File Structure

| File | Responsibility |
|---|---|
| `src/server/officers/parseOfficers.ts` (new) | Pure: parse roster markdown → `Officer[]`; `slugify()` |
| `src/server/officers/parseOfficers.test.ts` (new) | Vitest for the parser |
| `prisma/schema.prisma` (modify) | `LoanOfficer` model → rich field shape |
| `prisma/seed.ts` (modify) | `seedOfficers()` writes real columns |
| `src/server/officers/map.ts` (new) | Pure `rowToOfficer()` mapper (no DB import) |
| `src/server/officers/map.test.ts` (new) | Vitest for the mapper |
| `src/server/officers/officers.ts` (new) | `listOfficers()` tenant-scoped query |
| `src/app/(marketing)/loan-officers/page.tsx` (modify) | Fetch officers from DB, pass to directory |
| `src/components/officers/OfficerDirectory.tsx` (modify) | Accept `officers` prop instead of importing content |
| `src/server/officers/sync.ts` (new) | Pure: `planOfficerSync()` (upsert/deactivate diff) |
| `src/server/officers/sync.test.ts` (new) | Vitest for the sync planner |
| `src/server/officers/s3.ts` (new) | Fetch roster markdown text from S3 |
| `src/app/admin/officers/actions.ts` (new) | `importOfficersFromS3Action()` (EDITOR) |
| `src/app/admin/officers/page.tsx` (new) | Admin trigger UI |
| `next.config.ts` (modify) | Allow the remote headshot image host |
| `package.json` (modify) | Add `@aws-sdk/client-s3` |

Reference: the source roster lives at `s3://msfg.us/rag-brain/MSFG_Loan_Officers.md` (bucket region **us-west-1**) and is already transcribed into `src/content/officers.ts` (`OFFICERS: Officer[]`, 15 officers, type `Officer` = `{ slug, name, title, nmls, email, phone, states[], photo, bio[], applyHref }`).

---

### Task 1: Markdown roster parser

**Files:**
- Create: `src/server/officers/parseOfficers.ts`
- Test: `src/server/officers/parseOfficers.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/server/officers/parseOfficers.test.ts
import { describe, it, expect } from "vitest";
import { parseOfficerMarkdown, slugify } from "./parseOfficers";

const SAMPLE = `# Mountain State Financial Group, LLC — Loan Officers

Company NMLS: 1314257

---

## Robert Hoff, CFA
**Title:** President
**NMLS:** 608235
**Email:** robert.hoff@msfg.us
**Phone:** (720) 838-1246
**Licensed:** CO, ND

![Robert Hoff](https://images.example.com/rh.jpeg)

**Bio:**
First paragraph here.

Second paragraph here.

**Apply Now:** https://www.blink.mortgage/app/signup/p/x

---

## Sandra Simental
**Title:** Mortgage Broker
**NMLS:** 283846
**Email:** sandra.simental@msfg.us
**Phone:** (720) 290-8826
**Licensed:** CO

![Sandra Simental](https://images.example.com/ss.jpeg)

**Bio:**
_No bio available on the website (no individual profile page)._

**Apply Now:** https://www.blink.mortgage/app/signup/p/y
`;

describe("slugify", () => {
  it("drops credential suffix and hyphenates", () => {
    expect(slugify("Robert Hoff, CFA")).toBe("robert-hoff");
  });
});

describe("parseOfficerMarkdown", () => {
  const officers = parseOfficerMarkdown(SAMPLE);

  it("parses one entry per H2 officer block (ignores the H1 title)", () => {
    expect(officers).toHaveLength(2);
    expect(officers.map((o) => o.nmls)).toEqual(["608235", "283846"]);
  });

  it("extracts all scalar fields", () => {
    const o = officers[0];
    expect(o).toMatchObject({
      slug: "robert-hoff",
      name: "Robert Hoff, CFA",
      title: "President",
      nmls: "608235",
      email: "robert.hoff@msfg.us",
      phone: "(720) 838-1246",
      photo: "https://images.example.com/rh.jpeg",
      applyHref: "https://www.blink.mortgage/app/signup/p/x",
    });
  });

  it("splits Licensed into an uppercase states array", () => {
    expect(officers[0].states).toEqual(["CO", "ND"]);
  });

  it("collects bio paragraphs, dropping the 'no bio' placeholder", () => {
    expect(officers[0].bio).toEqual(["First paragraph here.", "Second paragraph here."]);
    expect(officers[1].bio).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/server/officers/parseOfficers.test.ts`
Expected: FAIL — "Cannot find module './parseOfficers'".

- [ ] **Step 3: Write the parser**

```typescript
// src/server/officers/parseOfficers.ts
import type { Officer } from "@/content/officers";

/** Slug from a display name: drop credential suffix, hyphenate. */
export function slugify(name: string): string {
  return name
    .split(",")[0]
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function field(label: string, block: string): string | null {
  const m = block.match(new RegExp(`\\*\\*${label}:\\*\\*\\s*(.+)`));
  return m ? m[1].trim() : null;
}

/**
 * Parse the MSFG roster markdown into Officer records. Officer blocks are H2
 * sections (`## Name`); the H1 title and any preamble are ignored. A block
 * without an NMLS line is skipped (defensive against stray sections).
 */
export function parseOfficerMarkdown(md: string): Officer[] {
  const blocks = md.split(/\n##\s+/).slice(1);
  const officers: Officer[] = [];
  for (const raw of blocks) {
    const block = raw.trim();
    const name = block.split("\n")[0].trim();
    const nmls = field("NMLS", block);
    if (!name || !nmls) continue;

    const states = (field("Licensed", block) ?? "")
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

    const photo = block.match(/!\[[^\]]*\]\(([^)]+)\)/);

    let bio: string[] = [];
    const bioStart = block.indexOf("**Bio:**");
    if (bioStart !== -1) {
      const after = block.slice(bioStart + "**Bio:**".length);
      const end = after.indexOf("**Apply Now:**");
      bio = (end === -1 ? after : after.slice(0, end))
        .split(/\n\s*\n/)
        .map((p) => p.replace(/\s+/g, " ").trim())
        .filter((p) => p && !/^_no bio/i.test(p));
    }

    officers.push({
      slug: slugify(name),
      name,
      title: field("Title", block) ?? "",
      nmls,
      email: field("Email", block) ?? "",
      phone: field("Phone", block) ?? "",
      states,
      photo: photo ? photo[1].trim() : "",
      bio,
      applyHref: field("Apply Now", block) ?? "",
    });
  }
  return officers;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/server/officers/parseOfficers.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/officers/parseOfficers.ts src/server/officers/parseOfficers.test.ts
git commit -m "feat(officers): add roster markdown parser"
```

---

### Task 2: Migrate the `LoanOfficer` model to the real field shape

**Files:**
- Modify: `prisma/schema.prisma` (model `LoanOfficer`)

- [ ] **Step 1: Replace the `LoanOfficer` model**

Replace the existing `model LoanOfficer { ... }` block with:

```prisma
/// A licensed loan officer shown in the /loan-officers directory and surfaced
/// to the AI assistant via the find_loan_officer tool.
model LoanOfficer {
  id             String   @id @default(cuid())
  tenantId       String
  name           String
  title          String?
  nmls           String
  email          String?
  phone          String?
  city           String?
  state          String?
  licensedStates String[] @default([])
  bio            String[] @default([])
  photoUrl       String?
  applyUrl       String?
  scheduleUrl    String?
  ghlContactId   String?
  sortOrder      Int      @default(0)
  active         Boolean  @default(true)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@unique([tenantId, nmls])
  @@index([tenantId])
  @@map("loan_officers")
}
```

(Changes: add `title`, `email`, `phone`, `licensedStates[]`, `bio[]`, `applyUrl`; relax `city`/`state` to optional; drop the unused `languages`, `specialties`, `ratingAvg`, `ratingCount`.)

- [ ] **Step 2: Create and apply the migration**

Run: `npx prisma migrate dev --name loan_officer_rich_fields`
Expected: Prisma warns about dropped columns (placeholder data only), then "migration applied" and `prisma generate` runs. The new `LoanOfficer` type includes `licensedStates: string[]`, `bio: string[]`, `title/email/phone/applyUrl`.

- [ ] **Step 3: Verify the client compiles against the new shape**

Run: `npx tsc --noEmit`
Expected: `prisma/seed.ts` now FAILS to typecheck (it still sets `languages`/`specialties`/`ratingAvg`). That is expected — fixed in Task 3.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(officers): migrate LoanOfficer to rich field shape"
```

---

### Task 3: Seed real officer columns from bundled content

**Files:**
- Modify: `prisma/seed.ts` (function `seedOfficers`)

- [ ] **Step 1: Replace the `seedOfficers` function body**

Replace the entire `async function seedOfficers() { ... }` (including its leading `// NOTE` comment) with:

```typescript
async function seedOfficers() {
  let i = 0;
  for (const o of OFFICERS) {
    const fields = {
      name: o.name,
      title: o.title,
      email: o.email,
      phone: o.phone,
      state: o.states[0] ?? null,
      licensedStates: o.states,
      bio: o.bio,
      photoUrl: o.photo,
      applyUrl: o.applyHref,
      sortOrder: i,
      active: true,
    };
    await prisma.loanOfficer.upsert({
      where: { tenantId_nmls: { tenantId: TENANT_ID, nmls: o.nmls } },
      update: fields,
      create: { tenantId: TENANT_ID, nmls: o.nmls, ...fields },
    });
    i++;
  }
  return OFFICERS.length;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (the seed now matches the migrated model).

- [ ] **Step 3: Run the seed against the dev DB**

Run: `npm run db:seed`
Expected: completes without error; logs the officer count (15).

- [ ] **Step 4: Verify rows landed with multi-state data**

Run:
```bash
npx prisma studio
```
Expected: open `loan_officers` — Seth Angell has `licensedStates = [CO, IN, MI, MN, ND]`, `title = "Executive VP"`, `applyUrl` populated. (Close Studio when done.)

- [ ] **Step 5: Commit**

```bash
git add prisma/seed.ts
git commit -m "feat(officers): seed real officer columns from content"
```

---

### Task 4: `Officer` mapper (pure) + DB query

**Files:**
- Create: `src/server/officers/map.ts`
- Test: `src/server/officers/map.test.ts`
- Create: `src/server/officers/officers.ts`

> The mapper lives in its own DB-free module so the unit test never imports `@/lib/db` (which needs `DATABASE_URL` at load time).

- [ ] **Step 1: Write the failing test (mapper is pure)**

```typescript
// src/server/officers/map.test.ts
import { describe, it, expect } from "vitest";
import { rowToOfficer } from "./map";

describe("rowToOfficer", () => {
  it("maps a DB row to the Officer shape, defaulting nullables", () => {
    const officer = rowToOfficer({
      name: "Tanya Long",
      title: "Licensed Mortgage Broker",
      nmls: "1634834",
      email: "tanya.long@msfg.us",
      phone: "(701) 471-1687",
      licensedStates: ["CO", "MI", "MN", "ND", "SD", "TX"],
      bio: ["Para one."],
      photoUrl: "https://img/tl.jpeg",
      applyUrl: "https://apply/tl",
    });
    expect(officer).toEqual({
      slug: "tanya-long",
      name: "Tanya Long",
      title: "Licensed Mortgage Broker",
      nmls: "1634834",
      email: "tanya.long@msfg.us",
      phone: "(701) 471-1687",
      states: ["CO", "MI", "MN", "ND", "SD", "TX"],
      photo: "https://img/tl.jpeg",
      bio: ["Para one."],
      applyHref: "https://apply/tl",
    });
  });

  it("coerces null scalars to empty strings", () => {
    const o = rowToOfficer({
      name: "No Bio", title: null, nmls: "1", email: null, phone: null,
      licensedStates: [], bio: [], photoUrl: null, applyUrl: null,
    });
    expect(o.title).toBe("");
    expect(o.photo).toBe("");
    expect(o.applyHref).toBe("");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/server/officers/map.test.ts`
Expected: FAIL — "Cannot find module './map'".

- [ ] **Step 3: Write the pure mapper**

```typescript
// src/server/officers/map.ts
import type { Officer } from "@/content/officers";
import { slugify } from "@/server/officers/parseOfficers";

/** The subset of LoanOfficer columns the directory needs. */
export type OfficerRow = {
  name: string;
  title: string | null;
  nmls: string;
  email: string | null;
  phone: string | null;
  licensedStates: string[];
  bio: string[];
  photoUrl: string | null;
  applyUrl: string | null;
};

export function rowToOfficer(row: OfficerRow): Officer {
  return {
    slug: slugify(row.name),
    name: row.name,
    title: row.title ?? "",
    nmls: row.nmls,
    email: row.email ?? "",
    phone: row.phone ?? "",
    states: row.licensedStates,
    photo: row.photoUrl ?? "",
    bio: row.bio,
    applyHref: row.applyUrl ?? "",
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/server/officers/map.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the tenant-scoped query**

```typescript
// src/server/officers/officers.ts
import "server-only";
import { getTenantDb } from "@/lib/db";
import { OFFICERS, type Officer } from "@/content/officers";
import { rowToOfficer } from "@/server/officers/map";

/**
 * Active officers for the current tenant, ordered by sortOrder. Falls back to
 * the bundled OFFICERS content when the table is empty (fresh/un-seeded env),
 * so the public page never renders blank.
 */
export async function listOfficers(): Promise<Officer[]> {
  const db = await getTenantDb();
  const rows = await db.loanOfficer.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
  });
  return rows.length === 0 ? OFFICERS : rows.map(rowToOfficer);
}
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/server/officers/map.ts src/server/officers/map.test.ts src/server/officers/officers.ts
git commit -m "feat(officers): add Officer mapper and tenant-scoped query"
```

---

### Task 5: Render the public directory from the DB

**Files:**
- Modify: `src/components/officers/OfficerDirectory.tsx`
- Modify: `src/app/(marketing)/loan-officers/page.tsx`

- [ ] **Step 1: Make `OfficerDirectory` take officers as a prop**

In `src/components/officers/OfficerDirectory.tsx`:

Change the import line
```typescript
import { OFFICERS, officerStates, type Officer } from "@/content/officers";
```
to
```typescript
import { officerStates, type Officer } from "@/content/officers";
```

Change the component signature
```typescript
export function OfficerDirectory() {
```
to
```typescript
export function OfficerDirectory({ officers }: { officers: Officer[] }) {
```

Change the filter memo (replace both `OFFICERS` references with `officers`, and add `officers` to the dependency array):
```typescript
  const filtered = useMemo<Officer[]>(
    () =>
      stateFilter === ALL
        ? officers
        : officers.filter((o) => o.states.includes(stateFilter)),
    [stateFilter, officers],
  );
```

(`officerStates()` for the dropdown is unchanged — it lists the firm's licensed states.)

- [ ] **Step 2: Fetch officers in the page and pass them down**

In `src/app/(marketing)/loan-officers/page.tsx`, add the import:
```typescript
import { listOfficers } from "@/server/officers/officers";
```
Make the component await the officers and pass them to the directory:
```typescript
export default async function LoanOfficersPage() {
  const config = await getTenantConfig();
  const officers = await listOfficers();
  // ...existing hero/markup unchanged...
  // replace <OfficerDirectory /> with:
  //   <OfficerDirectory officers={officers} />
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS. (If `config` becomes unused, keep it — it is used by the existing markup.)

- [ ] **Step 4: Verify the page renders from the DB**

Start the dev server and load `/loan-officers`. Confirm the 15 officers render and the state filter (e.g. TX) narrows to TX-licensed officers (Kimberly Thomas, Tanya Long). Headshots from the DB seed use local `/officers/*.webp`.

- [ ] **Step 5: Commit**

```bash
git add src/components/officers/OfficerDirectory.tsx src/app/(marketing)/loan-officers/page.tsx
git commit -m "feat(officers): render directory from the database"
```

---

### Task 6: S3 fetch + sync planner

**Files:**
- Modify: `package.json` (add dependency)
- Create: `src/server/officers/s3.ts`
- Create: `src/server/officers/sync.ts`
- Test: `src/server/officers/sync.test.ts`

- [ ] **Step 1: Add the AWS S3 client**

Run: `npm install @aws-sdk/client-s3`
Expected: dependency added to `package.json`.

- [ ] **Step 2: Write the failing test for the sync planner**

```typescript
// src/server/officers/sync.test.ts
import { describe, it, expect } from "vitest";
import { planOfficerSync } from "./sync";
import type { Officer } from "@/content/officers";

const mk = (nmls: string, states: string[] = ["CO"]): Officer => ({
  slug: "x", name: "X " + nmls, title: "Broker", nmls,
  email: "", phone: "", states, photo: "", bio: [], applyHref: "",
});

describe("planOfficerSync", () => {
  it("upserts every parsed officer with sortOrder by position", () => {
    const plan = planOfficerSync([mk("1"), mk("2")], []);
    expect(plan.upserts.map((u) => u.nmls)).toEqual(["1", "2"]);
    expect(plan.upserts[1].data.sortOrder).toBe(1);
    expect(plan.upserts[0].data.active).toBe(true);
    expect(plan.deactivateNmls).toEqual([]);
  });

  it("deactivates existing officers absent from the parsed roster", () => {
    const plan = planOfficerSync([mk("1")], ["1", "9"]);
    expect(plan.deactivateNmls).toEqual(["9"]);
  });

  it("maps states to licensedStates + primary state", () => {
    const plan = planOfficerSync([mk("1", ["TX", "CO"])], []);
    expect(plan.upserts[0].data.licensedStates).toEqual(["TX", "CO"]);
    expect(plan.upserts[0].data.state).toBe("TX");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/server/officers/sync.test.ts`
Expected: FAIL — "Cannot find module './sync'".

- [ ] **Step 4: Write the sync planner**

```typescript
// src/server/officers/sync.ts
import type { Officer } from "@/content/officers";

export type OfficerWrite = {
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  state: string | null;
  licensedStates: string[];
  bio: string[];
  photoUrl: string | null;
  applyUrl: string | null;
  sortOrder: number;
  active: true;
};
export type OfficerUpsert = { nmls: string; data: OfficerWrite };
export type OfficerSyncPlan = { upserts: OfficerUpsert[]; deactivateNmls: string[] };

/**
 * Diff a freshly parsed roster against the NMLS ids already in the table.
 * Pure — the caller performs the writes. Officers in the table but not in the
 * roster are deactivated (not deleted), preserving history + audit.
 */
export function planOfficerSync(parsed: Officer[], existingNmls: string[]): OfficerSyncPlan {
  const seen = new Set<string>();
  const upserts = parsed.map((o, i) => {
    seen.add(o.nmls);
    return {
      nmls: o.nmls,
      data: {
        name: o.name,
        title: o.title || null,
        email: o.email || null,
        phone: o.phone || null,
        state: o.states[0] ?? null,
        licensedStates: o.states,
        bio: o.bio,
        photoUrl: o.photo || null,
        applyUrl: o.applyHref || null,
        sortOrder: i,
        active: true as const,
      },
    };
  });
  const deactivateNmls = existingNmls.filter((n) => !seen.has(n));
  return { upserts, deactivateNmls };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/server/officers/sync.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Write the S3 fetch helper**

```typescript
// src/server/officers/s3.ts
import "server-only";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

const BUCKET = process.env.OFFICERS_S3_BUCKET ?? "msfg.us";
const KEY = process.env.OFFICERS_S3_KEY ?? "rag-brain/MSFG_Loan_Officers.md";
const REGION = process.env.OFFICERS_S3_REGION ?? "us-west-1";

/** Read the roster markdown from S3. AWS creds come from the default chain. */
export async function fetchOfficersMarkdown(): Promise<string> {
  const s3 = new S3Client({ region: REGION });
  const out = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: KEY }));
  if (!out.Body) throw new Error(`Empty S3 object: ${BUCKET}/${KEY}`);
  return out.Body.transformToString();
}
```

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/server/officers/s3.ts src/server/officers/sync.ts src/server/officers/sync.test.ts
git commit -m "feat(officers): add S3 fetch and roster sync planner"
```

---

### Task 7: Admin re-import action + page

**Files:**
- Create: `src/app/admin/officers/actions.ts`
- Create: `src/app/admin/officers/page.tsx`
- Modify: `next.config.ts` (remote headshot host)

- [ ] **Step 1: Write the import server action**

```typescript
// src/app/admin/officers/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/server/admin/access";
import { getDb } from "@/lib/db";
import { fetchOfficersMarkdown } from "@/server/officers/s3";
import { parseOfficerMarkdown } from "@/server/officers/parseOfficers";
import { planOfficerSync } from "@/server/officers/sync";

/**
 * Re-import the loan-officer roster from S3 markdown. EDITOR-gated. Writes use
 * getDb() with an explicit tenantId — the tenant-scoped client bans upsert
 * (unique-by-where) to prevent cross-tenant leakage.
 */
export async function importOfficersFromS3Action() {
  const ctx = await requireRole("EDITOR");
  const parsed = parseOfficerMarkdown(await fetchOfficersMarkdown());
  if (parsed.length === 0) throw new Error("No officers parsed from the S3 roster.");

  const db = getDb();
  const existing = await db.loanOfficer.findMany({
    where: { tenantId: ctx.tenant.id },
    select: { nmls: true },
  });
  const plan = planOfficerSync(parsed, existing.map((e) => e.nmls));

  for (const up of plan.upserts) {
    await db.loanOfficer.upsert({
      where: { tenantId_nmls: { tenantId: ctx.tenant.id, nmls: up.nmls } },
      update: up.data,
      create: { tenantId: ctx.tenant.id, nmls: up.nmls, ...up.data },
    });
  }
  if (plan.deactivateNmls.length > 0) {
    await db.loanOfficer.updateMany({
      where: { tenantId: ctx.tenant.id, nmls: { in: plan.deactivateNmls } },
      data: { active: false },
    });
  }

  await db.auditLog.create({
    data: { tenantId: ctx.tenant.id, userId: ctx.user.id, action: "officers.import_s3" },
  });
  revalidatePath("/loan-officers");
  return {
    ok: true as const,
    imported: plan.upserts.length,
    deactivated: plan.deactivateNmls.length,
  };
}
```

- [ ] **Step 2: Write the admin page**

```tsx
// src/app/admin/officers/page.tsx
import { requireRole } from "@/server/admin/access";
import { getDb } from "@/lib/db";
import { importOfficersFromS3Action } from "./actions";

export default async function AdminOfficersPage() {
  const ctx = await requireRole("EDITOR");
  const count = await getDb().loanOfficer.count({
    where: { tenantId: ctx.tenant.id, active: true },
  });

  return (
    <div className="wrap" style={{ paddingBlock: "2rem" }}>
      <h1>Loan officers</h1>
      <p>{count} active officer(s). Re-import from the S3 roster after editing it.</p>
      <form action={importOfficersFromS3Action}>
        <button type="submit" className="press-3d">Import from S3</button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Allow the remote headshot host**

In `next.config.ts`, add the roster's image host to `images.remotePatterns` (create the `images` block if absent):
```typescript
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.leadconnectorhq.com" },
    ],
  },
```

- [ ] **Step 4: Typecheck + tests**

Run: `npx tsc --noEmit && npx vitest run src/server/officers`
Expected: PASS (typecheck clean; parser + mapper + sync tests green).

- [ ] **Step 5: Verify the import end-to-end (local)**

With AWS creds available and the dev server running, sign in as an EDITOR, open `/admin/officers`, click **Import from S3**. Expected: the action returns `{ imported: 15, deactivated: 0 }` and `/loan-officers` reflects the roster (remote headshots now load).

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/officers next.config.ts
git commit -m "feat(officers): admin S3 re-import action and page"
```

---

## Notes / follow-ups (out of scope for 1A)

- `find_loan_officer` AI tool (slice 1C) reads this same table — no further data work needed.
- Officer `specialties`/`languages` were dropped; if surfaced later, enrich from bios or a manifest.
- Production deploy needs `OFFICERS_S3_BUCKET`/`KEY`/`REGION` (defaults provided) and AWS read creds in the runtime environment for the import action.
- `src/content/officers.ts` remains the bundled seed/fallback; S3 is the live-edit source. If they drift, re-run the seed or the admin import to reconcile.
