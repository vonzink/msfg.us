# Sub-Brand Pages, About, Careers & Know Your Lender — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship 7 new marketing pages — 4 category-style sub-brand pages (Veterans, Reverse, Investment, Commercial) with the floating MSFG-AI chat, plus About, Careers, and Know Your Lender — and retire two dead footer links.

**Architecture:** Generalize the in-application Ask-AI panel into a reusable `AskAiLauncher` (floating button + single-thread chat against `/api/v1/ai/chat`). Render sub-brand pages through the existing `CategoryPage`, made flexible (optional `intent`/`quote`/`ctaHref`) so products without an apply funnel or payment estimator (Reverse, Commercial) still get the rich layout. About/Careers/Know-Your-Lender are lighter content pages (mini-hero + `Section` + `CtaBand`). Wire nav/footer/family/sitemap + the link guard test.

**Tech Stack:** Next.js 16 App Router, React 19 server components + client islands, TypeScript, Tailwind v4 tokens, vitest. Reuses `CategoryPage`, `Section`/`Mark`/`Button`/`CtaBand`, `ApplyChatPanel`/`useApplyChat`.

**Spec:** `docs/superpowers/specs/2026-06-15-subbrand-marketing-pages-design.md`

---

## File Structure

**New**
- `src/components/ai/AskAiLauncher.tsx` — `"use client"` floating "Ask AI" button + state + `ApplyChatPanel`.
- `src/app/(marketing)/veterans/page.tsx`, `reverse/`, `investment/`, `commercial/` — sub-brand routes.
- `src/content/offices.ts` (+ `offices.test.ts`) — office directory for About.
- `src/app/(marketing)/about/page.tsx`, `careers/page.tsx`, `know-your-lender/page.tsx`.

**Modified**
- `src/components/apply/ask-ai/ApplyChatPanel.tsx` — `intent` → `starters: string[]`, `stepQuestion?` optional.
- `src/components/apply/Wizard.tsx` — pass `starters={APPLY_CHAT_STARTERS[intent]}`.
- `src/content/categories.ts` — optional `intent`/`quote`/`ctaHref`; widen `CategoryKey`; add 4 sub-brand configs (+ `categories.test.ts`).
- `src/components/category/CategoryPage.tsx` — conditional estimator/hero columns + configurable primary href.
- `src/content/nav.ts` — remove 2 links; repoint About/Careers; add Know Your Lender.
- `src/content/site.ts` — repoint 4 family-card hrefs.
- `src/app/sitemap.ts` — add 7 routes. `src/content/nav.test.ts` — add 7 routes to KNOWN.

---

## Task 1: Generalize the Ask-AI panel + AskAiLauncher

**Files:**
- Modify: `src/components/apply/ask-ai/ApplyChatPanel.tsx`
- Create: `src/components/ai/AskAiLauncher.tsx`
- Modify: `src/components/apply/Wizard.tsx`

- [ ] **Step 1: Make `ApplyChatPanel` starters-driven**

In `src/components/apply/ask-ai/ApplyChatPanel.tsx`: (a) remove the `Intent` import and the `APPLY_CHAT_STARTERS` import (keep `stepHelpPrompt`); (b) change the props — replace `intent: Intent` with `starters: string[]`, and make `stepQuestion?: string` optional; (c) delete the line `const starters = APPLY_CHAT_STARTERS[intent] ?? [];` (the `starters` prop is used directly); (d) gate the step chip on `stepQuestion`.

Props block becomes:
```tsx
export function ApplyChatPanel({
  open,
  onClose,
  starters,
  assistantName,
  shortName,
  iconSrc,
  stepQuestion,
  returnFocusRef,
}: {
  open: boolean;
  onClose: () => void;
  starters: string[];
  assistantName: string;
  shortName: string;
  iconSrc: string;
  stepQuestion?: string;
  returnFocusRef?: RefObject<HTMLButtonElement | null>;
}) {
```
Imports: change `import { APPLY_CHAT_STARTERS, stepHelpPrompt } from "@/content/applyChatStarters";` to `import { stepHelpPrompt } from "@/content/applyChatStarters";` and remove `import type { Intent } from "@/content/flows";`.

The "Help me with this step" chip (currently always rendered) becomes conditional:
```tsx
{stepQuestion && (
  <button type="button" onClick={() => chat.send(stepHelpPrompt(stepQuestion))} className={chipClass}>
    Help me with this step
  </button>
)}
```

- [ ] **Step 2: Create `AskAiLauncher`**

```tsx
"use client";

import { useRef, useState } from "react";
import { Mark } from "@/components/ui/Mark";
import { ApplyChatPanel } from "@/components/apply/ask-ai/ApplyChatPanel";

/** Floating "Ask AI" button + single-thread chat panel for any marketing page.
 *  Reuses ApplyChatPanel (→ /api/v1/ai/chat). `starters` are the page-specific
 *  suggestion chips. */
export function AskAiLauncher({
  starters,
  assistantName,
  shortName,
  iconSrc,
}: {
  starters: string[];
  assistantName: string;
  shortName: string;
  iconSrc: string;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Ask ${assistantName}`}
        className="fixed bottom-6 right-6 z-40 flex h-14 items-center gap-2.5 rounded-full bg-green-800 py-0 pl-2.5 pr-5 text-[15px] font-bold text-white shadow-pop transition-transform duration-150 hover:-translate-y-0.5"
      >
        <Mark size={36} label={shortName} /> Ask AI
      </button>
      <ApplyChatPanel
        open={open}
        onClose={() => setOpen(false)}
        starters={starters}
        assistantName={assistantName}
        shortName={shortName}
        iconSrc={iconSrc}
        returnFocusRef={btnRef}
      />
    </>
  );
}
```

- [ ] **Step 3: Update the Wizard call site**

In `src/components/apply/Wizard.tsx`: add `import { APPLY_CHAT_STARTERS } from "@/content/applyChatStarters";` near the other content imports, and change the `<ApplyChatPanel>` props — replace `intent={intent}` with `starters={APPLY_CHAT_STARTERS[intent]}` (keep `stepQuestion={step.q}` and all other props).

- [ ] **Step 4: Verify (typecheck + tests + lint)**

Run: `npx tsc --noEmit && npx vitest run && npx eslint src/components/apply src/components/ai`
Expected: clean; 217 tests still pass (the wizard behavior is unchanged — it now passes the same starter list through a prop).

- [ ] **Step 5: Commit**

```bash
git add src/components/apply/ask-ai/ApplyChatPanel.tsx src/components/ai/AskAiLauncher.tsx src/components/apply/Wizard.tsx
git commit -m "refactor(ai): starters-driven ApplyChatPanel + reusable AskAiLauncher"
```

---

## Task 2: Make `CategoryPage` flexible (optional intent/quote/ctaHref)

Backward-compatible: buy/refi/equity keep `intent` + `quote`, so they render identically.

**Files:**
- Modify: `src/content/categories.ts`
- Modify: `src/components/category/CategoryPage.tsx`

- [ ] **Step 1: Loosen the `CategoryConfig` type + widen the key**

In `src/content/categories.ts`:
- Change `intent: Intent;` to `intent?: Intent;` and add `ctaHref?: string;` (explicit primary/programs link; defaults to `/apply/${intent}`). Add a doc line: `/** Primary CTA + program-card href. Defaults to /apply/{intent}. Set for products with no apply funnel (e.g. /loan-officers). */`.
- Change `quote: QuickEstimateConfig;` to `quote?: QuickEstimateConfig;` and update its doc to "Live-estimator config; omit for products without a payment estimate (the hero renders single-column)."
- Widen `export type CategoryKey = "buy" | "refi" | "equity";` to `export type CategoryKey = "buy" | "refi" | "equity" | "veterans" | "reverse" | "investment" | "commercial";`

(No change to the buy/refi/equity config objects — they keep `intent` + `quote`.)

- [ ] **Step 2: Make `CategoryPage` honor the optional fields**

In `src/components/category/CategoryPage.tsx`, replace the `applyHref` line and the hero grid + estimator so an absent `quote` yields a single-column hero and `ctaHref` overrides the apply link.

Replace:
```tsx
  const c = CATS[cat];
  const applyHref = `/apply/${c.intent}`;
```
with:
```tsx
  const c = CATS[cat];
  const primaryHref = c.ctaHref ?? (c.intent ? `/apply/${c.intent}` : "/loan-officers");
```
Then replace every `href={applyHref}` with `href={primaryHref}` (the hero CTA on ~line 61 and the program-card `<Link>` on ~line 113).

Replace the hero grid container + right column so it's 2-col only when there's a quote:
```tsx
        <div className={c.quote
          ? "wrap relative grid grid-cols-[1.15fr_0.85fr] items-center gap-14 max-[980px]:grid-cols-1 max-[980px]:gap-9"
          : "wrap relative"}>
```
And wrap the estimator column so it only renders with a quote (and an intent for the QuickEstimate):
```tsx
          {c.quote && c.intent && (
            <div id="estimate">
              <QuickEstimate q={c.quote} intent={c.intent} />
            </div>
          )}
```

- [ ] **Step 3: Verify buy/refi/equity unchanged**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean; tests pass. (Optional manual: the `/buy` hero still shows the estimator — confirmed in T9 browser pass.)

- [ ] **Step 4: Commit**

```bash
git add src/content/categories.ts src/components/category/CategoryPage.tsx
git commit -m "feat(category): optional intent/quote/ctaHref so non-apply products use the template"
```

---

## Task 3: Sub-brand category configs + integrity test

**Files:**
- Modify: `src/content/categories.ts`
- Test: `src/content/categories.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { CATS, type CategoryKey } from "./categories";

const SUBBRANDS: CategoryKey[] = ["veterans", "reverse", "investment", "commercial"];

describe("sub-brand category configs", () => {
  for (const key of SUBBRANDS) {
    it(`${key} is a well-formed category`, () => {
      const c = CATS[key];
      expect(c).toBeTruthy();
      expect(c.tag).toBeTruthy();
      expect(c.h1[0].length + c.h1[1].length).toBeGreaterThan(0);
      expect(c.sub).toBeTruthy();
      expect(c.cta).toBeTruthy();
      expect(c.steps).toHaveLength(4);
      expect(c.opts.length).toBeGreaterThan(0);
      // either an apply intent or an explicit CTA href must exist
      expect(Boolean(c.intent) || Boolean(c.ctaHref)).toBe(true);
    });
  }
  it("reverse + commercial route to a loan officer (no apply funnel)", () => {
    expect(CATS.reverse.ctaHref).toBe("/loan-officers");
    expect(CATS.commercial.ctaHref).toBe("/loan-officers");
    expect(CATS.reverse.quote).toBeUndefined();
    expect(CATS.commercial.quote).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/content/categories.test.ts`
Expected: FAIL — `CATS.veterans` etc. undefined.

- [ ] **Step 3: Add the 4 configs to `CATS`**

Add these entries inside the `CATS` object in `src/content/categories.ts` (after `equity`):

```ts
  veterans: {
    intent: "buy",
    tag: "MSFG Veterans",
    crumb: "Veterans",
    h1: ["Your VA benefit. ", "Maximized."],
    sub: "VA purchase, refinance, and IRRRL — benefit-focused lending for veterans, active-duty service members, and eligible surviving spouses.",
    cta: "Get pre-approved",
    stats: [
      ["$0", "down payment"],
      ["No PMI", "ever"],
      ["4.9★", "612 reviews"], // [PLACEHOLDER]
    ],
    quote: {
      title: "Estimate your payment",
      apr: 6.375, // [PLACEHOLDER]
      principal: "priceDown",
      termMonths: 360,
      inputs: [
        { label: "Home price", kind: "price", default: 485000 },
        { label: "Down payment", kind: "downPct", default: 0 },
      ],
    },
    steps: [
      ["Confirm eligibility", "We help you obtain your Certificate of Eligibility (COE) and confirm your entitlement."],
      ["Get pre-approved", "A few quick questions and a licensed VA-savvy loan officer — no credit pull on this site."],
      ["Find your home", "Shop with a $0-down, no-PMI pre-approval sellers take seriously."],
      ["Close & move in", "We drive appraisal, title, and conditions to a smooth closing."],
    ],
    optsTitle: "VA loan options",
    opts: [
      { icon: "va", title: "VA purchase", desc: "0% down, no monthly PMI, competitive rates.", audience: "Buyers" },
      { icon: "va", title: "VA IRRRL", desc: "Streamlined rate-reduction refinance of an existing VA loan.", audience: "Lower payment" },
      { icon: "cashout", title: "VA cash-out", desc: "Tap equity or refinance a non-VA loan into a VA loan.", audience: "Access equity" },
      { icon: "jumbo", title: "VA jumbo", desc: "High-balance VA financing above conforming limits.", audience: "High-cost areas" },
    ],
  },

  investment: {
    intent: "buy",
    tag: "MSFG Investment",
    crumb: "Investment",
    h1: ["Build wealth, ", "one property at a time."],
    sub: "Financing for rental properties, DSCR loans, second homes, and portfolio investors — qualify on the property's cash flow, not just your W-2.",
    cta: "Start my application",
    stats: [
      ["DSCR", "qualify on rent"],
      ["1–4 units", "& portfolios"], // [PLACEHOLDER]
      ["4.9★", "612 reviews"], // [PLACEHOLDER]
    ],
    quote: {
      title: "Estimate your payment",
      apr: 7.125, // [PLACEHOLDER]
      principal: "priceDown",
      termMonths: 360,
      inputs: [
        { label: "Purchase price", kind: "price", default: 425000 },
        { label: "Down payment", kind: "downPct", default: 25 },
      ],
    },
    steps: [
      ["Tell us the deal", "Property, rents, and your goals — we match the right program."],
      ["Get pre-approved", "DSCR options qualify on the property's cash flow; full-doc options also available."],
      ["Lock & underwrite", "We coordinate appraisal, rent schedule, and conditions."],
      ["Close & scale", "Fund this one, then come back for the next."],
    ],
    optsTitle: "Investment loan options",
    opts: [
      { icon: "cashout", title: "DSCR", desc: "Qualify on the property's rental cash flow — no personal income docs.", audience: "Rental investors" },
      { icon: "conv", title: "Conventional investment", desc: "Up to 4 financed units with competitive conventional terms.", audience: "Full-doc buyers" },
      { icon: "fha", title: "Second home", desc: "Financing for a vacation or secondary residence.", audience: "Second homes" },
      { icon: "jumbo", title: "Portfolio & jumbo", desc: "Higher loan amounts and multi-property portfolios.", audience: "Scaling investors" },
    ],
  },

  reverse: {
    // No apply funnel + no payment estimator — specialist consult.
    ctaHref: "/loan-officers",
    tag: "MSFG Reverse",
    crumb: "Reverse",
    h1: ["Tap your equity. ", "Stay in your home."],
    sub: "A reverse mortgage (HECM) lets homeowners 62+ convert home equity into cash — with no required monthly mortgage payment, while you keep the title to your home.",
    cta: "Talk to a reverse specialist",
    stats: [
      ["62+", "eligible age"],
      ["$0", "required monthly payment"], // [PLACEHOLDER]
      ["FHA-insured", "HECM"], // [PLACEHOLDER]
    ],
    steps: [
      ["See if you qualify", "Homeowners 62+ with sufficient equity in a primary residence may be eligible."],
      ["Independent counseling", "A HUD-approved counselor reviews the program with you — required and protective."],
      ["Appraisal & approval", "We order the appraisal and confirm your available proceeds."],
      ["Receive your funds", "Take a lump sum, line of credit, monthly draws, or a combination."],
    ],
    optsTitle: "Reverse mortgage options",
    opts: [
      { icon: "heloc", title: "HECM", desc: "The FHA-insured Home Equity Conversion Mortgage for 62+.", audience: "Most common" },
      { icon: "conv", title: "HECM for Purchase", desc: "Buy a more suitable home and use a reverse mortgage in one step.", audience: "Right-sizing" },
      { icon: "cashout", title: "Reverse refinance", desc: "Refinance an existing reverse mortgage to better terms or more proceeds.", audience: "Existing borrowers" },
    ],
  },

  commercial: {
    // No consumer apply funnel — specialist consult.
    ctaHref: "/loan-officers",
    tag: "MSFG Commercial",
    crumb: "Commercial",
    h1: ["Financing for ", "business real estate."],
    sub: "Lending solutions for commercial property, multifamily, mixed-use, and investor-owned real estate — structured around your business and your asset.",
    cta: "Talk to a commercial specialist",
    stats: [
      ["Multifamily", "5+ units"], // [PLACEHOLDER]
      ["Mixed-use", "& retail"], // [PLACEHOLDER]
      ["Investor", "focused"], // [PLACEHOLDER]
    ],
    steps: [
      ["Tell us the project", "Property type, business plan, and goals frame the right structure."],
      ["Review scenarios", "We compare programs, rates, and terms across our lender network."],
      ["Underwrite & appraise", "We coordinate the commercial appraisal and due diligence."],
      ["Fund & grow", "Close with a partner who's ready for your next acquisition."],
    ],
    optsTitle: "Commercial loan options",
    opts: [
      { icon: "conv", title: "Multifamily", desc: "Apartment buildings and 5+ unit residential properties.", audience: "Multifamily" },
      { icon: "jumbo", title: "Mixed-use & retail", desc: "Storefronts, offices, and mixed-use buildings.", audience: "Mixed-use" },
      { icon: "cashout", title: "Investor / DSCR commercial", desc: "Cash-flow-based financing for investor-owned commercial real estate.", audience: "Investors" },
    ],
  },
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/content/categories.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit
git add src/content/categories.ts src/content/categories.test.ts
git commit -m "feat(content): Veterans/Reverse/Investment/Commercial category configs"
```

---

## Task 4: Four sub-brand route pages

**Files:**
- Create: `src/app/(marketing)/veterans/page.tsx`, `reverse/page.tsx`, `investment/page.tsx`, `commercial/page.tsx`
- Modify: `src/app/sitemap.ts`

- [ ] **Step 1: Create the four pages** (one per route — same shape, different `cat`, starters, and metadata).

`src/app/(marketing)/veterans/page.tsx`:
```tsx
import type { Metadata } from "next";
import { CategoryPage } from "@/components/category/CategoryPage";
import { AskAiLauncher } from "@/components/ai/AskAiLauncher";
import { PageJsonLd } from "@/components/seo/PageJsonLd";
import { buildMetadata } from "@/lib/seo/buildMetadata";
import { getTenantConfig } from "@/server/tenant/config";

const STARTERS = [
  "Am I eligible for a VA loan?",
  "Is there really $0 down?",
  "What is a VA IRRRL?",
  "Can I use my VA benefit more than once?",
];

export function generateMetadata(): Promise<Metadata> {
  return buildMetadata("/veterans", {
    title: "VA Loans for Veterans & Military — $0 Down | MSFG",
    description:
      "VA purchase, refinance, and IRRRL home loans from MSFG — $0 down, no PMI, for veterans, active-duty service members, and eligible spouses across seven states.",
    canonical: "/veterans",
  });
}

export default async function VeteransPage() {
  const config = await getTenantConfig();
  return (
    <>
      <PageJsonLd path="/veterans" />
      <CategoryPage cat="veterans" />
      <AskAiLauncher
        starters={STARTERS}
        assistantName={config.brand.assistantName}
        shortName={config.brand.shortName}
        iconSrc={config.brand.logos.mark}
      />
    </>
  );
}
```

Create the other three identically, substituting `cat`, `STARTERS`, the `buildMetadata("/<slug>", {...})` path/title/description, and the component name:

- **`reverse/page.tsx`** — `cat="reverse"`, title `"Reverse Mortgages (HECM) for Homeowners 62+ | MSFG"`, description `"Convert home equity to cash with an FHA-insured reverse mortgage (HECM) — no required monthly payment for homeowners 62+. Talk to an MSFG reverse specialist."`, STARTERS `["How does a reverse mortgage work?", "Am I eligible at 62+?", "Do I still own my home?", "How much can I access?"]`.
- **`investment/page.tsx`** — `cat="investment"`, title `"Investment Property & DSCR Loans | MSFG"`, description `"Finance rental properties, second homes, and portfolios with MSFG — including DSCR loans that qualify on the property's cash flow. Get pre-approved online."`, STARTERS `["What is a DSCR loan?", "Can I finance a rental property?", "How much down for an investment property?", "Do you finance 2–4 units?"]`.
- **`commercial/page.tsx`** — `cat="commercial"`, title `"Commercial Real Estate Loans | MSFG"`, description `"Commercial, multifamily, and mixed-use real estate financing from MSFG — structured around your business and your asset. Talk to a commercial specialist."`, STARTERS `["What property types do you finance?", "Do you finance multifamily?", "What is a commercial DSCR loan?", "How do I get started?"]`.

- [ ] **Step 2: Register the routes in the sitemap**

In `src/app/sitemap.ts`, add to the `ROUTES` array: `"/veterans"`, `"/reverse"`, `"/investment"`, `"/commercial"`.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(marketing)/veterans" "src/app/(marketing)/reverse" "src/app/(marketing)/investment" "src/app/(marketing)/commercial" src/app/sitemap.ts
git commit -m "feat(marketing): Veterans/Reverse/Investment/Commercial sub-brand pages + Ask AI"
```

---

## Task 5: Offices module + About page

**Files:**
- Create: `src/content/offices.ts`, `src/content/offices.test.ts`
- Create: `src/app/(marketing)/about/page.tsx`
- Modify: `src/app/sitemap.ts`

- [ ] **Step 1: Write the failing offices test**

```ts
import { describe, it, expect } from "vitest";
import { OFFICES } from "./offices";

describe("OFFICES", () => {
  it("lists the three MSFG offices with full details", () => {
    expect(OFFICES.length).toBe(3);
    for (const o of OFFICES) {
      expect(o.city).toBeTruthy();
      expect(o.address).toBeTruthy();
      expect(o.phone).toBeTruthy();
    }
    expect(OFFICES.map((o) => o.city)).toContain("Westminster");
  });
});
```

- [ ] **Step 2: Run it (fails — module missing).** `npx vitest run src/content/offices.test.ts`

- [ ] **Step 3: Create `src/content/offices.ts`**

```ts
/** MSFG office directory — shown on /about. Phones are from the live contact
 *  page and differ from the site-wide footer line; tagged [VERIFY] until the
 *  company confirms the canonical per-office numbers. */
export type Office = { city: string; address: string; phone: string; primary?: boolean };

export const OFFICES: Office[] = [
  {
    city: "Westminster",
    address: "9035 Wadsworth Parkway, Suite 3400, Westminster, CO 80021",
    phone: "(720) 838-6372", // [VERIFY]
    primary: true,
  },
  {
    city: "Bismarck",
    address: "1600 E Interstate Ave, Ste 4, Bismarck, ND 58503",
    phone: "(701) 955-0597", // [VERIFY]
  },
  {
    city: "Fargo",
    address: "1630 1st Ave N, Ste B, Fargo, ND 58102",
    phone: "(701) 561-8266", // [VERIFY]
  },
];
```

- [ ] **Step 4: Run the test (passes).** `npx vitest run src/content/offices.test.ts`

- [ ] **Step 5: Create the About page**

`src/app/(marketing)/about/page.tsx`:
```tsx
import type { Metadata } from "next";
import { Mark } from "@/components/ui/Mark";
import { Section, SectionHead } from "@/components/ui/Section";
import { CtaBand } from "@/components/CtaBand";
import { PageJsonLd } from "@/components/seo/PageJsonLd";
import { buildMetadata } from "@/lib/seo/buildMetadata";
import { getTenantConfig } from "@/server/tenant/config";
import { OFFICES } from "@/content/offices";

export function generateMetadata(): Promise<Metadata> {
  return buildMetadata("/about", {
    title: "About MSFG — Built on Service, Expertise & Preparation",
    description:
      "Mountain State Financial Group is built on excellent products and exceptional service — seasoned, licensed loan officers committed to transparency across seven states.",
    canonical: "/about",
  });
}

const PLEDGE: string[] = [
  "As our client, we are dedicated to providing you with an exceptional mortgage experience, guided by seasoned professionals committed to seeing your loan through from start to finish. At every stage of your home loan process, you can trust that our team will offer consistent support, expertise, and communication, ensuring every detail is addressed as seamlessly as possible.",
  "We understand that every homebuyer's needs are unique, and we are committed to finding the best mortgage solutions tailored to your individual goals and financial situation. If a product doesn't fully align with your present finances or future aspirations, we'll provide a thorough explanation, along with insights on how you might achieve an even better fit.",
  "Finally, we believe in making homeownership accessible and affordable. That's why we prioritize competitive pricing and always work to secure the best interest rates available in the market for our clients.",
];

export default async function AboutPage() {
  const config = await getTenantConfig();
  return (
    <>
      <PageJsonLd path="/about" />
      <section className="hero-bg px-0 pb-[56px] pt-14 text-center text-white">
        <div className="wrap">
          <span className="mb-3.5 inline-flex items-center gap-2.5 text-mint">
            <Mark size={18} label={config.brand.shortName} />
            <span className="text-[13px] font-semibold tracking-[0.02em]">About us</span>
          </span>
          <h1 className="m-0 text-[clamp(32px,4.6vw,52px)] font-extrabold tracking-[-0.035em]">
            Built on service, expertise, <span className="text-mint">and preparation.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-[60ch] text-[18px] text-on-dark-2">
            Excellent products. Exceptional service. These two commitments are the foundation of {config.brand.legalName}.
          </p>
        </div>
      </section>

      <Section>
        <div className="mx-auto max-w-[820px]">
          <SectionHead eyebrow="Our pledge to you" title="Your loan, seen through from start to finish." />
          <div className="space-y-4">
            {PLEDGE.map((p, i) => (
              <p key={i} className="text-[16px] leading-[1.6] text-ink">{p}</p>
            ))}
          </div>
        </div>
      </Section>

      <Section alt>
        <SectionHead eyebrow="Visit us" title="Our offices" />
        <div className="grid grid-cols-3 gap-5 max-[900px]:grid-cols-1">
          {OFFICES.map((o) => (
            <div key={o.city} className="rounded-lg border border-line bg-white p-6 shadow-3d">
              <h3 className="text-[18px] font-bold text-ink">
                {o.city}
                {o.primary && <span className="ml-2 text-[12px] font-bold text-green-600">HQ</span>}
              </h3>
              <p className="mt-2 text-[14.5px] leading-[1.5] text-muted">{o.address}</p>
              <a href={`tel:${o.phone.replace(/[^\d]/g, "")}`} className="mt-2 inline-block text-[14.5px] font-semibold text-green-600 hover:underline">
                {o.phone}
              </a>
            </div>
          ))}
        </div>
      </Section>

      <CtaBand />
    </>
  );
}
```

- [ ] **Step 6: Add `"/about"` to `sitemap.ts` ROUTES. Typecheck. Commit.**

```bash
npx tsc --noEmit
git add src/content/offices.ts src/content/offices.test.ts "src/app/(marketing)/about" src/app/sitemap.ts
git commit -m "feat(marketing): About page (pledge + offices) + offices module"
```

---

## Task 6: Careers page

**Files:**
- Create: `src/app/(marketing)/careers/page.tsx`
- Modify: `src/app/sitemap.ts`

- [ ] **Step 1: Create the page**

```tsx
import type { Metadata } from "next";
import { Mark } from "@/components/ui/Mark";
import { Section, SectionHead } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { CtaBand } from "@/components/CtaBand";
import { PageJsonLd } from "@/components/seo/PageJsonLd";
import { buildMetadata } from "@/lib/seo/buildMetadata";
import { getTenantConfig } from "@/server/tenant/config";

export function generateMetadata(): Promise<Metadata> {
  return buildMetadata("/careers", {
    title: "Careers at MSFG — Join Our Mortgage Team",
    description:
      "Build your mortgage career with Mountain State Financial Group. We're always looking for great loan officers who put clients first. Reach out to start a conversation.",
    canonical: "/careers",
  });
}

const VALUES: ReadonlyArray<readonly [string, string]> = [
  ["Clients first, always", "We never compromise on a client's financial well-being. Do right by people and the rest follows."],
  ["Transparency & clarity", "Plain-English communication and total transparency — with clients and with each other."],
  ["Seasoned support", "Work alongside experienced professionals who help you close from start to finish."],
  ["Built for growth", "Modern tools, a broad product set, and the autonomy to build your book your way."],
];

export default async function CareersPage() {
  const config = await getTenantConfig();
  // [PLACEHOLDER] dedicated careers inbox — falls back to the main contact email.
  const careersEmail = config.contact.email;
  return (
    <>
      <PageJsonLd path="/careers" />
      <section className="hero-bg px-0 pb-[56px] pt-14 text-center text-white">
        <div className="wrap">
          <span className="mb-3.5 inline-flex items-center gap-2.5 text-mint">
            <Mark size={18} label={config.brand.shortName} />
            <span className="text-[13px] font-semibold tracking-[0.02em]">Careers</span>
          </span>
          <h1 className="m-0 text-[clamp(32px,4.6vw,52px)] font-extrabold tracking-[-0.035em]">
            Do the best work <span className="text-mint">of your career.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-[58ch] text-[18px] text-on-dark-2">
            We&rsquo;re always looking for great loan officers and team members who put clients first. If that&rsquo;s you, let&rsquo;s talk.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Button href={`mailto:${careersEmail}?subject=Careers%20at%20MSFG`} variant="green">
              Get in touch
            </Button>
            <Button href={config.contact.phoneHref} variant="ghostDark">
              Call {config.contact.phoneDisplay}
            </Button>
          </div>
        </div>
      </section>

      <Section>
        <SectionHead eyebrow="Why MSFG" title="A team built on service." />
        <div className="grid grid-cols-2 gap-5 max-[900px]:grid-cols-1">
          {VALUES.map(([title, desc]) => (
            <div key={title} className="rounded-lg border border-line bg-white p-6 shadow-3d">
              <h3 className="text-[18px] font-bold text-ink">{title}</h3>
              <p className="mt-2 text-[14.5px] leading-[1.55] text-muted">{desc}</p>
            </div>
          ))}
        </div>
        <p className="mx-auto mt-10 max-w-[60ch] text-center text-[16px] leading-[1.6] text-ink">
          We don&rsquo;t always have a formal opening posted — but we always make room for the right person. Email{" "}
          <a href={`mailto:${careersEmail}`} className="font-semibold text-green-600 hover:underline">{careersEmail}</a>{" "}
          with a little about yourself and your experience, and we&rsquo;ll be in touch.
        </p>
      </Section>

      <CtaBand />
    </>
  );
}
```

- [ ] **Step 2: Add `"/careers"` to `sitemap.ts` ROUTES. Typecheck. Commit.**

```bash
npx tsc --noEmit
git add "src/app/(marketing)/careers" src/app/sitemap.ts
git commit -m "feat(marketing): Careers page (reach-out)"
```

---

## Task 7: Know Your Lender page

**Files:**
- Create: `src/app/(marketing)/know-your-lender/page.tsx`
- Modify: `src/app/sitemap.ts`

- [ ] **Step 1: Resolve the real external link URLs**

Fetch the live page and extract the actual hrefs behind the 7 research links (Google, Zillow, Facebook, Chamber of Commerce, BBB, Colorado eLicense, NMLS Consumer Access):
Run (via the context-mode fetch tool, NOT curl): fetch `https://msfg.us/knowyourlender` and read out every `<a href>`.
Use the resolved URLs in Step 2's `LINKS` array. For any that can't be resolved, use a sensible fallback and tag it: Google → `https://www.google.com/search?q=Mountain+State+Financial+Group+MSFG`; NMLS → `config.contact.nmlsConsumerAccessUrl`; others → `"[PLACEHOLDER — confirm profile URL]"` as the href with the label intact (render those as plain text, not a broken link — see Step 2).

- [ ] **Step 2: Create the page**

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { Mark } from "@/components/ui/Mark";
import { Section, SectionHead } from "@/components/ui/Section";
import { CtaBand } from "@/components/CtaBand";
import { PageJsonLd } from "@/components/seo/PageJsonLd";
import { buildMetadata } from "@/lib/seo/buildMetadata";
import { getTenantConfig } from "@/server/tenant/config";

export function generateMetadata(): Promise<Metadata> {
  return buildMetadata("/know-your-lender", {
    title: "Know Your Lender — Research MSFG | MSFG",
    description:
      "Due diligence matters when choosing a mortgage lender. Research Mountain State Financial Group, verify our licensing on NMLS, and see what to ask any lender.",
    canonical: "/know-your-lender",
  });
}

/** Each link: external research destination. Replace [PLACEHOLDER] hrefs with the
 *  real profile URLs resolved from the live /knowyourlender page (Task 7 Step 1). */
type ResearchLink = { label: string; href: string };

export default async function KnowYourLenderPage() {
  const config = await getTenantConfig();
  const LINKS: ResearchLink[] = [
    { label: "MSFG on Google", href: "https://www.google.com/search?q=Mountain+State+Financial+Group+MSFG" },
    { label: "MSFG on Zillow", href: "[PLACEHOLDER — Zillow profile URL]" },
    { label: "MSFG on Facebook", href: "[PLACEHOLDER — Facebook page URL]" },
    { label: "Chamber of Commerce", href: "[PLACEHOLDER — Chamber listing URL]" },
    { label: "Better Business Bureau", href: "[PLACEHOLDER — BBB profile URL]" },
    { label: "Colorado eLicense lookup", href: "[PLACEHOLDER — colorado.gov eLicense URL]" },
    { label: "NMLS Consumer Access", href: config.contact.nmlsConsumerAccessUrl },
  ];
  const VERIFY: string[] = [
    "Confirm the company and your loan officer are licensed in your state (NMLS Consumer Access).",
    "Read recent, independent reviews — not just testimonials on the lender's own site.",
    "Ask how they're paid, what fees apply, and to see a written Loan Estimate.",
    "Make sure every rate quote is in writing and clearly not a commitment to lend.",
  ];

  return (
    <>
      <PageJsonLd path="/know-your-lender" />
      <section className="hero-bg px-0 pb-[52px] pt-14 text-center text-white">
        <div className="wrap">
          <span className="mb-3.5 inline-flex items-center gap-2.5 text-mint">
            <Mark size={18} label={config.brand.shortName} />
            <span className="text-[13px] font-semibold tracking-[0.02em]">Know your lender</span>
          </span>
          <h1 className="m-0 text-[clamp(32px,4.6vw,52px)] font-extrabold tracking-[-0.035em]">
            Do your <span className="text-mint">due diligence.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-[58ch] text-[18px] text-on-dark-2">
            Choosing a lender is a big decision. We encourage you to research us — and any lender — before you commit.
          </p>
        </div>
      </section>

      <Section>
        <div className="mx-auto max-w-[820px]">
          <SectionHead eyebrow="Research us" title="Look us up." />
          <ul className="grid grid-cols-2 gap-3 max-[600px]:grid-cols-1">
            {LINKS.map((l) =>
              l.href.startsWith("http") ? (
                <li key={l.label}>
                  <a href={l.href} target="_blank" rel="noopener noreferrer" className="block rounded-lg border border-line bg-white px-4 py-3 text-[15px] font-semibold text-green-700 shadow-3d transition-transform hover:-translate-y-0.5">
                    {l.label} ↗
                  </a>
                </li>
              ) : (
                <li key={l.label} className="rounded-lg border border-line bg-paper-2 px-4 py-3 text-[15px] font-semibold text-muted">
                  {l.label} <span className="text-[12px] font-normal">(link coming soon)</span>
                </li>
              ),
            )}
          </ul>

          <h2 className="mt-12 text-[24px] font-extrabold tracking-[-0.02em] text-ink">What to verify with any lender</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-[16px] leading-[1.6] text-ink">
            {VERIFY.map((v, i) => (<li key={i}>{v}</li>))}
          </ul>

          <p className="mt-8 text-[16px] leading-[1.6] text-ink">
            See our{" "}
            <Link href="/licensing" className="font-semibold text-green-600 hover:underline">licensing &amp; disclosures</Link>{" "}
            and verify us on{" "}
            <Link href="/nmls-consumer-access" className="font-semibold text-green-600 hover:underline">NMLS Consumer Access</Link>.
          </p>
        </div>
      </Section>

      <CtaBand />
    </>
  );
}
```

- [ ] **Step 3: Add `"/know-your-lender"` to `sitemap.ts` ROUTES. Typecheck. Commit.**

```bash
npx tsc --noEmit
git add "src/app/(marketing)/know-your-lender" src/app/sitemap.ts
git commit -m "feat(marketing): Know Your Lender page"
```

---

## Task 8: Wire nav, footer, family cards + guard test

**Files:**
- Modify: `src/content/nav.ts`, `src/content/site.ts`, `src/content/nav.test.ts`

- [ ] **Step 1: Update the guard test's KNOWN set first**

In `src/content/nav.test.ts`, add the 7 new routes to the `KNOWN` set:
```ts
"/veterans", "/reverse", "/investment", "/commercial", "/about", "/careers", "/know-your-lender",
```

- [ ] **Step 2: Edit `nav.ts`**

In `FOOTER_COLUMNS`:
- **Resources column:** remove the `{ label: "Get home inspection", href: "/coming-soon" }` entry.
- **Company column:** remove `{ label: "Partner with us", href: "/coming-soon" }`; change `{ label: "About us", href: "/coming-soon" }` → `href: "/about"`; change `{ label: "Careers", href: "/coming-soon" }` → `href: "/careers"`; add `{ label: "Know Your Lender", href: "/know-your-lender" }`.

(Leave "Media" and "FAQs" pointing at `/coming-soon` — still unbuilt.)

- [ ] **Step 3: Edit `site.ts` family cards**

In `DEFAULT_TENANT_CONFIG.marketing.familyOfCompanies`, change the `href` of the four cards: Veterans `/coming-soon`→`/veterans`, Reverse→`/reverse`, Investment→`/investment`, Commercial→`/commercial`.

- [ ] **Step 4: Run the guard test**

Run: `npx vitest run src/content/nav.test.ts src/content/site.test.ts`
Expected: PASS — no `/` placeholders, every internal link resolves to a KNOWN route, family cards point to real routes.

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit
git add src/content/nav.ts src/content/site.ts src/content/nav.test.ts
git commit -m "feat(marketing): wire sub-brand + About/Careers/KYL links; drop unoffered links"
```

---

## Task 9: Full verification + deploy (controller)

**Files:** none (verification). Requires the local Docker DB up (`npm run db:up`).

- [ ] **Step 1: Full gates** — `npx tsc --noEmit && npx vitest run && npx eslint src && npx next build`. Expected: all green; the 7 new routes appear as static (○) in the build output.

- [ ] **Step 2: Browser pass (preview)** —
  - The 4 sub-brand pages render the category layout; Veterans/Investment show the estimator, Reverse/Commercial show a single-column hero (no estimator) with a "Talk to a … specialist" CTA → `/loan-officers`.
  - The floating **Ask AI** opens on a sub-brand page and streams via `POST /api/v1/ai/chat` with the page-specific starter chips.
  - `/about` shows the pledge + 3 office cards; `/careers` shows the reach-out CTA (mailto); `/know-your-lender` shows the research links + the licensing/NMLS cross-links.
  - Homepage family cards now land on the sub-brand pages; footer no longer shows "Get home inspection"/"Partner with us"; "About us"/"Careers"/"Know Your Lender" resolve.
  - Regression: the **apply wizard's** Ask-AI still opens + streams (the `ApplyChatPanel` prop change).
  - Mobile (≤980px) + reduced motion.

- [ ] **Step 3: Deploy** — `bash scripts/deploy-ec2.sh https://staging.msfg.us staging`; smoke-check the new routes return 200 on staging.

---

## Done criteria

- `tsc` + `eslint` clean; `vitest` green (incl. new categories/offices/nav guards); `next build` succeeds with 7 new static routes.
- Veterans/Reverse/Investment/Commercial render category-style with the floating Ask-AI chat; Reverse/Commercial route to `/loan-officers` and omit the estimator.
- `/about` (pledge + offices), `/careers` (reach-out), `/know-your-lender` (research links + cross-links) live.
- Footer drops "Get home inspection" + "Partner with us"; family cards + About/Careers/KYL links resolve; the wizard Ask-AI is unaffected.
- buy/refi/equity category pages render unchanged (estimator intact).

## Follow-ups (not blocking)

- Replace `[PLACEHOLDER]` KYL profile URLs the fetch couldn't resolve, the careers email, and reconcile the `[VERIFY]` office phones.
- Real reverse/commercial estimators or program detail if desired later.
