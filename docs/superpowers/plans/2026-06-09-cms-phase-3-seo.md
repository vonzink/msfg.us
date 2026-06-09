# CMS Phase 3 — Per-Page SEO Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins override SEO per route (title/description/OG/canonical/robots/JSON-LD + sitemap inclusion/priority/changefreq) through the existing `/admin` CMS, merged over the global `config.seo` defaults and reflected in the live pages, sitemap, and structured data.

**Architecture:** Reuses the CMS versioning engine (`Editable`/`Revision`, `PAGE_SEO` kind keyed by route path) and the Phase 2 config-editor pattern (server page + client editor + server actions + history, `requireRole("EDITOR")`, `revalidateCmsTag` on publish). A new `getPageSeo(path)` reader (draft-aware, per-path tagged cache) feeds a pure `buildMetadata(path)` merge that each marketing route's `generateMetadata` calls; the sitemap joins the code route registry with per-route SEO settings; a `<PageJsonLd>` server component renders per-page structured data. **No DB migration** — `PAGE_SEO` enum + the Editable/Revision tables already exist; cache tags are code.

**Tech Stack:** Next.js 16 App Router, TypeScript, Zod, Prisma 7, Vitest. Spec: `docs/superpowers/specs/2026-06-05-cms-seo-management-design.md` (Phase 3).

**Out of scope (Phase 3b, separate plan):** **Redirects** (`REDIRECTS` editable + middleware enforcement) — deferred because middleware runs in the Edge runtime where Prisma/`unstable_cache` are unavailable; it needs a cached-internal-endpoint or Node-runtime-middleware design of its own. Also out: media (Phase 4) and relational content (Phase 5).

**Conventions:** `npx tsc --noEmit` + `npx vitest run <file>` per task. Do NOT run `npm run build` per-task. Commit after each task. Mirror the live Phase 2 files under `src/app/admin/config/` — the implementer should read them as the template.

---

### Task 1: PageSeo schema + cache tags

**Files:**
- Create: `src/server/cms/seo.ts`
- Modify: `src/server/cms/cache.ts`
- Test: `src/server/cms/seo.test.ts`

- [ ] **Step 1: Write the failing test** — create `src/server/cms/seo.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { PageSeoSchema, parsePageSeo, type PageSeo } from "./seo";
import { seoTag } from "./cache";

describe("PageSeoSchema / parsePageSeo", () => {
  it("treats every field as optional (empty object is valid)", () => {
    expect(parsePageSeo({})).toEqual({ include: true });
  });

  it("parses a full page-seo object", () => {
    const raw = {
      title: "Buy a Home",
      description: "Purchase mortgages.",
      canonical: "https://msfg.us/buy",
      ogTitle: "Buy",
      ogDescription: "Purchase",
      ogImage: "/og/buy.png",
      robots: "noindex,follow",
      jsonLd: { "@type": "WebPage", name: "Buy" },
      include: false,
      priority: 0.9,
      changefreq: "weekly",
    };
    const p: PageSeo = parsePageSeo(raw);
    expect(p.title).toBe("Buy a Home");
    expect(p.robots).toBe("noindex,follow");
    expect(p.jsonLd).toEqual({ "@type": "WebPage", name: "Buy" });
    expect(p.include).toBe(false);
    expect(p.priority).toBe(0.9);
    expect(p.changefreq).toBe("weekly");
  });

  it("defaults include to true and drops unknown fields", () => {
    const p = parsePageSeo({ title: "X", bogus: 1 });
    expect(p.include).toBe(true);
    expect((p as Record<string, unknown>).bogus).toBeUndefined();
  });

  it("falls back to {include:true} on a non-object / invalid input", () => {
    expect(parsePageSeo(null)).toEqual({ include: true });
    expect(parsePageSeo({ priority: "high" })).toEqual({ include: true });
  });
});

describe("seoTag", () => {
  it("is per-tenant + per-path", () => {
    expect(seoTag("tenant_msfg", "/buy")).toBe("t:tenant_msfg:seo:/buy");
  });
});
```

- [ ] **Step 2: Run it, verify FAIL** — `npx vitest run src/server/cms/seo.test.ts` (module not found).

- [ ] **Step 3: Add the cache tag** — in `src/server/cms/cache.ts`, add after `configTag`:

```ts
/** Cache tag for a tenant's per-path SEO overrides. */
export function seoTag(tenantId: string, path: string): string {
  return `t:${tenantId}:seo:${path}`;
}
```

- [ ] **Step 4: Implement the schema** — create `src/server/cms/seo.ts`:

```ts
import "server-only";
import { z } from "zod";

/**
 * Per-page SEO overrides (PAGE_SEO editable, keyed by route path). Every field is
 * optional; an admin sets only what should differ from the global config.seo
 * defaults. `include`/`priority`/`changefreq` drive the sitemap.
 */
export const PageSeoSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  canonical: z.string().optional(),
  ogTitle: z.string().optional(),
  ogDescription: z.string().optional(),
  ogImage: z.string().optional(),
  /** Raw robots directive, e.g. "noindex,follow". Omitted => inherit global. */
  robots: z.string().optional(),
  /** Arbitrary JSON-LD object rendered as <script type="application/ld+json">. */
  jsonLd: z.record(z.string(), z.unknown()).optional(),
  /** Sitemap inclusion (default true). */
  include: z.boolean().default(true),
  priority: z.number().min(0).max(1).optional(),
  changefreq: z
    .enum(["always", "hourly", "daily", "weekly", "monthly", "yearly", "never"])
    .optional(),
});

export type PageSeo = z.infer<typeof PageSeoSchema>;

/** Parse raw PAGE_SEO revision data, falling back to a safe default. */
export function parsePageSeo(raw: unknown): PageSeo {
  const result = PageSeoSchema.safeParse(raw ?? {});
  return result.success ? result.data : { include: true };
}
```

- [ ] **Step 5: Run tests + typecheck** — `npx vitest run src/server/cms/seo.test.ts` (PASS), `npx tsc --noEmit` (clean).

- [ ] **Step 6: Commit**

```bash
git add src/server/cms/seo.ts src/server/cms/seo.test.ts src/server/cms/cache.ts
git commit -m "feat(seo): PageSeo schema + parse + per-path cache tag"
```

---

### Task 2: getPageSeo reader (draft-aware, cached)

**Files:**
- Modify: `src/server/cms/seo.ts`
- Test: `src/server/cms/seo.reader.test.ts`

Mirrors `getTenantConfig` in `src/server/tenant/config.ts`: published data via `unstable_cache` tagged `seoTag`, with a Draft-Mode branch read OUTSIDE the cache so static generation stays deterministic.

- [ ] **Step 1: Write the failing test** — create `src/server/cms/seo.reader.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const getPublishedData = vi.fn();
const getDraftData = vi.fn();
vi.mock("./versioning", () => ({
  getPublishedData: (...a: unknown[]) => getPublishedData(...a),
  getDraftData: (...a: unknown[]) => getDraftData(...a),
}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: () => unknown) => fn }));
vi.mock("next/headers", () => ({ draftMode: async () => ({ isEnabled: false }) }));
vi.mock("@/server/tenant/resolve", () => ({ getTenant: async () => ({ id: "tenant_msfg" }) }));

import { getPageSeo } from "./seo";

beforeEach(() => vi.clearAllMocks());

describe("getPageSeo", () => {
  it("returns parsed published page-seo for the path", async () => {
    getPublishedData.mockResolvedValue({ title: "Buy", priority: 0.9 });
    const seo = await getPageSeo("/buy");
    expect(seo.title).toBe("Buy");
    expect(seo.include).toBe(true);
    expect(getPublishedData).toHaveBeenCalledWith("tenant_msfg", "PAGE_SEO", "/buy");
  });

  it("returns the safe default when no revision exists", async () => {
    getPublishedData.mockResolvedValue(null);
    expect(await getPageSeo("/buy")).toEqual({ include: true });
  });
});
```

- [ ] **Step 2: Run it, verify FAIL** — `npx vitest run src/server/cms/seo.reader.test.ts`.

- [ ] **Step 3: Implement the reader** — append to `src/server/cms/seo.ts`:

```ts
import { unstable_cache } from "next/cache";
import { draftMode } from "next/headers";
import { getTenant } from "@/server/tenant/resolve";
import { getPublishedData, getDraftData } from "./versioning";
import { seoTag } from "./cache";

function publishedSeoReader(tenantId: string, path: string) {
  return unstable_cache(
    async () => parsePageSeo(await getPublishedData(tenantId, "PAGE_SEO", path)),
    ["page-seo", tenantId, path],
    { tags: [seoTag(tenantId, path)] },
  );
}

/** Resolve a route's SEO overrides. Draft-Mode editors see the working draft. */
export async function getPageSeo(path: string): Promise<PageSeo> {
  const tenant = await getTenant();

  let isDraft = false;
  try {
    isDraft = (await draftMode()).isEnabled;
  } catch {
    isDraft = false; // outside a request scope (e.g. sitemap build, unit tests)
  }
  if (isDraft) {
    const draft = await getDraftData(tenant.id, "PAGE_SEO", path);
    if (draft != null) return parsePageSeo(draft);
  }

  return publishedSeoReader(tenant.id, path)();
}
```

Note: `parsePageSeo` is already imported in-file (Task 1). Keep the `import "server-only"` at the top.

- [ ] **Step 4: Run tests + typecheck** — `npx vitest run src/server/cms/seo.reader.test.ts` (PASS), `npx tsc --noEmit` (clean).

- [ ] **Step 5: Commit**

```bash
git add src/server/cms/seo.ts src/server/cms/seo.reader.test.ts
git commit -m "feat(seo): getPageSeo reader (draft-aware, per-path tagged cache)"
```

---

### Task 3: buildMetadata merge (pure core + async wrapper)

**Files:**
- Create: `src/lib/seo/buildMetadata.ts`
- Test: `src/lib/seo/buildMetadata.test.ts`

The pure `mergePageMetadata` is unit-tested; `buildMetadata` wraps it with the async config/origin/page-seo reads. Read `src/app/layout.tsx`'s `generateMetadata` first so the base mirrors it.

- [ ] **Step 1: Write the failing test** — create `src/lib/seo/buildMetadata.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mergePageMetadata } from "./buildMetadata";
import { DEFAULT_TENANT_CONFIG } from "@/content/site";

const origin = "https://msfg.us";
const cfg = DEFAULT_TENANT_CONFIG;

describe("mergePageMetadata", () => {
  it("uses global config.seo when the page has no overrides", () => {
    const m = mergePageMetadata(cfg, { include: true }, origin, true);
    expect(m.description).toBe(cfg.seo.description);
    expect(m.title).toBe(cfg.seo.titleDefault);
    expect(m.robots).toEqual({ index: true, follow: true });
  });

  it("overrides title/description/canonical/og from the page", () => {
    const m = mergePageMetadata(
      cfg,
      { include: true, title: "Buy a Home", description: "Purchase loans.", canonical: "/buy", ogTitle: "Buy" },
      origin,
      true,
    );
    expect(m.title).toBe("Buy a Home");
    expect(m.description).toBe("Purchase loans.");
    expect(m.alternates).toEqual({ canonical: "/buy" });
    expect((m.openGraph as { title?: string }).title).toBe("Buy");
  });

  it("honors a per-page robots override (noindex)", () => {
    const m = mergePageMetadata(cfg, { include: true, robots: "noindex,follow" }, origin, true);
    expect(m.robots).toEqual({ index: false, follow: true });
  });

  it("forces noindex in non-prod regardless of page robots", () => {
    const m = mergePageMetadata(cfg, { include: true, robots: "index,follow" }, origin, false);
    expect(m.robots).toEqual({ index: false, follow: false });
  });
});
```

- [ ] **Step 2: Run it, verify FAIL** — `npx vitest run src/lib/seo/buildMetadata.test.ts`.

- [ ] **Step 3: Implement** — create `src/lib/seo/buildMetadata.ts`:

```ts
import "server-only";
import type { Metadata } from "next";
import type { TenantConfig } from "@/content/site";
import { getTenantConfig, getTenantOrigin } from "@/server/tenant/config";
import { getPageSeo, type PageSeo } from "@/server/cms/seo";
import { serverEnv } from "@/lib/env";

/** Parse a raw robots string ("noindex,follow") into Next's robots object. */
function parseRobots(robots: string): { index: boolean; follow: boolean } {
  const t = robots.toLowerCase();
  return { index: !t.includes("noindex"), follow: !t.includes("nofollow") };
}

/**
 * Pure merge: global config.seo defaults <- per-page overrides. `isProd` gates
 * indexability (staging/dev is always noindex, like the root layout).
 */
export function mergePageMetadata(
  config: TenantConfig,
  page: PageSeo,
  origin: string,
  isProd: boolean,
): Metadata {
  const { seo, brand } = config;
  const title = page.title ?? seo.titleDefault;
  const description = page.description ?? seo.description;

  const robots = isProd
    ? page.robots
      ? parseRobots(page.robots)
      : { index: true, follow: true }
    : { index: false, follow: false };

  const meta: Metadata = {
    metadataBase: new URL(origin),
    title,
    description,
    applicationName: brand.shortName,
    robots,
    openGraph: {
      title: page.ogTitle ?? seo.ogTitle,
      description: page.ogDescription ?? seo.ogDescription,
      siteName: seo.siteName,
      type: "website",
      ...(page.ogImage ?? seo.ogImage ? { images: [page.ogImage ?? seo.ogImage!] } : {}),
    },
  };
  if (page.canonical) meta.alternates = { canonical: page.canonical };
  return meta;
}

/** Resolve the full Metadata for a route: config.seo defaults merged with the
 *  route's PAGE_SEO overrides. Call from a route's `generateMetadata`. */
export async function buildMetadata(path: string): Promise<Metadata> {
  const [config, origin, page] = await Promise.all([
    getTenantConfig(),
    getTenantOrigin(),
    getPageSeo(path),
  ]);
  const isProd = serverEnv.NEXT_PUBLIC_SITE_ENV === "production";
  return mergePageMetadata(config, page, origin, isProd);
}
```

Note: confirm `serverEnv.NEXT_PUBLIC_SITE_ENV` is the env accessor the root layout uses (the explore report shows `process.env.NEXT_PUBLIC_SITE_ENV`). If `serverEnv` doesn't expose it, use `process.env.NEXT_PUBLIC_SITE_ENV === "production"` to match `layout.tsx` exactly.

- [ ] **Step 4: Run tests + typecheck** — `npx vitest run src/lib/seo/buildMetadata.test.ts` (PASS), `npx tsc --noEmit` (clean).

- [ ] **Step 5: Commit**

```bash
git add src/lib/seo/buildMetadata.ts src/lib/seo/buildMetadata.test.ts
git commit -m "feat(seo): buildMetadata(path) — config.seo defaults merged with PAGE_SEO"
```

---

### Task 4: Wire buildMetadata into the marketing routes

**Files (modify each — add/replace `generateMetadata`):**
- `src/app/(marketing)/page.tsx` (home, path `/`)
- `src/app/(marketing)/buy/page.tsx` (`/buy`)
- `src/app/(marketing)/refinance/page.tsx` (`/refinance`)
- `src/app/(marketing)/home-equity/page.tsx` (`/home-equity`)
- `src/app/(marketing)/rates/page.tsx` (`/rates`)
- `src/app/(marketing)/loan-officers/page.tsx` (`/loan-officers`)

First **read each file** to find its existing `generateMetadata` (they currently build metadata from config — the explore report confirms per-route `generateMetadata` exist). Replace the body with a `buildMetadata` call, preserving the route's path string.

- [ ] **Step 1: For each route file, set `generateMetadata` to delegate.** Example for `src/app/(marketing)/buy/page.tsx`:

```ts
import { buildMetadata } from "@/lib/seo/buildMetadata";
import type { Metadata } from "next";

export function generateMetadata(): Promise<Metadata> {
  return buildMetadata("/buy");
}
```

Apply the same shape per file with the correct path (`/`, `/refinance`, `/home-equity`, `/rates`, `/loan-officers`). If a file already imports `Metadata`/has other content, keep it — only swap the `generateMetadata` implementation. Leave the root `src/app/layout.tsx` `generateMetadata` as-is (it supplies the global title template + metadataBase that per-page metadata layers onto).

- [ ] **Step 2: Typecheck** — `npx tsc --noEmit` (clean). No unit test (integration; verified at the Task 10 build + live check).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(marketing)"
git commit -m "feat(seo): marketing routes resolve metadata via buildMetadata(path)"
```

---

### Task 5: CMS-aware sitemap

**Files:**
- Modify: `src/app/sitemap.ts`
- Create: `src/app/sitemap.helpers.ts` (pure, testable)
- Test: `src/app/sitemap.helpers.test.ts`

Read `src/app/sitemap.ts` first for the current `ROUTES` array + default priority/changefreq logic.

- [ ] **Step 1: Write the failing test** — create `src/app/sitemap.helpers.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { sitemapEntry, defaultPriority, defaultChangefreq } from "./sitemap.helpers";

describe("sitemap helpers", () => {
  it("defaults: home=1.0, apply=0.6, others=0.8; rates=daily else weekly", () => {
    expect(defaultPriority("")).toBe(1);
    expect(defaultPriority("/apply/buy")).toBe(0.6);
    expect(defaultPriority("/buy")).toBe(0.8);
    expect(defaultChangefreq("/rates")).toBe("daily");
    expect(defaultChangefreq("/buy")).toBe("weekly");
  });

  it("builds an entry, page-seo overriding priority/changefreq", () => {
    const e = sitemapEntry("https://msfg.us", "/buy", { include: true, priority: 0.9, changefreq: "monthly" });
    expect(e).toEqual({ url: "https://msfg.us/buy", priority: 0.9, changeFrequency: "monthly" });
  });

  it("returns null when the page is excluded (include:false)", () => {
    expect(sitemapEntry("https://msfg.us", "/buy", { include: false })).toBeNull();
  });

  it("falls back to defaults when page-seo omits priority/changefreq", () => {
    const e = sitemapEntry("https://msfg.us", "", { include: true });
    expect(e).toEqual({ url: "https://msfg.us", priority: 1, changeFrequency: "weekly" });
  });
});
```

- [ ] **Step 2: Run it, verify FAIL** — `npx vitest run src/app/sitemap.helpers.test.ts`.

- [ ] **Step 3: Implement helpers** — create `src/app/sitemap.helpers.ts`:

```ts
import type { MetadataRoute } from "next";
import type { PageSeo } from "@/server/cms/seo";

type Entry = MetadataRoute.Sitemap[number];
type Changefreq = NonNullable<Entry["changeFrequency"]>;

export function defaultPriority(route: string): number {
  if (route === "") return 1;
  if (route.startsWith("/apply")) return 0.6;
  return 0.8;
}

export function defaultChangefreq(route: string): Changefreq {
  return route === "/rates" ? "daily" : "weekly";
}

/** Build one sitemap entry, applying PAGE_SEO overrides. null => excluded. */
export function sitemapEntry(origin: string, route: string, page: PageSeo): Entry | null {
  if (page.include === false) return null;
  return {
    url: `${origin}${route}`,
    priority: page.priority ?? defaultPriority(route),
    changeFrequency: (page.changefreq as Changefreq | undefined) ?? defaultChangefreq(route),
  };
}
```

- [ ] **Step 4: Rewire `src/app/sitemap.ts`** to use the helpers + per-route `getPageSeo`. Keep the existing `ROUTES` array; map each through `getPageSeo` + `sitemapEntry`, dropping nulls:

```ts
import type { MetadataRoute } from "next";
import { getTenantOrigin } from "@/server/tenant/config";
import { getPageSeo } from "@/server/cms/seo";
import { sitemapEntry } from "./sitemap.helpers";

const ROUTES = [
  "", "/buy", "/refinance", "/home-equity", "/rates", "/loan-officers",
  "/apply/buy", "/apply/refi", "/apply/cash",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = await getTenantOrigin();
  const entries = await Promise.all(
    ROUTES.map(async (route) => sitemapEntry(origin, route, await getPageSeo(route))),
  );
  return entries.filter((e): e is NonNullable<typeof e> => e !== null);
}
```

(Match `ROUTES` to whatever the existing file lists — read it first; do not invent routes.)

- [ ] **Step 5: Run tests + typecheck** — `npx vitest run src/app/sitemap.helpers.test.ts` (PASS), `npx tsc --noEmit` (clean).

- [ ] **Step 6: Commit**

```bash
git add src/app/sitemap.ts src/app/sitemap.helpers.ts src/app/sitemap.helpers.test.ts
git commit -m "feat(seo): sitemap joins route registry with PAGE_SEO include/priority/changefreq"
```

---

### Task 6: Per-page JSON-LD component

**Files:**
- Create: `src/components/seo/PageJsonLd.tsx`
- Modify: the marketing route pages (add `<PageJsonLd path="…" />`)

Read `src/components/JsonLd.tsx` first (the explore report shows `<JsonLd data={…}>` renders the `application/ld+json` script).

- [ ] **Step 1: Implement** — create `src/components/seo/PageJsonLd.tsx`:

```ts
import { getPageSeo } from "@/server/cms/seo";
import { JsonLd } from "@/components/JsonLd";

/** Renders a route's per-page JSON-LD (PAGE_SEO.jsonLd) if an admin set one.
 *  Server component — safe in any marketing page body. */
export async function PageJsonLd({ path }: { path: string }) {
  const page = await getPageSeo(path);
  if (!page.jsonLd || typeof page.jsonLd !== "object") return null;
  return <JsonLd data={page.jsonLd as Record<string, unknown>} />;
}
```

- [ ] **Step 2: Add it to each marketing route page body** (top of the returned JSX is fine). Example in `src/app/(marketing)/buy/page.tsx` return:

```tsx
import { PageJsonLd } from "@/components/seo/PageJsonLd";
// ... inside the returned fragment/root:
<PageJsonLd path="/buy" />
```

Apply per route with the matching path. The home page already renders `localBusinessSchema` — keep that and add `<PageJsonLd path="/" />` alongside (they're additive; multiple ld+json scripts are valid).

- [ ] **Step 3: Typecheck** — `npx tsc --noEmit` (clean). No unit test (rendering; verified at Task 10).

- [ ] **Step 4: Commit**

```bash
git add src/components/seo/PageJsonLd.tsx "src/app/(marketing)"
git commit -m "feat(seo): per-page JSON-LD via <PageJsonLd path>"
```

---

### Task 7: SEO route registry + admin SEO actions

**Files:**
- Create: `src/app/admin/seo/routes.ts` (the editable route list)
- Create: `src/app/admin/seo/actions.ts`
- Test: `src/app/admin/seo/actions.test.ts`

Read `src/app/admin/config/actions.ts` first — mirror it exactly (`requireRole("EDITOR")` first, `tenantId`/`userId` from `ctx`, validate, `saveDraft`/`publish`, `revalidateCmsTag`, `auditLog.create`).

- [ ] **Step 1: Create the route registry** — `src/app/admin/seo/routes.ts`:

```ts
/** Routes whose SEO is editable in the CMS. Keys are the canonical path used as
 *  the PAGE_SEO editable key (must match the paths passed to buildMetadata). */
export const SEO_ROUTES: { path: string; label: string }[] = [
  { path: "/", label: "Home" },
  { path: "/buy", label: "Buy" },
  { path: "/refinance", label: "Refinance" },
  { path: "/home-equity", label: "Home Equity" },
  { path: "/rates", label: "Rates" },
  { path: "/loan-officers", label: "Loan Officers" },
];

export function isSeoRoute(path: string): boolean {
  return SEO_ROUTES.some((r) => r.path === path);
}
```

- [ ] **Step 2: Write the failing test** — `src/app/admin/seo/actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const requireRole = vi.fn();
const saveDraft = vi.fn();
const publish = vi.fn();
const rollback = vi.fn();
const revalidateCmsTag = vi.fn();
const auditCreate = vi.fn();
const getDraftData = vi.fn();
const getPublishedData = vi.fn();

vi.mock("@/server/admin/access", () => ({ requireRole: (...a: unknown[]) => requireRole(...a) }));
vi.mock("@/server/cms/versioning", () => ({
  saveDraft: (...a: unknown[]) => saveDraft(...a),
  publish: (...a: unknown[]) => publish(...a),
  rollback: (...a: unknown[]) => rollback(...a),
  getDraftData: (...a: unknown[]) => getDraftData(...a),
  getPublishedData: (...a: unknown[]) => getPublishedData(...a),
}));
vi.mock("@/server/cms/cache", () => ({
  seoTag: (t: string, p: string) => `t:${t}:seo:${p}`,
  revalidateCmsTag: (...a: unknown[]) => revalidateCmsTag(...a),
}));
vi.mock("@/lib/db", () => ({ getDb: () => ({ auditLog: { create: (...a: unknown[]) => auditCreate(...a) } }) }));

import { saveSeoDraftAction, publishSeoAction } from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
  requireRole.mockResolvedValue({ tenant: { id: "tenant_msfg" }, user: { id: "u1" } });
  getDraftData.mockResolvedValue(null);
  getPublishedData.mockResolvedValue(null);
});

describe("saveSeoDraftAction", () => {
  it("rejects an unknown route", async () => {
    await expect(saveSeoDraftAction("/evil", { title: "x" })).rejects.toThrow();
    expect(saveDraft).not.toHaveBeenCalled();
  });

  it("validates + saves a draft for a known route under tenantId from ctx", async () => {
    await saveSeoDraftAction("/buy", { title: "Buy a Home", priority: 0.9 });
    expect(saveDraft).toHaveBeenCalledWith(
      "tenant_msfg", "PAGE_SEO", "/buy",
      expect.objectContaining({ title: "Buy a Home", priority: 0.9, include: true }),
      "u1",
    );
    expect(auditCreate).toHaveBeenCalled();
  });
});

describe("publishSeoAction", () => {
  it("publishes + busts the per-path tag", async () => {
    await publishSeoAction("/buy");
    expect(publish).toHaveBeenCalledWith("tenant_msfg", "PAGE_SEO", "/buy", "u1");
    expect(revalidateCmsTag).toHaveBeenCalledWith("t:tenant_msfg:seo:/buy");
  });
});
```

- [ ] **Step 3: Run it, verify FAIL** — `npx vitest run src/app/admin/seo/actions.test.ts`.

- [ ] **Step 4: Implement** — `src/app/admin/seo/actions.ts`:

```ts
"use server";

import { requireRole } from "@/server/admin/access";
import { saveDraft, publish, rollback, getDraftData, getPublishedData } from "@/server/cms/versioning";
import { seoTag, revalidateCmsTag } from "@/server/cms/cache";
import { getDb } from "@/lib/db";
import { PageSeoSchema } from "@/server/cms/seo";
import { isSeoRoute } from "./routes";

function assertRoute(path: string): void {
  if (!isSeoRoute(path)) throw new Error(`Unknown SEO route: ${path}`);
}

export async function saveSeoDraftAction(path: string, patch: Record<string, unknown>) {
  assertRoute(path);
  const ctx = await requireRole("EDITOR");
  const base =
    (await getDraftData(ctx.tenant.id, "PAGE_SEO", path)) ??
    (await getPublishedData(ctx.tenant.id, "PAGE_SEO", path)) ??
    {};
  const parsed = PageSeoSchema.parse({ ...(base as object), ...patch });
  await saveDraft(ctx.tenant.id, "PAGE_SEO", path, parsed, ctx.user.id);
  await getDb().auditLog.create({
    data: { tenantId: ctx.tenant.id, userId: ctx.user.id, action: "seo.save_draft", meta: { path } },
  });
  return { ok: true as const };
}

export async function publishSeoAction(path: string) {
  assertRoute(path);
  const ctx = await requireRole("EDITOR");
  await publish(ctx.tenant.id, "PAGE_SEO", path, ctx.user.id);
  revalidateCmsTag(seoTag(ctx.tenant.id, path));
  await getDb().auditLog.create({
    data: { tenantId: ctx.tenant.id, userId: ctx.user.id, action: "seo.publish", meta: { path } },
  });
  return { ok: true as const };
}

export async function rollbackSeoAction(path: string, version: number) {
  assertRoute(path);
  const ctx = await requireRole("EDITOR");
  await rollback(ctx.tenant.id, "PAGE_SEO", path, version, ctx.user.id);
  await getDb().auditLog.create({
    data: { tenantId: ctx.tenant.id, userId: ctx.user.id, action: "seo.rollback", meta: { path, version } },
  });
  return { ok: true as const };
}
```

(Confirm `auditLog.create` field names against `src/app/admin/config/actions.ts` — match it exactly, incl. whether it uses `meta`.)

- [ ] **Step 5: Run tests + typecheck** — `npx vitest run src/app/admin/seo/actions.test.ts` (PASS), `npx tsc --noEmit` (clean).

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/seo/routes.ts src/app/admin/seo/actions.ts src/app/admin/seo/actions.test.ts
git commit -m "feat(seo): admin SEO actions (save/publish/rollback per route, audited)"
```

---

### Task 8: Admin SEO editor page + form

**Files:**
- Create: `src/app/admin/seo/page.tsx` (route picker)
- Create: `src/app/admin/seo/edit/page.tsx` (per-route editor, `?path=`)
- Create: `src/app/admin/seo/SeoEditor.tsx` (client form)

Read `src/app/admin/config/page.tsx` + `ConfigEditor.tsx` + `src/components/admin/fields/*` first and mirror them.

- [ ] **Step 1: Route picker** — `src/app/admin/seo/page.tsx`:

```tsx
import Link from "next/link";
import { requireRole } from "@/server/admin/access";
import { SEO_ROUTES } from "./routes";

export default async function SeoIndexPage() {
  await requireRole("EDITOR");
  return (
    <div className="p-6">
      <h1 className="mb-4 text-xl font-bold">Per-Page SEO</h1>
      <ul className="space-y-2">
        {SEO_ROUTES.map((r) => (
          <li key={r.path}>
            <Link className="text-green-700 underline" href={`/admin/seo/edit?path=${encodeURIComponent(r.path)}`}>
              {r.label} <span className="text-muted">({r.path})</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Editor page (loads draft/published)** — `src/app/admin/seo/edit/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { requireRole } from "@/server/admin/access";
import { getDraftData, getPublishedData } from "@/server/cms/versioning";
import { parsePageSeo } from "@/server/cms/seo";
import { isSeoRoute, SEO_ROUTES } from "../routes";
import { SeoEditor } from "../SeoEditor";

export default async function SeoEditPage({
  searchParams,
}: {
  searchParams: Promise<{ path?: string }>;
}) {
  const ctx = await requireRole("EDITOR");
  const { path } = await searchParams;
  if (!path || !isSeoRoute(path)) notFound();

  const draft = await getDraftData(ctx.tenant.id, "PAGE_SEO", path);
  const published = await getPublishedData(ctx.tenant.id, "PAGE_SEO", path);
  const initial = parsePageSeo(draft ?? published ?? null);
  const label = SEO_ROUTES.find((r) => r.path === path)?.label ?? path;

  return <SeoEditor path={path} label={label} initial={initial} hasDraft={draft != null} />;
}
```

- [ ] **Step 3: Client editor** — `src/app/admin/seo/SeoEditor.tsx`. Mirror `ConfigEditor.tsx`'s state+save/publish structure. Fields: title, description (textarea), canonical, ogTitle, ogDescription (textarea), ogImage, robots, include (switch), priority (number), changefreq (select), jsonLd (textarea holding JSON — parse on save, show an error if invalid):

```tsx
"use client";

import { useState } from "react";
import { TextField } from "@/components/admin/fields/TextField";
import { TextAreaField } from "@/components/admin/fields/TextAreaField";
import { SwitchField } from "@/components/admin/fields/SwitchField";
import type { PageSeo } from "@/server/cms/seo";
import { saveSeoDraftAction, publishSeoAction } from "./actions";

type FormState = Omit<PageSeo, "jsonLd"> & { jsonLdText: string };

function toForm(p: PageSeo): FormState {
  const { jsonLd, ...rest } = p;
  return { ...rest, include: p.include ?? true, jsonLdText: jsonLd ? JSON.stringify(jsonLd, null, 2) : "" };
}

export function SeoEditor({
  path,
  label,
  initial,
  hasDraft,
}: {
  path: string;
  label: string;
  initial: PageSeo;
  hasDraft: boolean;
}) {
  const [form, setForm] = useState<FormState>(toForm(initial));
  const [status, setStatus] = useState<string>(hasDraft ? "Editing an unpublished draft." : "");
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  function patch(): Record<string, unknown> | null {
    const { jsonLdText, ...rest } = form;
    const out: Record<string, unknown> = { ...rest };
    // empty strings => omit (inherit global)
    for (const k of ["title", "description", "canonical", "ogTitle", "ogDescription", "ogImage", "robots"]) {
      if (out[k] === "") delete out[k];
    }
    if (jsonLdText.trim()) {
      try {
        out.jsonLd = JSON.parse(jsonLdText);
      } catch {
        setStatus("JSON-LD is not valid JSON — fix it before saving.");
        return null;
      }
    }
    return out;
  }

  async function onSave() {
    const p = patch();
    if (!p) return;
    setStatus("Saving…");
    await saveSeoDraftAction(path, p);
    setStatus("Draft saved.");
  }

  async function onPublish() {
    const p = patch();
    if (!p) return;
    setStatus("Publishing…");
    await saveSeoDraftAction(path, p);
    await publishSeoAction(path);
    setStatus("Published. (New value appears on the page after the next reload.)");
  }

  return (
    <div className="max-w-2xl p-6">
      <h1 className="mb-1 text-xl font-bold">SEO — {label}</h1>
      <p className="mb-4 text-[13px] text-muted">{path}</p>

      <div className="space-y-4">
        <TextField label="Title" name="title" value={form.title ?? ""} onChange={(v) => set("title", v)} />
        <TextAreaField label="Description" name="description" value={form.description ?? ""} onChange={(v) => set("description", v)} />
        <TextField label="Canonical URL" name="canonical" value={form.canonical ?? ""} onChange={(v) => set("canonical", v)} />
        <TextField label="OG Title" name="ogTitle" value={form.ogTitle ?? ""} onChange={(v) => set("ogTitle", v)} />
        <TextAreaField label="OG Description" name="ogDescription" value={form.ogDescription ?? ""} onChange={(v) => set("ogDescription", v)} />
        <TextField label="OG Image URL" name="ogImage" value={form.ogImage ?? ""} onChange={(v) => set("ogImage", v)} />
        <TextField label="Robots (e.g. noindex,follow)" name="robots" value={form.robots ?? ""} onChange={(v) => set("robots", v)} />
        <SwitchField label="Include in sitemap" checked={form.include ?? true} onChange={(v) => set("include", v)} />
        <TextField label="Sitemap priority (0–1)" name="priority" type="number" value={form.priority?.toString() ?? ""} onChange={(v) => set("priority", v === "" ? undefined : Number(v))} />
        <TextAreaField label="JSON-LD (raw JSON, optional)" name="jsonLd" value={form.jsonLdText} onChange={(v) => set("jsonLdText", v)} />
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button onClick={onSave} className="rounded-md border border-line px-4 py-2 font-semibold">Save draft</button>
        <button onClick={onPublish} className="rounded-md bg-green-700 px-4 py-2 font-semibold text-white">Publish</button>
        <a href={`/admin/seo/history?path=${encodeURIComponent(path)}`} className="text-[13px] text-green-700 underline">History</a>
        <span className="text-[13px] text-muted">{status}</span>
      </div>
    </div>
  );
}
```

(Confirm the exact prop signatures of `TextField`/`TextAreaField`/`SwitchField` from `src/components/admin/fields/*` and adjust the `onChange` value type if they pass an event instead of a value. The `changefreq` select is optional polish — omit if the field components don't include a Select; priority+include cover the sitemap needs.)

- [ ] **Step 4: Typecheck** — `npx tsc --noEmit` (clean).

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/seo
git commit -m "feat(seo): admin per-page SEO editor (route picker + form)"
```

---

### Task 9: SEO history page + admin nav link

**Files:**
- Create: `src/app/admin/seo/history/page.tsx`
- Modify: `src/app/admin/layout.tsx` (add nav link)

Read `src/app/admin/config/history/page.tsx` + `src/app/admin/layout.tsx` first; mirror the history table + rollback form.

- [ ] **Step 1: History page** — `src/app/admin/seo/history/page.tsx`, mirroring the config history page but with `PAGE_SEO` + the `path` search param and `rollbackSeoAction(path, version)`:

```tsx
import { notFound } from "next/navigation";
import { requireRole } from "@/server/admin/access";
import { listHistory } from "@/server/cms/versioning";
import { isSeoRoute } from "../routes";
import { rollbackSeoAction } from "../actions";

export default async function SeoHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ path?: string }>;
}) {
  const ctx = await requireRole("EDITOR");
  const { path } = await searchParams;
  if (!path || !isSeoRoute(path)) notFound();
  const history = await listHistory(ctx.tenant.id, "PAGE_SEO", path);

  return (
    <div className="p-6">
      <h1 className="mb-4 text-xl font-bold">SEO history — {path}</h1>
      <table className="w-full text-left text-[14px]">
        <thead><tr className="border-b border-line"><th>Version</th><th>State</th><th>When</th><th /></tr></thead>
        <tbody>
          {history.map((rev) => (
            <tr key={rev.id} className="border-b border-line">
              <td>{rev.version}</td>
              <td>{rev.state}</td>
              <td>{new Date(rev.createdAt).toLocaleString()}</td>
              <td>
                <form action={async () => { "use server"; await rollbackSeoAction(path, rev.version); }}>
                  <button className="text-green-700 underline">Restore to draft</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

(Match `listHistory`'s returned field names — read `src/app/admin/config/history/page.tsx` for the exact shape, incl. `createdAt` type.)

- [ ] **Step 2: Add the nav link** — in `src/app/admin/layout.tsx`, add to the `NAV` array (after Config):

```ts
{ href: "/admin/seo", label: "Per-Page SEO" },
```

- [ ] **Step 3: Typecheck** — `npx tsc --noEmit` (clean).

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/seo/history "src/app/admin/layout.tsx"
git commit -m "feat(seo): SEO revision history + rollback + admin nav link"
```

---

### Task 10: Full verify + gated deploy

**Files:** none (verification).

- [ ] **Step 1: Full suite + typecheck** — `npx vitest run` (all pass, incl. the new seo/buildMetadata/sitemap/actions tests), `npx tsc --noEmit` (clean).

- [ ] **Step 2: Clean production build** — `rm -rf .next && npm run build`. Expected: succeeds; `/admin/seo` + `/admin/seo/edit` + `/admin/seo/history` appear as `ƒ` (dynamic); marketing routes still `○` static; `/sitemap.xml` builds.

- [ ] **Step 3: Deploy** — `bash scripts/deploy-ec2.sh https://staging.msfg.us staging`.

- [ ] **Step 4: Verify on staging** (use the ctx_execute fetch pattern — local curl is hook-blocked):
  - `/admin/seo` (unauth) → 307 → `/auth/login` (guard works).
  - homepage 200, `/sitemap.xml` 200 + lists routes.
  - marketing pages 200/static; AI + chrome unaffected.

- [ ] **Step 5: Commit any verification notes (none expected).**

---

## Post-implementation (controller)
- Final holistic review (opus) of the branch.
- Merge `cms-phase-3-seo` → main; the `/admin/seo` editor is usable immediately (Cognito + `/admin` are already live on staging).
- **Phase 3b (next):** Redirects — `REDIRECTS` editable + middleware enforcement (resolve the Edge-runtime/Prisma constraint: cached internal endpoint or Node-runtime middleware).

## Self-Review (author)
- **Spec coverage:** per-page meta (T1–T4) ✓; sitemap include/priority/changefreq (T1,T5) ✓; per-page JSON-LD (T1,T6) ✓; admin editor draft→publish→history (T7–T9) ✓; merge global←page (T3) ✓; cache tags + bust-on-publish (T1,T7) ✓; no migration ✓. Redirects explicitly deferred to Phase 3b (documented).
- **Placeholders:** none — every task has complete code. Three "confirm against the existing config-editor file" notes are verification asks, not gaps (the template is live in the repo).
- **Type consistency:** `PageSeo`/`parsePageSeo`/`PageSeoSchema` (T1) used identically in T2/T3/T6/T7/T8; `getPageSeo` (T2) consumed by T3/T5/T6; `seoTag` (T1) used in T2/T7; `SEO_ROUTES`/`isSeoRoute` (T7) used in T8/T9; action names `saveSeoDraftAction`/`publishSeoAction`/`rollbackSeoAction` consistent across T7/T8/T9.
