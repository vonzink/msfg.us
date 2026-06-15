# Legal Pages & Site-Wide Compliance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the seven legal pages a U.S. residential-mortgage marketing site needs (+ a shared Coming Soon page), an Equal Housing Opportunity logo, a soft-pull copy teardown, and a rewiring of every placeholder link to a real destination — all tenant-config-clean.

**Architecture:** A shared `LegalPage` server component renders consistent chrome (dark mini-hero title, pending-review banner, constrained prose, EHO logo + legal strip) for legal pages whose copy lives in typed content modules under `src/content/legal/`. Company-specific facts are `[PLACEHOLDER]`-tagged additive tenant-config fields. Links are rewired in `src/content/nav.ts` + `src/content/site.ts`; dead links point to one `noindex` `/coming-soon` page.

**Tech Stack:** Next.js 16 (App Router, route group `(marketing)`), React 19 server components, TypeScript, Tailwind v4 tokens, Zod (tenant config), vitest (node env, `src/**/*.test.ts`).

**Spec:** `docs/superpowers/specs/2026-06-14-legal-pages-compliance-design.md`

**Reference correction:** the SEO audit claimed `/developers` lacks an `<h1>`; it does have one ([developers/page.tsx:109](src/app/(marketing)/developers/page.tsx:109)). The only `/developers` action is adding it to the sitemap (T16).

---

## File Structure

**New files**
- `src/components/legal/EqualHousing.tsx` — Equal Housing Opportunity inline SVG (token-colored, accessible).
- `src/content/legal/types.ts` — `LegalBlock` / `LegalSection` / `LegalDoc` types.
- `src/components/legal/LegalPage.tsx` — shared shell (mini-hero, review banner, prose body, EHO + legal strip, `PageJsonLd`).
- `src/components/legal/GlbaFactsTable.tsx` — GLBA sharing matrix table.
- `src/components/legal/LicenseTable.tsx` — per-state license table.
- `src/content/legal/privacyPolicy.ts`, `privacyNotice.ts`, `terms.ts`, `accessibility.ts`, `licensing.ts` — content modules: `(config) => LegalDoc`.
- `src/app/(marketing)/privacy-policy/page.tsx`, `privacy-notice/`, `terms/`, `accessibility/`, `licensing/`, `nmls-consumer-access/`, `sitemap/`, `coming-soon/` — route pages.
- `src/lib/siteMap.ts` + `src/lib/siteMap.test.ts` — pure HTML-sitemap generator.
- `src/content/nav.test.ts` — no-placeholder / known-route link guard.
- `src/content/legal/legal.test.ts` — content-module structure integrity.
- `src/content/site.test.ts` — config parse + `effectiveDate` helper (+ family-card href guard).

**Modified files**
- `src/content/site.ts` — additive `legal` + `StateSchema` fields, DEFAULT placeholders, `effectiveDate` helper; family-card hrefs.
- `src/content/nav.ts` — rewire footer + legal links (calculators/dead → `/coming-soon`; legal → real pages; add legal links).
- `src/content/categories.ts`, `src/content/ai-script.ts` — soft-pull copy removal.
- `src/app/(marketing)/buy/page.tsx`, `rates/page.tsx`, `developers/page.tsx` — descriptions / metadata.
- `src/components/Footer.tsx` — EHO logo by the legal strip.
- `src/app/sitemap.ts`, `src/app/sitemap.helpers.ts` — register legal routes + `/developers`; legal priority/changefreq.

---

## Task 1: EqualHousing logo component

**Files:**
- Create: `src/components/legal/EqualHousing.tsx`

No unit test (pure presentational SVG; verified in the browser pass, T19). The repo's vitest runs in a node env with no React Testing Library, so component render tests are out of scope — match the existing pure-logic test style.

- [ ] **Step 1: Create the component**

```tsx
/** Equal Housing Opportunity mark — a house outline with the equal sign, the
 *  standard fair-housing symbol. Token-colored via `currentColor` so it inherits
 *  the surrounding text color (e.g. `text-muted`). Approximates the official HUD
 *  mark; a brand-approved asset can replace it later without touching callers. */
export function EqualHousing({
  size = 28,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="Equal Housing Opportunity"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      <title>Equal Housing Opportunity</title>
      <path d="M7 31 L32 10 L57 31" />
      <path d="M14 28 V53 H50 V28" />
      <line x1="24" y1="36" x2="40" y2="36" />
      <line x1="24" y1="44" x2="40" y2="44" />
    </svg>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/legal/EqualHousing.tsx
git commit -m "feat(legal): Equal Housing Opportunity logo component"
```

---

## Task 2: Additive tenant-config legal fields + effectiveDate helper

Adds optional, `[PLACEHOLDER]`-tagged fields so legal pages can render company facts. All fields optional → existing stored configs still parse (the resolver REPLACES, it does not deep-merge — see [config.ts:19](src/server/tenant/config.ts:19) `parseTenantConfig`); pages fall back gracefully.

**Files:**
- Modify: `src/content/site.ts`
- Test: `src/content/site.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import {
  DEFAULT_TENANT_CONFIG,
  effectiveDate,
  TenantConfigSchema,
} from "@/content/site";

describe("legal config additions", () => {
  it("every default state carries a license-number placeholder", () => {
    for (const s of DEFAULT_TENANT_CONFIG.legal.states) {
      expect(s.licenseNumber).toBeTruthy();
    }
  });

  it("default legal carries address + lastUpdated placeholders", () => {
    expect(DEFAULT_TENANT_CONFIG.legal.address).toContain("PLACEHOLDER");
  });

  it("effectiveDate falls back to a placeholder when no date is set", () => {
    expect(effectiveDate(DEFAULT_TENANT_CONFIG, "terms")).toContain("PLACEHOLDER");
  });

  it("a stored config missing the new fields still parses", () => {
    const stripped = JSON.parse(JSON.stringify(DEFAULT_TENANT_CONFIG));
    stripped.legal.states = stripped.legal.states.map(
      (s: { code: string; name: string }) => ({ code: s.code, name: s.name }),
    );
    delete stripped.legal.address;
    delete stripped.legal.effectiveDates;
    expect(TenantConfigSchema.safeParse(stripped).success).toBe(true);
  });

  it("no family-of-companies card points to the bare home placeholder", () => {
    for (const card of DEFAULT_TENANT_CONFIG.marketing!.familyOfCompanies) {
      expect(card.href).not.toBe("/");
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/content/site.test.ts`
Expected: FAIL — `effectiveDate` is not exported; `licenseNumber`/`address` undefined; family-card guard fails (Veterans/Reverse/Investment/Commercial still `/`).

- [ ] **Step 3: Extend `StateSchema` and `LegalSchema`**

In `src/content/site.ts`, replace the `StateSchema` definition (currently `const StateSchema = z.object({ code: z.string(), name: z.string() });`) with:

```ts
const StateSchema = z.object({
  code: z.string(),
  name: z.string(),
  /** State mortgage license name/number. [PLACEHOLDER] until real data lands. */
  licenseNumber: z.string().optional(),
});
```

Replace the `LegalSchema` definition with:

```ts
const LegalSchema = z.object({
  states: z.array(StateSchema),
  texasNotice: z.string(),
  ratesDisclaimer: z.string(),
  /** Registered office address for legal pages. [PLACEHOLDER] until provided. */
  address: z.string().optional(),
  /** Distinct privacy/compliance contact; pages fall back to contact.email. */
  privacyEmail: z.string().optional(),
  /** Per-doc "last updated" strings, keyed by route slug (e.g. "terms"). */
  effectiveDates: z.record(z.string(), z.string()).optional(),
});
```

- [ ] **Step 4: Add placeholders to `DEFAULT_TENANT_CONFIG.legal`**

In `DEFAULT_TENANT_CONFIG`, replace the `legal.states` array so each entry carries a placeholder license number, and add `address` after `ratesDisclaimer`:

```ts
  legal: {
    states: [
      { code: "CO", name: "Colorado", licenseNumber: "[PLACEHOLDER]" },
      { code: "ND", name: "North Dakota", licenseNumber: "[PLACEHOLDER]" },
      { code: "SD", name: "South Dakota", licenseNumber: "[PLACEHOLDER]" },
      { code: "MN", name: "Minnesota", licenseNumber: "[PLACEHOLDER]" },
      { code: "TX", name: "Texas", licenseNumber: "[PLACEHOLDER]" },
      { code: "MI", name: "Michigan", licenseNumber: "[PLACEHOLDER]" },
      { code: "IN", name: "Indiana", licenseNumber: "[PLACEHOLDER]" },
    ],
    texasNotice:
      "Texas Consumer Complaint and Recovery Fund Notice available upon request. Figure: Consumers wishing to file a complaint against a mortgage company or licensed residential mortgage loan originator should complete and send a complaint form to the Texas Department of Savings and Mortgage Lending.",
    ratesDisclaimer:
      "Rates shown are indicative, assume a 740+ FICO score, a $300,000 loan on a single-family primary residence, and are not a commitment to lend. Your actual rate depends on your credit, property, loan amount, and a complete application. Rates and points are subject to change without notice.",
    address: "[PLACEHOLDER] — registered office address",
  },
```

(Leave `privacyEmail` and `effectiveDates` unset in DEFAULT so pages fall back to `contact.email` / a placeholder date.)

- [ ] **Step 5: Add the `effectiveDate` helper**

Add near `statesLine` (after the `buildLegalStrip` block) in `src/content/site.ts`:

```ts
/** "Last updated" string for a legal doc slug; placeholder until real dates land. */
export function effectiveDate(c: TenantConfig, slug: string): string {
  return c.legal.effectiveDates?.[slug] ?? "[PLACEHOLDER]";
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/content/site.test.ts`
Expected: FAIL on the family-card guard only (that's fixed in T15). The other four assertions PASS. If the family-card test blocks the run, mark it `it.skip` with a `// unskip in T15` comment, OR implement T15's family-card hrefs now in the same commit (preferred — do Step 7 then re-run).

- [ ] **Step 7: Flip the four family-card hrefs (paired here to keep the test green)**

In `DEFAULT_TENANT_CONFIG.marketing.familyOfCompanies`, change the `href` of the **Veterans**, **Reverse**, **Investment**, and **Commercial** cards from `"/"` to `"/coming-soon"` (leave Mortgage `/buy` and Equity `/home-equity`).

- [ ] **Step 8: Run the test again**

Run: `npx vitest run src/content/site.test.ts`
Expected: PASS (all 5).

- [ ] **Step 9: Commit**

```bash
git add src/content/site.ts src/content/site.test.ts
git commit -m "feat(legal): additive tenant-config legal fields + effectiveDate helper"
```

---

## Task 3: Legal content types

**Files:**
- Create: `src/content/legal/types.ts`

- [ ] **Step 1: Create the types**

```ts
/** A renderable block inside a legal document section. */
export type LegalBlock =
  | { kind: "p"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "h3"; text: string };

/** A titled section of a legal document. */
export type LegalSection = { heading: string; blocks: LegalBlock[] };

/** A full legal document: an optional intro paragraph + ordered sections. */
export type LegalDoc = { intro?: string; sections: LegalSection[] };
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/content/legal/types.ts
git commit -m "feat(legal): legal content types"
```

---

## Task 4: LegalPage shell

**Files:**
- Create: `src/components/legal/LegalPage.tsx`

Reuses: `EqualHousing` (T1), `LegalDoc` (T3), `buildLegalStrip`/`effectiveDate` (T2), `getTenantConfig`, `PageJsonLd`, `wrap`/token classes.

- [ ] **Step 1: Create the shell**

```tsx
import { buildLegalStrip, effectiveDate } from "@/content/site";
import { getTenantConfig } from "@/server/tenant/config";
import { PageJsonLd } from "@/components/seo/PageJsonLd";
import { Mark } from "@/components/ui/Mark";
import { EqualHousing } from "./EqualHousing";
import type { LegalBlock, LegalDoc } from "@/content/legal/types";

function Block({ block }: { block: LegalBlock }) {
  if (block.kind === "h3")
    return <h3 className="mt-6 text-[19px] font-bold tracking-[-0.01em] text-ink">{block.text}</h3>;
  if (block.kind === "ul")
    return (
      <ul className="mt-2 list-disc space-y-2 pl-5 text-[16px] leading-[1.6] text-ink">
        {block.items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    );
  return <p className="text-[16px] leading-[1.6] text-ink">{block.text}</p>;
}

/** Shared chrome for a legal page: dark mini-hero title, pending-review banner,
 *  constrained prose body, and an Equal Housing Opportunity + legal-strip footer.
 *  `slug` keys the effective date and the per-page JSON-LD path. */
export async function LegalPage({
  title,
  eyebrow = "Legal",
  slug,
  doc,
  children,
  reviewBanner = true,
}: {
  title: string;
  eyebrow?: string;
  slug: string;
  doc?: LegalDoc;
  children?: React.ReactNode;
  reviewBanner?: boolean;
}) {
  const config = await getTenantConfig();
  return (
    <>
      <PageJsonLd path={`/${slug}`} />
      <section className="hero-bg px-0 pb-[52px] pt-14 text-center text-white">
        <div className="wrap">
          <span className="mb-3.5 inline-flex items-center gap-2.5 text-mint">
            <Mark size={18} label={config.brand.shortName} />
            <span className="text-[13px] font-semibold tracking-[0.02em]">{eyebrow}</span>
          </span>
          <h1 className="m-0 text-[clamp(30px,4.2vw,48px)] font-extrabold tracking-[-0.03em]">
            {title}
          </h1>
          <p className="mt-3 text-[14px] text-on-dark-2">
            Last updated: {effectiveDate(config, slug)}
          </p>
        </div>
      </section>

      <article className="bg-paper py-16 text-ink">
        <div className="wrap max-w-[820px]">
          {reviewBanner && (
            <div
              role="note"
              className="mb-10 rounded-lg border border-line bg-paper-2 px-4 py-3 text-[13.5px] leading-[1.5] text-muted"
            >
              <strong className="font-bold text-ink">Draft for review.</strong> This page is a
              working template pending {config.brand.shortName} legal &amp; compliance approval and
              is not yet legal advice. Bracketed <code className="text-[12.5px]">[PLACEHOLDER]</code>{" "}
              values will be replaced with verified information before launch.
            </div>
          )}

          {doc?.intro && (
            <p className="mb-8 text-[17px] leading-[1.6] text-ink">{doc.intro}</p>
          )}

          <div className="space-y-10">
            {doc?.sections.map((s, i) => (
              <section key={i}>
                <h2 className="text-[24px] font-extrabold tracking-[-0.02em] text-ink">
                  {s.heading}
                </h2>
                <div className="mt-3 space-y-3">
                  {s.blocks.map((b, j) => (
                    <Block key={j} block={b} />
                  ))}
                </div>
              </section>
            ))}
            {children}
          </div>

          <div className="mt-14 flex items-start gap-3 border-t border-line pt-6">
            <EqualHousing size={30} className="mt-0.5 shrink-0 text-muted" />
            <p className="text-[12.5px] leading-relaxed text-muted">{buildLegalStrip(config)}</p>
          </div>
        </div>
      </article>
    </>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/components/legal/LegalPage.tsx
git commit -m "feat(legal): shared LegalPage shell"
```

---

## Task 5: GlbaFactsTable + LicenseTable helpers

**Files:**
- Create: `src/components/legal/GlbaFactsTable.tsx`
- Create: `src/components/legal/LicenseTable.tsx`

- [ ] **Step 1: Create `GlbaFactsTable.tsx`**

```tsx
/** A row of the GLBA "Facts" sharing matrix. */
export type GlbaShareRow = {
  reason: string;
  shares: "Yes" | "No";
  canLimit: "Yes" | "No" | "We don't share";
};

/** The standardized GLBA financial-privacy sharing table. */
export function GlbaFactsTable({ rows }: { rows: GlbaShareRow[] }) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full border-collapse text-left text-[15px] text-ink">
        <thead>
          <tr className="border-b-2 border-line">
            <th className="py-2 pr-4 font-bold">Reasons we can share your personal information</th>
            <th className="py-2 pr-4 font-bold">Does {`MSFG`} share?</th>
            <th className="py-2 font-bold">Can you limit this sharing?</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-line align-top">
              <td className="py-2 pr-4">{r.reason}</td>
              <td className="py-2 pr-4 font-semibold">{r.shares}</td>
              <td className="py-2">{r.canLimit}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Create `LicenseTable.tsx`**

```tsx
import type { TenantConfig } from "@/content/site";

/** Per-state licensing table. Renders the placeholder when a number is unset. */
export function LicenseTable({ config }: { config: TenantConfig }) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full border-collapse text-left text-[15px] text-ink">
        <thead>
          <tr className="border-b-2 border-line">
            <th className="py-2 pr-4 font-bold">State</th>
            <th className="py-2 font-bold">License</th>
          </tr>
        </thead>
        <tbody>
          {config.legal.states.map((s) => (
            <tr key={s.code} className="border-b border-line">
              <td className="py-2 pr-4">
                {s.name} ({s.code})
              </td>
              <td className="py-2">{s.licenseNumber ?? "License # [PLACEHOLDER]"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/components/legal/GlbaFactsTable.tsx src/components/legal/LicenseTable.tsx
git commit -m "feat(legal): GLBA facts + license table helpers"
```

---

## Tasks 6–10: Legal content modules + routes

Each task creates one content module `(config) => LegalDoc` and its route page. **Drafting rules (apply to every module):** write standard, industry-typical mortgage/financial copy; tag every company-specific or counsel-owned fact inline as `[PLACEHOLDER]` (e.g. governing-law state, arbitration terms, retention periods, specific third-party processor names you can't confirm); keep the tone plain and consumer-readable; do NOT assert facts you can't verify. Use real config values where available: `config.brand.legalName`, `config.brand.shortName`, `config.contact.nmls`, `config.contact.email`, `config.contact.nmlsConsumerAccessUrl`, `config.legal.states` (via `statesLine`), `config.legal.privacyEmail ?? config.contact.email`, `config.legal.address`. Each module signature is `export function <name>Doc(config: TenantConfig): LegalDoc`.

Page template (substitute slug/title/description/module per task):

```tsx
import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo/buildMetadata";
import { getTenantConfig } from "@/server/tenant/config";
import { LegalPage } from "@/components/legal/LegalPage";
import { <module>Doc } from "@/content/legal/<module>";

export function generateMetadata(): Promise<Metadata> {
  return buildMetadata("/<slug>", {
    title: "<Title>",
    description: "<150–160 char description>",
    canonical: "/<slug>",
  });
}

export default async function <Name>Page() {
  const config = await getTenantConfig();
  return <LegalPage title="<Title>" slug="<slug>" doc={<module>Doc(config)} />;
}
```

After each page, **register it in the sitemap** (T16 also adds them in bulk, but adding here keeps the route discoverable as you go): add `"/<slug>"` to the `ROUTES` array in `src/app/sitemap.ts`. If a later task re-touches that array, keep entries unique.

### Task 6: Privacy Policy

**Files:** Create `src/content/legal/privacyPolicy.ts`, `src/app/(marketing)/privacy-policy/page.tsx`. Modify `src/app/sitemap.ts`.

- [ ] **Step 1: `privacyPolicy.ts`** — `privacyPolicyDoc(config)` returns a `LegalDoc` with `intro` (this policy covers the public marketing site `msfg.us`; the loan application portal/LOS has its own notices) and sections:
  - **Information we collect** — `p` + `ul`: details you submit (name, email, phone, and the property/financing details you enter in the application funnel); automatic data (device/browser, IP, pages viewed via analytics); cookies/local storage.
  - **How we use information** — `ul`: respond to inquiries; route you to a licensed loan officer; pre-fill/transfer an application to our loan origination system; site analytics and improvement; legal/compliance.
  - **How information is shared** — `ul`: with licensed loan officers and our loan origination system (`app.msfgco.com`); with service providers acting on our behalf (CRM, address autocomplete, hosting) — name them `[PLACEHOLDER]` where unconfirmed; as required by law; in a business transfer. State plainly: we do not sell personal information `[PLACEHOLDER — confirm]`.
  - **Cookies & analytics** — `p`: what cookies/analytics are used and how to control them in the browser.
  - **Your privacy rights** — `p` + `ul`: California (CCPA/CPRA) and other state rights (access, delete, correct, opt-out) `[PLACEHOLDER — confirm applicable states]`; how to exercise them via `config.legal.privacyEmail ?? config.contact.email`.
  - **Data retention & security** — `p`: reasonable safeguards; retention per legal/business need `[PLACEHOLDER]`.
  - **Children** — `p`: the site is not directed to children under 13/16.
  - **Changes to this policy** — `p`: we may update; "last updated" shown above.
  - **Contact us** — `p`: `config.brand.legalName`, NMLS #`{config.contact.nmls}` `[PLACEHOLDER]`, `config.legal.address`, privacy contact email.
- [ ] **Step 2: Create the route page** from the template (slug `privacy-policy`, title `Privacy Policy`, description e.g. "How Mountain State Financial Group collects, uses, and protects your information on msfg.us, and the privacy choices and state rights available to you.").
- [ ] **Step 3: Add `"/privacy-policy"` to `src/app/sitemap.ts` ROUTES.**
- [ ] **Step 4: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/content/legal/privacyPolicy.ts "src/app/(marketing)/privacy-policy" src/app/sitemap.ts
git commit -m "feat(legal): Privacy Policy page"
```

### Task 7: Privacy Notice (GLBA)

**Files:** Create `src/content/legal/privacyNotice.ts`, `src/app/(marketing)/privacy-notice/page.tsx`. Modify `src/app/sitemap.ts`.

- [ ] **Step 1: `privacyNotice.ts`** — `privacyNoticeDoc(config)` returns the GLBA model-form structure as a `LegalDoc`:
  - intro: "FACTS — What does {legalName} do with your personal information?"
  - **Why?** — `p`: financial companies share customers' personal information; federal law gives consumers the right to limit some but not all sharing.
  - **What?** — `p` + `ul`: types collected (Social Security number and income; account balances and payment history; credit history and credit scores) — standard GLBA examples.
  - **How?** — `p`: all financial companies need to share customers' personal info to run everyday business; the reasons {shortName} chooses to share are in the table below.
  - **Sharing matrix** — an `h3` "Reasons we can share your personal information" followed by a note that the table renders via `<GlbaFactsTable>` (the page passes the rows; see Step 2). Standard rows: everyday business purposes (Yes / No); marketing purposes (`[PLACEHOLDER]`); joint marketing with other financial companies (`[PLACEHOLDER]`); affiliates' everyday business (`[PLACEHOLDER]`); affiliates to market to you (`[PLACEHOLDER]`); nonaffiliates to market to you (`[PLACEHOLDER]`).
  - **Who we are** — `p`: who is providing this notice (`legalName`, NMLS #`{nmls}` `[PLACEHOLDER]`).
  - **What we do** — `h3`/`p` pairs: how {shortName} protects your personal information; how {shortName} collects it; why you can't limit all sharing.
  - **Definitions** — `ul`: affiliates, nonaffiliates, joint marketing `[PLACEHOLDER — confirm]`.
  - **Questions?** — `p`: call `config.contact.phoneDisplay` or email privacy contact.
- [ ] **Step 2: Route page** — because the GLBA table is structured, this page composes `LegalPage` with the doc AND a `children` slot containing the table. Use:

```tsx
export default async function PrivacyNoticePage() {
  const config = await getTenantConfig();
  const rows = glbaRows(config); // exported from privacyNotice.ts
  return (
    <LegalPage title="Privacy Notice" eyebrow="GLBA Privacy" slug="privacy-notice" doc={privacyNoticeDoc(config)}>
      <section>
        <h2 className="text-[24px] font-extrabold tracking-[-0.02em] text-ink">Sharing at a glance</h2>
        <GlbaFactsTable rows={rows} />
      </section>
    </LegalPage>
  );
}
```

Export `glbaRows(config): GlbaShareRow[]` from `privacyNotice.ts` (the standard six rows above). Title `Privacy Notice`, description e.g. "Our Gramm-Leach-Bliley Act (GLBA) financial privacy notice: what personal information we collect, why we share it, and how to limit sharing."
- [ ] **Step 3: Add `"/privacy-notice"` to ROUTES.**
- [ ] **Step 4: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/content/legal/privacyNotice.ts "src/app/(marketing)/privacy-notice" src/app/sitemap.ts
git commit -m "feat(legal): GLBA Privacy Notice page"
```

### Task 8: Terms of Use

**Files:** Create `src/content/legal/terms.ts`, `src/app/(marketing)/terms/page.tsx`. Modify `src/app/sitemap.ts`.

- [ ] **Step 1: `terms.ts`** — `termsDoc(config)` sections: **Acceptance of terms**; **Permitted use** (personal, lawful use; no scraping/abuse); **Not financial advice / no commitment to lend** (informational estimates only; real terms require a complete application, credit review, property, and underwriting); **Intellectual property** (site content owned by `{legalName}`); **Third-party links** (not responsible for external sites); **Disclaimers** ("as is", no warranties); **Limitation of liability** `[PLACEHOLDER — confirm caps]`; **Indemnification**; **Governing law & dispute resolution** (governing state `[PLACEHOLDER]`; arbitration / class-action waiver `[PLACEHOLDER — counsel]`); **Changes to these terms**; **Contact** (`legalName`, address, email).
- [ ] **Step 2: Route page** (slug `terms`, title `Terms of Use`, description e.g. "The terms governing your use of msfg.us — permitted use, informational-only disclaimers, intellectual property, liability, and dispute resolution.").
- [ ] **Step 3: Add `"/terms"` to ROUTES. Step 4: Typecheck + commit** (`feat(legal): Terms of Use page`).

### Task 9: Accessibility Statement

**Files:** Create `src/content/legal/accessibility.ts`, `src/app/(marketing)/accessibility/page.tsx`. Modify `src/app/sitemap.ts`.

- [ ] **Step 1: `accessibility.ts`** — `accessibilityDoc(config)` sections: **Our commitment** (we aim to conform to WCAG 2.1 Level AA); **Measures we take** (`ul`: semantic markup, keyboard support, color-contrast, alt text, ongoing review); **Known limitations** (`p` `[PLACEHOLDER]`); **Need help or found a barrier?** (`p`: contact `config.contact.phoneDisplay` / `config.contact.email`; we'll provide the information through an alternative communication method); **Feedback** (how to report). 
- [ ] **Step 2: Route page** (slug `accessibility`, title `Accessibility Statement`, description e.g. "Mountain State Financial Group is committed to digital accessibility and WCAG 2.1 AA. Learn what we do and how to report an accessibility barrier.").
- [ ] **Step 3: Add `"/accessibility"` to ROUTES. Step 4: Typecheck + commit** (`feat(legal): Accessibility Statement page`).

### Task 10: Licensing & Disclosures

**Files:** Create `src/content/legal/licensing.ts`, `src/app/(marketing)/licensing/page.tsx`. Modify `src/app/sitemap.ts`.

- [ ] **Step 1: `licensing.ts`** — `licensingDoc(config)` sections: **Who we are** (`p`: `{legalName}`, NMLS #`{nmls}` `[PLACEHOLDER]`; `{address}`); **Where we're licensed** (`p`: "{shortName} is licensed to originate residential mortgage loans in the following states." — the per-state table renders via `<LicenseTable>` in the page `children`); **Equal Housing Lender** (`p`: "{shortName} is an Equal Housing Lender. We do business in accordance with the Fair Housing Act and the Equal Credit Opportunity Act."); **Key disclosures** (`ul`: loans subject to credit and property approval; rates/terms subject to change without notice; not a commitment to lend; this is not an offer to lend); **Texas notice** (`p`: `config.legal.texasNotice`); **Verify our license** (`p`: links to NMLS Consumer Access — point to the on-site `/nmls-consumer-access` page).
- [ ] **Step 2: Route page** composes `LegalPage` with the doc + `children` = an EqualHousing + heading + `<LicenseTable config={config} />` block:

```tsx
export default async function LicensingPage() {
  const config = await getTenantConfig();
  return (
    <LegalPage title="Licensing & Disclosures" slug="licensing" doc={licensingDoc(config)}>
      <section>
        <h2 className="text-[24px] font-extrabold tracking-[-0.02em] text-ink">State licenses</h2>
        <LicenseTable config={config} />
      </section>
    </LegalPage>
  );
}
```

Title `Licensing & Disclosures`, description e.g. "Mountain State Financial Group licensing, NMLS information, state license numbers, Equal Housing Lender statement, and key mortgage disclosures."
- [ ] **Step 3: Add `"/licensing"` to ROUTES. Step 4: Typecheck + commit** (`feat(legal): Licensing & Disclosures page`).

---

## Task 11: NMLS Consumer Access page

A short explainer + a prominent outbound link to the official lookup. Bespoke (not a `LegalDoc`) — uses the dark mini-hero + `Section` + `Button` pattern.

**Files:**
- Create: `src/app/(marketing)/nmls-consumer-access/page.tsx`
- Modify: `src/app/sitemap.ts`

- [ ] **Step 1: Create the page**

```tsx
import type { Metadata } from "next";
import { Mark } from "@/components/ui/Mark";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { CtaBand } from "@/components/CtaBand";
import { getTenantConfig } from "@/server/tenant/config";
import { buildMetadata } from "@/lib/seo/buildMetadata";
import { PageJsonLd } from "@/components/seo/PageJsonLd";
import { statesLine } from "@/content/site";

export function generateMetadata(): Promise<Metadata> {
  return buildMetadata("/nmls-consumer-access", {
    title: "NMLS Consumer Access",
    description:
      "Verify Mountain State Financial Group on NMLS Consumer Access — the official registry of licensed mortgage companies and loan originators.",
    canonical: "/nmls-consumer-access",
  });
}

export default async function NmlsConsumerAccessPage() {
  const config = await getTenantConfig();
  return (
    <>
      <PageJsonLd path="/nmls-consumer-access" />
      <section className="hero-bg px-0 pb-[52px] pt-14 text-center text-white">
        <div className="wrap">
          <span className="mb-3.5 inline-flex items-center gap-2.5 text-mint">
            <Mark size={18} label={config.brand.shortName} />
            <span className="text-[13px] font-semibold tracking-[0.02em]">Verify our license</span>
          </span>
          <h1 className="m-0 text-[clamp(30px,4.2vw,48px)] font-extrabold tracking-[-0.03em]">
            NMLS Consumer Access
          </h1>
          <p className="mx-auto mt-4 max-w-[60ch] text-[18px] text-on-dark-2">
            NMLS Consumer Access is the official, free registry maintained by the Nationwide
            Multistate Licensing System. Use it to confirm {config.brand.legalName} and our loan
            originators are licensed.
          </p>
        </div>
      </section>

      <Section>
        <div className="mx-auto max-w-[760px]">
          <p className="text-[16px] leading-[1.6] text-ink">
            Our company NMLS ID is{" "}
            <strong className="font-bold">#{config.contact.nmls} [PLACEHOLDER]</strong>. We are
            licensed to originate residential mortgage loans in {statesLine(config)}. To verify our
            license or look up an individual loan officer, search the official registry:
          </p>
          <div className="mt-6">
            <Button href={config.contact.nmlsConsumerAccessUrl} variant="green">
              Open NMLS Consumer Access ↗
            </Button>
          </div>
          <p className="mt-4 text-[13.5px] text-muted">
            Opens nmlsconsumeraccess.org in a new tab. {config.brand.shortName} is an Equal Housing
            Lender.
          </p>
        </div>
      </Section>

      <CtaBand />
    </>
  );
}
```

Note: confirm `Button` renders an external `href` with `target="_blank"`/`rel`. If it does not auto-detect external links, pass them explicitly (check the `Button` API; the codebase's `Button` is polymorphic via `href`). If `Button` cannot set `target`, use a plain `<a className="...">` styled as a button instead.

- [ ] **Step 2: Add `"/nmls-consumer-access"` to ROUTES.**
- [ ] **Step 3: Typecheck + commit**

```bash
npx tsc --noEmit
git add "src/app/(marketing)/nmls-consumer-access" src/app/sitemap.ts
git commit -m "feat(legal): NMLS Consumer Access page"
```

---

## Task 12: HTML Site Map (generator + page)

**Files:**
- Create: `src/lib/siteMap.ts`
- Test: `src/lib/siteMap.test.ts`
- Create: `src/app/(marketing)/sitemap/page.tsx`
- Modify: `src/app/sitemap.ts`

Confirm there is no route collision: the metadata route `src/app/sitemap.ts` serves `/sitemap.xml`; a page at `src/app/(marketing)/sitemap/page.tsx` serves `/sitemap`. Different paths — fine.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { buildSiteMap } from "@/lib/siteMap";

describe("buildSiteMap", () => {
  const groups = buildSiteMap();

  it("returns named groups with links", () => {
    expect(groups.length).toBeGreaterThan(0);
    for (const g of groups) {
      expect(g.heading).toBeTruthy();
      expect(g.links.length).toBeGreaterThan(0);
    }
  });

  it("lists only real internal routes (no placeholders, no coming-soon, no externals)", () => {
    const KNOWN = new Set([
      "/", "/buy", "/refinance", "/home-equity", "/rates", "/loan-officers", "/developers",
      "/apply/buy", "/apply/refi", "/apply/cash",
      "/licensing", "/privacy-notice", "/privacy-policy", "/terms", "/accessibility",
      "/nmls-consumer-access", "/sitemap",
    ]);
    for (const g of groups) {
      for (const l of g.links) {
        expect(l.href.startsWith("http")).toBe(false);
        expect(l.href).not.toBe("/coming-soon");
        expect(KNOWN.has(l.href)).toBe(true);
      }
    }
  });

  it("includes the legal pages group", () => {
    const headings = groups.map((g) => g.heading);
    expect(headings).toContain("Legal & Compliance");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/siteMap.test.ts`
Expected: FAIL — `buildSiteMap` not defined.

- [ ] **Step 3: Implement `siteMap.ts`**

```ts
import { NAV, FOOTER_COLUMNS, type NavLink } from "@/content/nav";

export type SiteMapGroup = { heading: string; links: { label: string; href: string }[] };

const APPLY: NavLink[] = [
  { label: "Start a purchase application", href: "/apply/buy" },
  { label: "Start a refinance application", href: "/apply/refi" },
  { label: "Start a home-equity application", href: "/apply/cash" },
];

const LEGAL: NavLink[] = [
  { label: "Licensing & Disclosures", href: "/licensing" },
  { label: "Privacy Notice (GLBA)", href: "/privacy-notice" },
  { label: "Privacy Policy", href: "/privacy-policy" },
  { label: "Terms of Use", href: "/terms" },
  { label: "Accessibility Statement", href: "/accessibility" },
  { label: "NMLS Consumer Access", href: "/nmls-consumer-access" },
];

/** Keep only internal, real destinations — drop externals, the bare-home
 *  placeholder, and the Coming Soon catch-all; de-dupe by href. */
function clean(links: NavLink[]): { label: string; href: string }[] {
  const seen = new Set<string>();
  const out: { label: string; href: string }[] = [];
  for (const l of links) {
    if (l.href.startsWith("http")) continue;
    if (l.href === "/" || l.href === "/coming-soon") continue;
    if (seen.has(l.href)) continue;
    seen.add(l.href);
    out.push({ label: l.label, href: l.href });
  }
  return out;
}

/** Human-readable site map, derived from the nav + footer config so it can't go
 *  stale. Home is prepended explicitly (clean() strips "/" from NAV-derived
 *  links so it isn't duplicated); legal + apply are curated lists. */
export function buildSiteMap(): SiteMapGroup[] {
  const explore = [
    { label: "Home", href: "/" },
    ...clean(NAV.map((n) => ({ label: n.label, href: n.href }))),
  ];
  const resources = clean(FOOTER_COLUMNS.flatMap((c) => c.links));
  return [
    { heading: "Explore", links: explore },
    { heading: "Apply", links: clean(APPLY) },
    { heading: "Resources", links: resources },
    { heading: "Legal & Compliance", links: clean(LEGAL) },
  ].filter((g) => g.links.length > 0);
}
```

(The test's KNOWN set includes `/`, so the explicit Home entry passes; `clean()` strips `/` and `/coming-soon` from the NAV/footer-derived links.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/siteMap.test.ts`
Expected: PASS.

- [ ] **Step 5: Create the page**

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { Section, SectionHead } from "@/components/ui/Section";
import { buildMetadata } from "@/lib/seo/buildMetadata";
import { PageJsonLd } from "@/components/seo/PageJsonLd";
import { buildSiteMap } from "@/lib/siteMap";

export function generateMetadata(): Promise<Metadata> {
  return buildMetadata("/sitemap", {
    title: "Site Map",
    description:
      "A complete map of msfg.us — buy, refinance, home equity, rates, loan officers, applications, and all legal and licensing pages in one place.",
    canonical: "/sitemap",
  });
}

export default function SiteMapPage() {
  const groups = buildSiteMap();
  return (
    <>
      <PageJsonLd path="/sitemap" />
      <Section>
        <SectionHead eyebrow="Site Map" title="Everything on msfg.us" />
        <div className="grid gap-10 min-[981px]:grid-cols-2">
          {groups.map((g) => (
            <nav key={g.heading} aria-label={g.heading}>
              <h2 className="mb-3 text-[18px] font-bold text-ink">{g.heading}</h2>
              <ul className="space-y-2">
                {g.links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="text-[15px] font-semibold text-spring-3 hover:underline"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </Section>
    </>
  );
}
```

- [ ] **Step 6: Add `"/sitemap"` to `src/app/sitemap.ts` ROUTES.**
- [ ] **Step 7: Typecheck + commit**

```bash
npx tsc --noEmit && npx vitest run src/lib/siteMap.test.ts
git add src/lib/siteMap.ts src/lib/siteMap.test.ts "src/app/(marketing)/sitemap" src/app/sitemap.ts
git commit -m "feat(legal): human-readable HTML site map"
```

---

## Task 13: Coming Soon page (noindex)

**Files:**
- Create: `src/app/(marketing)/coming-soon/page.tsx`

NOT added to the sitemap ROUTES. Forced `noindex,nofollow` even in production by overriding the robots field after `buildMetadata`.

- [ ] **Step 1: Create the page**

```tsx
import type { Metadata } from "next";
import { Mark } from "@/components/ui/Mark";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { getTenantConfig } from "@/server/tenant/config";
import { buildMetadata } from "@/lib/seo/buildMetadata";

export async function generateMetadata(): Promise<Metadata> {
  const meta = await buildMetadata("/coming-soon", {
    title: "Coming soon",
    description:
      "This page is on the way. Meanwhile, start your application or reach a licensed MSFG loan officer.",
  });
  return { ...meta, robots: { index: false, follow: false } };
}

export default async function ComingSoonPage() {
  const config = await getTenantConfig();
  return (
    <Section>
      <div className="mx-auto max-w-[620px] py-10 text-center">
        <span className="mb-4 inline-flex items-center gap-2.5 text-green-600">
          <Mark size={20} label={config.brand.shortName} />
          <span className="text-[13px] font-semibold tracking-[0.02em]">Coming soon</span>
        </span>
        <h1 className="text-[clamp(30px,4vw,46px)] font-extrabold tracking-[-0.03em] text-ink">
          We&rsquo;re building this page
        </h1>
        <p className="mx-auto mt-4 max-w-[48ch] text-[18px] text-muted">
          This part of the site isn&rsquo;t ready yet. In the meantime, start your application or
          talk to a licensed {config.brand.shortName} loan officer — we&rsquo;re here to help.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Button href="/apply/buy" variant="green">
            Start an application
          </Button>
          <Button href="/loan-officers" variant="ghost">
            Find a loan officer
          </Button>
        </div>
      </div>
    </Section>
  );
}
```

(`ghost` is a valid `Button` variant per the design system — green|ghostDark|white|dark|ghost.)

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add "src/app/(marketing)/coming-soon"
git commit -m "feat(legal): shared Coming Soon page (noindex)"
```

---

## Task 14: Footer — Equal Housing Opportunity logo

**Files:**
- Modify: `src/components/Footer.tsx`

- [ ] **Step 1: Import the component**

Add to the imports at the top of `src/components/Footer.tsx`:

```tsx
import { EqualHousing } from "@/components/legal/EqualHousing";
```

- [ ] **Step 2: Wrap the legal strip with the logo**

Replace the closing legal-strip paragraph (currently):

```tsx
        <p className="mt-12 border-t border-line pt-6 text-[12.5px] leading-relaxed text-muted">
          {legalStrip} Hosted on AWS.
        </p>
```

with:

```tsx
        <div className="mt-12 flex items-start gap-3 border-t border-line pt-6">
          <EqualHousing size={30} className="mt-0.5 shrink-0 text-muted" />
          <p className="text-[12.5px] leading-relaxed text-muted">
            {legalStrip} Hosted on AWS.
          </p>
        </div>
```

- [ ] **Step 3: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/components/Footer.tsx
git commit -m "feat(legal): Equal Housing Opportunity logo in the footer legal strip"
```

---

## Task 15: Rewire nav + footer links

**Files:**
- Modify: `src/content/nav.ts`
- Test: `src/content/nav.test.ts`

(Family-of-companies hrefs were already flipped in T2 Step 7.)

- [ ] **Step 1: Write the failing guard test**

```ts
import { describe, it, expect } from "vitest";
import { NAV, FOOTER_COLUMNS, FOOTER_LEGAL_LINKS, type NavLink } from "@/content/nav";

const KNOWN = new Set([
  "/", "/buy", "/refinance", "/home-equity", "/rates", "/loan-officers", "/developers",
  "/apply/buy", "/apply/refi", "/apply/cash", "/coming-soon",
  "/licensing", "/privacy-notice", "/privacy-policy", "/terms", "/accessibility",
  "/nmls-consumer-access", "/sitemap",
]);

function allLinks(): NavLink[] {
  return [
    ...NAV.flatMap((n) => [{ label: n.label, href: n.href }, ...n.items]),
    ...FOOTER_COLUMNS.flatMap((c) => c.links),
    ...FOOTER_LEGAL_LINKS,
  ];
}

describe("nav/footer links", () => {
  it("no internal link is the bare-home placeholder", () => {
    for (const l of allLinks()) {
      if (l.href.startsWith("http")) continue;
      expect(l.href, l.label).not.toBe("/");
    }
  });

  it("every internal link resolves to a known route", () => {
    for (const l of allLinks()) {
      if (l.href.startsWith("http")) continue;
      expect(KNOWN.has(l.href), `${l.label} -> ${l.href}`).toBe(true);
    }
  });

  it("exposes the new legal links", () => {
    const hrefs = FOOTER_LEGAL_LINKS.map((l) => l.href);
    for (const h of ["/licensing", "/privacy-notice", "/privacy-policy", "/terms", "/accessibility", "/nmls-consumer-access", "/sitemap"]) {
      expect(hrefs).toContain(h);
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/content/nav.test.ts`
Expected: FAIL — many `/` placeholders + missing legal links.

- [ ] **Step 3: Replace the link data in `src/content/nav.ts`**

Replace the `NAV` Buy/Refinance/Home Equity item arrays' calculator hrefs and the footer arrays. Apply these exact changes:

In `NAV` → **Buy** `items`, change the three calculators to `/coming-soon`:
```ts
      { label: "Affordability calculator", href: "/coming-soon" },
      { label: "Mortgage calculator", href: "/coming-soon" },
      { label: "Rent vs buy calculator", href: "/coming-soon" },
```
(Leave "Apply now" `/apply/buy`, "Purchase rates" `/rates`, "Find an agent" `/loan-officers`, "VA loans" `/buy`.)

In `NAV` → **Refinance** `items`:
```ts
      { label: "Cash-out calculator", href: "/coming-soon" },
```
(Leave "Apply now" `/apply/refi`, "Refinance rates" `/rates`.)

In `NAV` → **Home Equity** `items`:
```ts
      { label: "Calculate your cash", href: "/coming-soon" },
```
(Leave "Apply now" `/apply/cash`; leave "HELOC vs. cash-out" `/home-equity` — it's a content link to a real page.)

Replace the whole `FOOTER_COLUMNS` constant with:
```ts
export const FOOTER_COLUMNS: FooterColumn[] = [
  {
    heading: "Resources",
    links: [
      { label: "Affordability calculator", href: "/coming-soon" },
      { label: "Mortgage calculator", href: "/coming-soon" },
      { label: "Rent vs buy calculator", href: "/coming-soon" },
      { label: "HELOC calculator", href: "/coming-soon" },
      { label: "Buy a home", href: "/buy" },
      { label: "Get home inspection", href: "/coming-soon" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "About us", href: "/coming-soon" },
      { label: "Careers", href: "/coming-soon" },
      { label: "Media", href: "/coming-soon" },
      { label: "Partner with us", href: "/coming-soon" },
      { label: "Loan officers", href: "/loan-officers" },
      { label: "Developers", href: "/developers" },
      { label: "FAQs", href: "/coming-soon" },
    ],
  },
];
```

Replace the whole `FOOTER_LEGAL_LINKS` constant with:
```ts
/** Contact & legal links column (rendered with live contact details). */
export const FOOTER_LEGAL_LINKS: NavLink[] = [
  { label: "Licensing & Disclosures", href: "/licensing" },
  { label: "Privacy Notice", href: "/privacy-notice" },
  { label: "Privacy Policy", href: "/privacy-policy" },
  { label: "Terms of Use", href: "/terms" },
  { label: "Accessibility", href: "/accessibility" },
  { label: "NMLS Consumer Access", href: "/nmls-consumer-access" },
  { label: "Site Map", href: "/sitemap" },
];
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/content/nav.test.ts`
Expected: PASS (3).

- [ ] **Step 5: Commit**

```bash
git add src/content/nav.ts src/content/nav.test.ts
git commit -m "feat(legal): rewire footer/nav links to real pages + coming-soon"
```

---

## Task 16: Soft-pull copy teardown

Removes the three soft-pull marketing claims (no wiring exists — copy only). The self-reported `creditBand` step is unaffected.

**Files:**
- Modify: `src/app/(marketing)/buy/page.tsx`
- Modify: `src/content/categories.ts`
- Modify: `src/content/ai-script.ts`

- [ ] **Step 1: `buy/page.tsx` — rewrite the description**

Replace (lines 9–10):
```ts
    description:
      "Get a soft-pull pre-approval with no credit impact, shop with confidence, and close in 21 days. Conventional, FHA, VA, and USDA loans with a local loan officer on call.",
```
with:
```ts
    description:
      "Get pre-approved with a local MSFG loan officer, shop with confidence, and close in about 21 days. Conventional, FHA, VA, and USDA home loans, guided start to finish.",
```

- [ ] **Step 2: `categories.ts` — rewrite the step-1 copy**

Replace (around line 132–135):
```ts
      [
        "Get pre-approved",
        "Answer a few questions for a soft-pull pre-approval — no credit impact.",
      ],
```
with:
```ts
      [
        "Get pre-approved",
        "Answer a few quick questions and connect with a licensed loan officer to get pre-approved — no credit pull on this site.",
      ],
```

- [ ] **Step 3: `ai-script.ts` — rewrite the bullet**

Replace (line 18):
```ts
        "We run a soft credit check that won't affect your score.",
```
with:
```ts
        "No credit pull happens here — a licensed loan officer reviews credit later, only when you're ready.",
```

- [ ] **Step 4: Verify no soft-pull copy remains**

Run: `grep -rin "soft.pull\|soft credit\|no credit impact" src/`
Expected: no matches (the only hits before were these three).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(marketing)/buy/page.tsx" src/content/categories.ts src/content/ai-script.ts
git commit -m "fix(content): remove soft-pull claims (feature not built/wired)"
```

---

## Task 17: SEO quick-wins — rates description, developers metadata + sitemap, legal sitemap priority

**Files:**
- Modify: `src/app/(marketing)/rates/page.tsx`
- Modify: `src/app/(marketing)/developers/page.tsx`
- Modify: `src/app/sitemap.ts`
- Modify: `src/app/sitemap.helpers.ts`
- Test: `src/app/sitemap.helpers.test.ts` (create)

- [ ] **Step 1: `rates/page.tsx` — extend the description to 150–160 chars**

Replace (lines 14–15):
```ts
    description:
      "Transparent purchase and refinance mortgage rates from MSFG, updated every business day. See estimated monthly payments and start your application.",
```
with:
```ts
    description:
      "Transparent purchase and refinance mortgage rates from MSFG across seven states, updated every business day. See estimated monthly payments and apply online.",
```

- [ ] **Step 2: `developers/page.tsx` — route metadata through `buildMetadata`**

Replace the `generateMetadata` (lines 9–16) with:
```ts
export async function generateMetadata(): Promise<Metadata> {
  const config = await getTenantConfig();
  return buildMetadata("/developers", {
    title: "Developers — Public API",
    description: `${config.brand.shortName} public API for partners: versioned, key-authenticated, rate-limited, and OpenAPI-documented. Rates, programs, loan officers, and lead intake.`,
    canonical: "/developers",
  });
}
```
Add the import at the top of the file:
```ts
import { buildMetadata } from "@/lib/seo/buildMetadata";
```
(`getTenantConfig` is already imported. The page keeps its existing `<h1>`.)

- [ ] **Step 3: `sitemap.ts` — add `/developers` and confirm legal routes are present**

Ensure the `ROUTES` array contains `"/developers"` and the seven legal routes added in T6–T12. Final array:
```ts
const ROUTES = [
  "",
  "/buy",
  "/refinance",
  "/home-equity",
  "/rates",
  "/loan-officers",
  "/developers",
  "/apply/buy",
  "/apply/refi",
  "/apply/cash",
  "/licensing",
  "/privacy-notice",
  "/privacy-policy",
  "/terms",
  "/accessibility",
  "/nmls-consumer-access",
  "/sitemap",
];
```
(`/coming-soon` is intentionally absent.)

- [ ] **Step 4: `sitemap.helpers.ts` — lower priority + yearly changefreq for legal pages**

Write the failing test first — create `src/app/sitemap.helpers.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { defaultPriority, defaultChangefreq, sitemapEntry } from "./sitemap.helpers";

describe("sitemap helpers", () => {
  it("legal pages get low priority + yearly changefreq", () => {
    expect(defaultPriority("/privacy-policy")).toBeLessThan(0.5);
    expect(defaultChangefreq("/terms")).toBe("yearly");
  });
  it("marketing pages keep their priority", () => {
    expect(defaultPriority("/buy")).toBe(0.8);
    expect(defaultPriority("")).toBe(1);
  });
  it("respects PAGE_SEO include=false", () => {
    expect(sitemapEntry("https://x", "/buy", { include: false })).toBeNull();
  });
});
```
Run: `npx vitest run src/app/sitemap.helpers.test.ts` → FAIL (legal not special-cased).

Then update `sitemap.helpers.ts` — add a legal-route set and branch:
```ts
const LEGAL_ROUTES = new Set([
  "/licensing", "/privacy-notice", "/privacy-policy", "/terms",
  "/accessibility", "/nmls-consumer-access", "/sitemap",
]);

export function defaultPriority(route: string): number {
  if (route === "") return 1;
  if (LEGAL_ROUTES.has(route)) return 0.3;
  if (route.startsWith("/apply")) return 0.6;
  return 0.8;
}

export function defaultChangefreq(route: string): Changefreq {
  if (route === "/rates") return "daily";
  if (LEGAL_ROUTES.has(route)) return "yearly";
  return "weekly";
}
```
Re-run: `npx vitest run src/app/sitemap.helpers.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit
git add "src/app/(marketing)/rates/page.tsx" "src/app/(marketing)/developers/page.tsx" src/app/sitemap.ts src/app/sitemap.helpers.ts src/app/sitemap.helpers.test.ts
git commit -m "feat(seo): rates desc, developers metadata via buildMetadata + sitemap, legal sitemap priority"
```

---

## Task 18: Legal content structure test + full unit run

**Files:**
- Test: `src/content/legal/legal.test.ts`

- [ ] **Step 1: Write the structure-integrity test**

```ts
import { describe, it, expect } from "vitest";
import { DEFAULT_TENANT_CONFIG } from "@/content/site";
import { privacyPolicyDoc } from "@/content/legal/privacyPolicy";
import { privacyNoticeDoc, glbaRows } from "@/content/legal/privacyNotice";
import { termsDoc } from "@/content/legal/terms";
import { accessibilityDoc } from "@/content/legal/accessibility";
import { licensingDoc } from "@/content/legal/licensing";
import type { LegalDoc } from "@/content/legal/types";

const C = DEFAULT_TENANT_CONFIG;
const docs: Record<string, LegalDoc> = {
  privacyPolicy: privacyPolicyDoc(C),
  privacyNotice: privacyNoticeDoc(C),
  terms: termsDoc(C),
  accessibility: accessibilityDoc(C),
  licensing: licensingDoc(C),
};

describe("legal docs", () => {
  for (const [name, doc] of Object.entries(docs)) {
    it(`${name} has sections with non-empty headings and blocks`, () => {
      expect(doc.sections.length).toBeGreaterThan(0);
      for (const s of doc.sections) {
        expect(s.heading.trim().length).toBeGreaterThan(0);
        expect(s.blocks.length).toBeGreaterThan(0);
      }
    });
  }

  it("glbaRows returns the standard sharing matrix", () => {
    expect(glbaRows(C).length).toBeGreaterThanOrEqual(6);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/content/legal/legal.test.ts`
Expected: PASS (imports resolve; docs well-formed). If any module export name differs, fix the export to match (`privacyPolicyDoc`, `privacyNoticeDoc`, `glbaRows`, `termsDoc`, `accessibilityDoc`, `licensingDoc`).

- [ ] **Step 3: Full unit run + typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all tests PASS, no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/content/legal/legal.test.ts
git commit -m "test(legal): legal content structure integrity"
```

---

## Task 19: Compliance pass + browser verification

**Files:** none (verification + a written compliance checklist committed as a doc).

- [ ] **Step 1: Build to catch route/SSG errors**

Run: `npx next build` (the local dev DB must be up — `npm run db:up`).
Expected: build succeeds; the new routes appear in the build output.

- [ ] **Step 2: Browser pass (preview)** — start the dev server and verify each new page renders:
  - `/licensing`, `/privacy-notice`, `/privacy-policy`, `/terms`, `/accessibility`, `/nmls-consumer-access`, `/sitemap`, `/coming-soon`.
  - Each has exactly one `<h1>`; legal pages show the review banner + the EHO logo + the legal strip; the GLBA table renders on `/privacy-notice`; the license table on `/licensing`.
  - `/coming-soon` `<meta name="robots">` is `noindex,nofollow` (view source / preview snapshot).
  - Footer shows the EHO logo and the new legal links; click each footer/nav link — none 404s; calculators + dead links land on `/coming-soon`.
  - `/buy` no longer mentions a soft pull (view the meta description + the "How it works" step).
  - Mobile (≤980px) + reduced-motion + link contrast (spring-3 on paper) look right.

- [ ] **Step 3: Write the compliance checklist** — create `docs/superpowers/specs/2026-06-14-legal-compliance-checklist.md` mapping each requirement → where it's satisfied (global footer legal strip + EHO logo; Licensing page; GLBA notice; per-page disclosures; rates disclaimer; apply TCPA) and listing every `[PLACEHOLDER]` that must be real before launch (NMLS #, per-state license numbers, registered address, privacy/compliance email, effective dates, governing-law/arbitration terms) + the "route drafted legal text through counsel; remove the review banner per page once approved" reminder.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-06-14-legal-compliance-checklist.md
git commit -m "docs(legal): pre-launch compliance checklist"
```

---

## Deferred (optional per spec)

- Feeding `config.legal.address` into the JSON-LD `localBusinessSchema` (`src/lib/schema.ts`) as a `PostalAddress` — the spec marks this optional ("only if present"), and the address is `[PLACEHOLDER]` until real data lands, so it carries no SEO value yet. Add when the real address is supplied. The Licensing page already surfaces the address from config.

## Done criteria

- `npx vitest run` green; `npx tsc --noEmit` clean; `npx next build` succeeds.
- No internal nav/footer/family link points to `/`; dead links + calculators resolve to `/coming-soon`; `/coming-soon` is `noindex` and excluded from the XML sitemap.
- Seven legal pages render with consistent chrome, the EHO logo, the legal strip, and the pending-review banner; the GLBA table + license table render.
- No soft-pull copy remains in `src/`.
- `/developers` is in the XML sitemap; `/rates` description is 150–160 chars.
- The compliance checklist enumerates every `[PLACEHOLDER]` owed before launch.
