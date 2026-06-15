# Sub-Brand Pages, About, Careers & Know Your Lender — Design

**Date:** 2026-06-15
**Status:** Approved (brainstorm 2026-06-15)
**Builds on:** the marketing-page pattern (`(marketing)/route/page.tsx` → `buildMetadata` → `sitemap.ts` ROUTES → `Section`/`Mark`/`CtaBand` primitives → `getTenantConfig`), the `CategoryPage` engine (`src/content/categories.ts`), and the in-application Ask-AI panel (`src/components/apply/ask-ai/*`).

## Summary

Build seven new marketing pages and retire two dead links:
- **4 sub-brand pages** (`/veterans`, `/reverse`, `/investment`, `/commercial`) — full category-style pages (hero + estimate + 4-step + program cards) with the floating MSFG-AI chat.
- **`/about`** — combines the live "Our Pledge to You" copy with an Offices section.
- **`/careers`** — culture + reach-out CTA (email/phone), no listings.
- **`/know-your-lender`** — due-diligence research links + cross-links to our licensing/NMLS pages.
- Generalize the Ask-AI panel into a reusable `AskAiLauncher` so any marketing page mounts the floating "Ask AI" button + single-thread chat (same `/api/v1/ai/chat` brain).
- Remove the footer links **"Get home inspection"** and **"Partner with us"** (not offered); repoint the 4 family-of-companies cards; wire nav/footer/sitemap/tests.

**No backend changes.** New copy is drafted (reviewable); unverifiable specifics are tagged `[PLACEHOLDER]`.

## Decisions locked (brainstorm 2026-06-15)

1. **Sub-brand pages = full category-style** (like `/buy`): hero + estimator + 4-step process + program cards. The payment estimator fits Veterans/Investment; for **Reverse and Commercial** (where a monthly-payment estimator doesn't apply) the quote/estimate block is replaced with a fitting teaser or omitted (see Architecture).
2. **Careers = reach out by email/phone** — culture content + a "we're always looking for great loan officers" CTA to a careers email/phone. No live listings, no form.
3. **Copy authorship:** drafted by us, reviewable; company-specific unknowns tagged `[PLACEHOLDER]`.

## Architecture

### A. Ask-AI generalization (foundation)
- **`ApplyChatPanel`** (`src/components/apply/ask-ai/ApplyChatPanel.tsx`): replace `intent: Intent` with **`starters: string[]`**; make **`stepQuestion?: string`** optional (the "Help me with this step" chip renders only when present). Drop the `APPLY_CHAT_STARTERS[intent]` lookup inside the panel — the caller supplies the chip list. `useApplyChat` is already generic — no change.
- **New `src/components/ai/AskAiLauncher.tsx`** (`"use client"`): the floating "Ask AI" button (the exact `fixed bottom-6 right-6 z-40` markup from the Wizard) + `open` state + `returnFocusRef` + `<ApplyChatPanel>`. Props: `{ starters: string[]; assistantName: string; shortName: string; iconSrc: string }`. Marketing pages render `<AskAiLauncher starters={…} … />`.
- **`Wizard.tsx`**: keep its inline button; pass `starters={APPLY_CHAT_STARTERS[intent]}` and `stepQuestion={step.q}` to `ApplyChatPanel` (behavior unchanged). Do NOT adopt `AskAiLauncher` in the wizard (the wizard's panel state coordinates with the step + lives in the wizard tree).

### B. Sub-brand pages via `CategoryPage`
- Extend **`src/content/categories.ts`** with 4 new category configs: `veterans`, `reverse`, `investment`, `commercial`. The `CategoryPage` `cat` union widens to include them. Each route is `src/app/(marketing)/<slug>/page.tsx` rendering `<PageJsonLd>` + `<CategoryPage cat="…" />` + `<AskAiLauncher starters={…} … />`.
- **Estimator adaptation:** the implementer reads `categories.ts` + `CategoryPage` to confirm the quote/estimate block's shape and whether it's optional. Veterans + Investment keep a purchase-payment estimate. **Reverse + Commercial**: if `CategoryPage` requires a quote, make it optional (render nothing when a category omits `quote`) — a small, backward-compatible `CategoryPage` change — and give those two a content teaser instead. No fabricated reverse/commercial math.
- **Apply CTA mapping per sub-brand:** Veterans → `/apply/buy`; Investment → `/apply/buy`; **Reverse → `/loan-officers`** and **Commercial → `/loan-officers`** ("talk to a loan officer" — neither HECM/reverse nor commercial maps cleanly to a consumer apply funnel, so route to a specialist instead of shoehorning into `/apply/cash`).
- **Ask-AI starters per sub-brand** (examples; refined in the plan): Veterans ("Am I eligible for a VA loan?", "What's a VA IRRRL?", "Is there really $0 down?"), Reverse ("How does a reverse mortgage work?", "Am I eligible at 62+?", "Do I still own my home?"), Investment ("What is a DSCR loan?", "Can I finance a rental?", "How much down for an investment property?"), Commercial ("What property types do you finance?", "What is a DSCR for commercial?", "How do I get started?").

### C. Content pages (About, Careers, Know Your Lender)
Lighter pages built from `hero-bg` mini-hero + `Section`/`SectionHead` blocks + `CtaBand` (no `CategoryPage`). Server components reading `getTenantConfig()`.

- **`/about`** (`src/app/(marketing)/about/page.tsx`): mini-hero ("Firm built on service, expertise, and preparation"), the **"Our Pledge to You"** three paragraphs (real copy from the live site), and an **Offices** section listing Westminster/Bismarck/Fargo (address + phone) sourced from a new **`src/content/offices.ts`**. CtaBand at the end.
- **`/careers`** (`src/app/(marketing)/careers/page.tsx`): mini-hero, a why-MSFG/culture section (derived from the pledge values), and a reach-out CTA to `[PLACEHOLDER]` careers email (falls back to `config.contact.email`) + phone. CtaBand.
- **`/know-your-lender`** (`src/app/(marketing)/know-your-lender/page.tsx`): mini-hero ("Know Your Lender") + "due diligence matters" intro, a **research-links list** (Google, Zillow, Facebook, Chamber of Commerce, BBB, Colorado eLicense, NMLS Consumer Access — real URLs pulled from the live `/knowyourlender` page during implementation; any unresolved tagged `[PLACEHOLDER]`), a short "what to verify / questions to ask" list, and cross-links to `/licensing` + `/nmls-consumer-access`. External links open in a new tab (`rel="noopener noreferrer"`).

### D. Wiring
- **`src/content/nav.ts`**: remove `{ label: "Get home inspection" }` (Resources) and `{ label: "Partner with us" }` (Company); point **"About us" → `/about`** and **"Careers" → `/careers`**; add a **"Know Your Lender"** link (Company column). 
- **`src/content/site.ts`**: repoint `marketing.familyOfCompanies` hrefs — Veterans→`/veterans`, Reverse→`/reverse`, Investment→`/investment`, Commercial→`/commercial`.
- **`src/app/sitemap.ts`**: add the 7 new routes to ROUTES.
- **`src/content/nav.test.ts`**: add the 7 routes to the `KNOWN` set (so the guard passes); the "no `/` placeholder" + "every internal link resolves" assertions continue to hold.

## Office data (from the live contact page — verify before launch)

`src/content/offices.ts` — typed `Office[] = { city, address, phone }`:
- Westminster (HQ): 9035 Wadsworth Parkway, Suite 3400, Westminster, CO 80021 — (720) 838-6372 `[VERIFY]`
- Bismarck: 1600 E Interstate Ave, Ste 4, Bismarck, ND 58503 — (701) 955-0597 `[VERIFY]`
- Fargo: 1630 1st Ave N, Ste B, Fargo, ND 58102 — (701) 561-8266 `[VERIFY]`

⚠️ These office phones (from the contact-page body) differ from the site-wide footer/company line ((720) 838-1246). Flagged for the user to reconcile; tagged `[VERIFY]` in the module.

## Testing

**Unit (vitest):**
- `nav.test.ts`: the 7 new routes added to `KNOWN`; no nav/footer/family href is `/`; "Get home inspection"/"Partner with us" gone; "About us"→`/about`, "Careers"→`/careers`, "Know Your Lender" present.
- `categories.ts` config integrity: each of the 4 new categories has the required fields the `CategoryPage` renders (hero copy, steps, programs/options; quote optional).
- `offices.ts`: non-empty; each office has city/address/phone.
- `site.ts` family-card guard: Veterans/Reverse/Investment/Commercial hrefs are the real routes (not `/coming-soon`).

**Browser (preview):**
- Each of the 7 new pages renders (200, one `<h1>`); the 4 sub-brand pages show the category layout + the floating **Ask AI** opens and streams via `/api/v1/ai/chat` with the page-specific starters.
- `/about` shows the pledge + 3 offices; `/careers` shows the reach-out CTA; `/know-your-lender` shows the research links + cross-links.
- Family cards now land on the sub-brand pages; footer no longer shows "Get home inspection"/"Partner with us"; "About us"/"Careers"/"Know Your Lender" resolve.
- Mobile + reduced-motion; the wizard's Ask-AI still works (regression check after the `ApplyChatPanel` prop change).

## Out of scope / follow-ups

- Real job listings, an ATS/job-board integration, or a careers application form.
- A contact form, per-office hours/maps.
- Reverse/commercial payment math (no estimator fabricated for those).
- Separate sub-brand visual identities (these are MSFG product lines under MSFG branding).
- The apex `msfg.us` cutover.
- Real careers email + any external KYL profile URLs that can't be resolved (tagged `[PLACEHOLDER]`).
