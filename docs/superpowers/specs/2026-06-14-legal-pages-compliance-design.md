# Legal Pages & Site-Wide Compliance — Design

**Date:** 2026-06-14
**Status:** Approved (brainstorm 2026-06-14)
**Builds on:** the existing marketing-page pattern (`(marketing)/route/page.tsx` → `buildMetadata` → `sitemap.ts` ROUTES → `Section`/`wrap` primitives → `getTenantConfig`) and the tenant-config legal model (`src/content/site.ts` `buildLegalStrip`, rendered in the global `Footer`).

## Summary

Add the legal/compliance surface a U.S. residential-mortgage marketing site needs: seven legal pages, an Equal Housing Opportunity logo, a site-wide compliance pass, a soft-pull copy teardown, and a rewiring of every placeholder link to a real destination or a shared **Coming Soon** page. No new runtime dependencies; no DB migration required (config additions are additive/optional and ride the existing tenant-config JSON). MSFG is tenant #1; everything goes through tenant config so it stays multi-tenant-clean.

## Decisions locked (brainstorm 2026-06-14)

1. **Legal copy = drafted templates + `[PLACEHOLDER]` + a visible "pending legal/compliance review" banner.** I write industry-standard mortgage/financial templates and tag every company-specific fact (NMLS, per-state license numbers, registered address, effective dates, contacts) as `[PLACEHOLDER]`. The banner makes clear the text is not counsel-approved. **This is not legal advice and is not a substitute for review by MSFG's counsel/compliance before launch.**
2. **"Privacy Notice" = the GLBA financial privacy notice** (the regulated "Facts: what we do with your personal information" form), distinct from the **website Privacy Policy** (CCPA/state-rights, cookies, web analytics). Two separate pages.
3. **Equal Housing Opportunity logo = a generated, token-colored inline SVG component**, placed in the **global footer** (covers every page) and on the legal pages.

## Scope

**In scope**
- 8 new routes (7 legal + 1 Coming Soon).
- A shared `LegalPage` shell component + an `EqualHousing` SVG component.
- Legal content as typed data modules under `src/content/legal/`.
- Rewiring all 13 placeholder (`/`) links + 6 calculator links.
- Soft-pull copy removal in 3 locations.
- Additive tenant-config fields (per-state license number, address, privacy email, effective dates) — all `[PLACEHOLDER]`.
- Site-wide compliance pass (EHL logo + complete legal strip + reachable legal links on every page).
- Folded-in SEO audit quick-wins (`/developers` h1 + sitemap; `/rates` description).
- Unit + browser tests.

**Out of scope** (follow-ups / owned by others)
- Real legal text, real NMLS #, per-state license numbers, registered address, privacy contact — supplied by MSFG/counsel; we tag `[PLACEHOLDER]`.
- The actual advanced mortgage calculators (tying-in later — links go to Coming Soon for now).
- Building the family-of-companies sub-sites (Veterans/Reverse/Investment/Commercial).
- A cookie-consent banner / consent-management platform.
- Apex DNS cutover and flipping `NEXT_PUBLIC_SITE_ENV=production`.

## Architecture

### `LegalPage` shell — `src/components/legal/LegalPage.tsx` (server component)
One component renders consistent chrome for every legal page so disclosures cannot drift:
- A mini-hero header (matches `/rates` dark hero pattern) with the page title + an "Effective / Last updated: `[PLACEHOLDER]`" line.
- A **review banner** (subtle, dismissible-not-required) reading e.g. *"Draft for review — pending legal & compliance approval. Not yet legal advice."* Controlled by a prop so it can be removed per-page once approved.
- A constrained prose container (`wrap` + `max-w-[820px]`, `text-ink` on `bg-paper`, heading scale h1 `clamp(30px,3.6vw,46px)` / h2 `26px` / h3 `19px`, body `text-[16px] leading-[1.6]`, links `text-spring-3 hover:underline`).
- A footer reinforcement block with the `EqualHousing` logo + the legal strip (`buildLegalStrip(config)`), so the page is self-contained even out of the global chrome.
- Renders structured content (sections of heading + paragraphs/lists/tables) passed as children or via a content module.

### `EqualHousing` — `src/components/legal/EqualHousing.tsx`
Inline SVG of the standard Equal Housing Opportunity house-with-equal-sign mark. Token-colored (`currentColor` / `text-ink` or `text-on-dark`), `role="img"` with `aria-label="Equal Housing Opportunity"`, a `<title>`, and a `size` prop. Used in the footer (next to the legal strip) and in `LegalPage`. Pairs with the existing "Equal Housing Lender" text in the legal strip.

### Legal content modules — `src/content/legal/*.ts`
Typed, structured content (matches the "content in typed `src/content/*.ts`, placeholders tagged `[PLACEHOLDER]`" convention). One module per doc (`privacyNotice.ts`, `privacyPolicy.ts`, `terms.ts`, `accessibility.ts`, `licensing.ts`, `nmlsConsumerAccess.ts`) exporting a typed section array `{ heading, body: (paragraph | list | table) }[]`. The GLBA "Facts" sharing matrix and the per-state license table are typed structures rendered by small dedicated sub-components. These modules are the seed source for future CMS storage.

## The new routes

All under `src/app/(marketing)/` (inherit Nav + Footer) except `/coming-soon`. Each exports `generateMetadata` via `buildMetadata`, includes `<PageJsonLd path=…/>`, and (except Coming Soon) is added to `sitemap.ts` ROUTES.

1. **`/licensing`** — Licensing & Disclosures. Company identity (legal name, NMLS #), **per-state license table** (state, license name/number `[PLACEHOLDER]`), the Equal Housing Lender statement + logo, key disclosures (subject to credit & property approval; rates/terms subject to change; not a commitment to lend; equal opportunity), and a link to `/nmls-consumer-access`. Reads `config.legal`.
2. **`/privacy-notice`** — GLBA financial privacy notice. The standardized model form: "FACTS — What does MSFG do with your personal information?" with the Why/What/How sections and the **sharing matrix table** (reasons we share / does MSFG share / can you limit), "Who we are", "What we do", "Definitions", and contact. Company-specific blanks `[PLACEHOLDER]`.
3. **`/privacy-policy`** — Website privacy policy. Information collected (forms, apply funnel answers, cookies/analytics via Vercel Analytics), how used, third parties (GoHighLevel CRM, Google Places, the LOS hand-off `app.msfgco.com`), cookies/tracking, **state privacy rights** (CCPA/CPRA + others), data retention/security, children, changes, and contact (`legal.privacyEmail` `[PLACEHOLDER]`).
4. **`/terms`** — Terms of Use. Acceptance, permitted use, no-guarantee-of-loan-terms / informational-only, intellectual property, third-party links, disclaimers & limitation of liability, indemnification, governing law & dispute resolution / arbitration `[PLACEHOLDER]`, changes, contact.
5. **`/accessibility`** — Accessibility Statement. WCAG 2.1 AA conformance commitment, measures taken, known limitations, how to report a barrier + alternative contact (phone/email), and a feedback path.
6. **`/nmls-consumer-access`** — Short explainer of NMLS + a prominent outbound button to the official `nmlsconsumeraccess.org` lookup (`target="_blank"` `rel="noopener noreferrer"`), pre-filled/annotated with the company NMLS # `[PLACEHOLDER]`, plus the licensed-states summary.
7. **`/sitemap`** — Human-readable HTML site map. **Generated** from the nav/footer config + the route list (a pure helper builds the grouped link list), so it can't go stale. Distinct from `/sitemap.xml` (the `sitemap.ts` metadata route) — no path collision.
8. **`/coming-soon`** — Generic, **`noindex`** ("We're building this") with a short message and CTAs back to `/apply/buy` and `/loan-officers`. Lives **under `(marketing)`** (`src/app/(marketing)/coming-soon/page.tsx`) so it carries the global Nav + Footer chrome. Excluded from `sitemap.ts`; robots already blocks staging globally, and `buildMetadata` must emit `robots: { index: false, follow: false }` for this route specifically (so it stays noindex even in production).

## Link rewiring

Source of links: `src/content/nav.ts` (footer columns + legal links) and `src/content/site.ts` (`familyOfCompanies` cards).

| Current label | Current href | New href |
|---|---|---|
| Privacy Policy | `/` | `/privacy-policy` |
| Terms of Use | `/` | `/terms` |
| Disclosures & Licensing | `/` | `/licensing` (relabel → "Licensing & Disclosures") |
| NMLS Consumer Access | external | `/nmls-consumer-access` (on-site page links out) |
| *(new)* Privacy Notice | — | `/privacy-notice` |
| *(new)* Accessibility | — | `/accessibility` |
| *(new)* Site Map | — | `/sitemap` |
| About us / Careers / Media / Partner with us / FAQs / Get home inspection | `/` | `/coming-soon` |
| Family cards: Veterans / Reverse / Investment / Commercial | `/` | `/coming-soon` |
| Affordability / Mortgage / Rent-vs-buy / Cash-out / "Calculate your cash" / HELOC **calculators** (6) | `/buy` `/refinance` `/home-equity` | `/coming-soon` |
| HELOC vs. cash-out (content link, not a calculator) | `/home-equity` | unchanged (real, relevant page) |

A vitest guard asserts **no nav/footer/family href equals `/`** (placeholder regression guard), and that every internal href resolves to a known route or `/coming-soon`.

## Soft-pull teardown

Remove the soft-pull claims (copy only — no wiring exists). Replace with accurate framing: this site captures your info and hands off to a loan officer / the LOS; **no credit pull happens on this site**; pre-approval & credit review happen with your loan officer.

- `src/app/(marketing)/buy/page.tsx:10` — meta description: drop "soft-pull pre-approval with no credit impact"; rewrite to ~150–160 chars without the soft-pull claim.
- `src/content/categories.ts:134` — "How it works" step 1 copy (shown on /buy, /refinance, /home-equity): drop "soft-pull pre-approval — no credit impact".
- `src/content/ai-script.ts:18` — AI assistant reply: drop "We run a soft credit check that won't affect your score."
- `creditBand` step (`flows.ts`) is **kept** — it is self-reported ("won't affect your credit" is accurate for a self-estimate). No change.

## Config / schema additions (`src/content/site.ts`)

Additive, optional, `[PLACEHOLDER]`-tagged so they don't break the live published revision:
- `legal.states[]` gains optional `licenseNumber?: string` (and optionally `licenseName?`).
- `legal.address?` (registered office, for privacy/terms + schema `PostalAddress`).
- `legal.privacyEmail?` (distinct privacy/compliance contact).
- `legal.effectiveDates?: Record<string, string>` keyed by doc slug (per-doc "last updated"); pages fall back to a generic `[PLACEHOLDER]` when a key is absent.
- Optionally feed `legal.address` into `localBusinessSchema` as `address` (`PostalAddress`) — only if present.

**Verify during implementation:** how `getTenantConfig()` merges the stored published revision with `DEFAULT_TENANT_CONFIG` (deep-merge vs. replace). New fields must resolve via defaults; pages must render gracefully when a value is missing (show a clear `[PLACEHOLDER]` / "pending" rather than blank or crash). Keep all new fields optional in the zod schema.

## Site-wide compliance pass

Confirm every marketing page carries, via the **global footer**: the complete legal strip (legal name, NMLS #, **Equal Housing Lender** text **+ the new EHO logo**, licensed states, "subject to credit and property approval", "rates/terms subject to change", "not a commitment to lend", copyright) and reachable links to all legal pages. Page-specific: `/rates` keeps `ratesDisclaimer`; the apply flow keeps TCPA consent. Produce a short compliance checklist mapping each requirement → where it's satisfied, and flag every `[PLACEHOLDER]` that must be real before launch.

## SEO audit quick-wins (folded in)

- `/developers`: add a single `<h1>`; add `/developers` to `sitemap.ts` ROUTES.
- `/rates`: extend meta description to 150–160 chars.
- Add the 7 indexable legal routes to `sitemap.ts` ROUTES (priority ~0.3, changefreq yearly for legal pages); exclude `/coming-soon`.

## Data flow

No new data flow. Pages are server components reading `getTenantConfig()` for company/legal facts + their content module for prose. The Site Map page reads the nav/footer config + route list through a pure generator (unit-tested). No leads, no API, no DB writes.

## File inventory

**New**
- `src/components/legal/LegalPage.tsx`, `src/components/legal/EqualHousing.tsx`
- `src/components/legal/GlbaFactsTable.tsx`, `src/components/legal/LicenseTable.tsx` (small render helpers)
- `src/content/legal/{privacyNotice,privacyPolicy,terms,accessibility,licensing,nmlsConsumerAccess}.ts`
- `src/lib/siteMap.ts` (pure generator) + `src/lib/siteMap.test.ts`
- `src/app/(marketing)/{licensing,privacy-notice,privacy-policy,terms,accessibility,nmls-consumer-access,sitemap}/page.tsx`
- `src/app/(marketing)/coming-soon/page.tsx` (or `src/app/coming-soon/page.tsx`)
- Tests: `src/content/nav.test.ts` (no-`/`-placeholder guard), `src/content/legal/legal.test.ts` (section integrity), EHL smoke.

**Modified**
- `src/content/nav.ts` (rewire footer + legal links, add new legal links)
- `src/content/site.ts` (config additions; family-card hrefs; possibly schema address)
- `src/components/Footer.tsx` (add `EqualHousing` logo near the legal strip)
- `src/content/categories.ts`, `src/content/ai-script.ts` (soft-pull copy)
- `src/app/(marketing)/buy/page.tsx` (meta description), `src/app/(marketing)/rates/page.tsx` (description), `src/app/(marketing)/developers/page.tsx` (h1)
- `src/app/sitemap.ts` (add legal routes + `/developers`; exclude coming-soon)
- `src/lib/schema.ts` (optional `address` if config present)

## Testing

**Unit (vitest, node env):**
- `siteMap.ts` generator: groups, every entry has a real href, no `/` placeholders.
- nav/footer/family link guard: no href === `/`; every internal href ∈ {known routes} ∪ {`/coming-soon`}.
- legal content modules: each has ≥1 section, no empty headings/bodies, placeholders are explicitly tagged.
- `buildMetadata` for each new route returns title/description/canonical; `/coming-soon` returns `robots.index === false`.
- sitemap: includes the 7 legal routes + `/developers`; excludes `/coming-soon`.
- `EqualHousing` renders an `img`-role SVG with the accessible label.

**Browser (preview):**
- Visit all 8 new pages: render, single `<h1>`, EHL logo present, footer legal strip complete, review banner on legal pages, prose readable.
- Footer/nav: former dead links now go to a real page or `/coming-soon`; `/coming-soon` renders + is `noindex` (check `<meta name="robots">`).
- `/buy` no longer mentions a soft pull; `/developers` has an h1.
- Mobile (≤980px) + reduced-motion + a11y: heading order, visible focus rings, link contrast (spring-3 on paper passes AA), EHL logo has a label.

## Pre-launch checklist (real data required — owner: MSFG/counsel)

Replace every `[PLACEHOLDER]`: NMLS #, per-state license numbers, registered address, privacy/compliance contact email, effective dates, governing-law/arbitration terms. Route all drafted legal text (Privacy Notice/Policy, Terms, Licensing, Accessibility) through counsel; remove the review banner per page once approved. Flip `NEXT_PUBLIC_SITE_ENV=production` and confirm canonicals resolve to the apex at cutover.
