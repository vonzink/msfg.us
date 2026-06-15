# Pre-Launch Legal & Compliance Checklist

**Date:** 2026-06-14
**Scope:** the legal-pages + site-wide compliance work on branch `legal-pages-compliance`.
**Status:** drafted templates in place; **counsel review + real data required before production launch.**

> ⚠️ The legal pages are **drafted templates**, not legal advice. Every page carries a visible "Draft for review" banner. Route all of them through MSFG's counsel/compliance before launch, then remove the banner per page (set `reviewBanner={false}` on the `LegalPage`, or drop the banner for the bespoke pages).

## 1. Compliance coverage — requirement → where it's satisfied

| Requirement | Where it's satisfied |
|---|---|
| Equal Housing Lender **statement** | Global footer legal strip (`buildLegalStrip`, every page) + the Licensing page "Equal Housing Lender" section |
| Equal Housing Opportunity **logo** | `EqualHousing` SVG in the global footer (every page) + on every `LegalPage` (the 5 document pages) |
| NMLS company ID disclosure | Footer legal strip + Licensing page + NMLS Consumer Access page |
| NMLS Consumer Access link | `/nmls-consumer-access` page (links to the official registry) + footer legal link |
| State licensing disclosure | `/licensing` page per-state `LicenseTable` + footer "Licensed in …" strip |
| "Subject to credit & property approval" / "not a commitment to lend" | Footer legal strip (every page) + Licensing "Key disclosures" |
| Rates disclaimer | `/rates` page (`config.legal.ratesDisclaimer`) |
| Texas complaint/recovery-fund notice | `/licensing` page (`config.legal.texasNotice`) |
| GLBA financial privacy notice | `/privacy-notice` (model-form structure + sharing matrix) |
| Website privacy policy (CCPA/state rights, cookies) | `/privacy-policy` |
| Terms of Use | `/terms` |
| Accessibility statement (WCAG 2.1 AA) | `/accessibility` |
| Human-readable site map | `/sitemap` |
| TCPA consent on lead capture | Apply flow + AI chat (`buildConsentTcpa`, unchanged) |
| Legal pages reachable site-wide | Footer "Contact & Legal" column (7 links) + `/sitemap` |
| No misleading "soft-pull" claim | Removed from `/buy`, category "how it works", and the AI script (feature not built) |

## 2. `[PLACEHOLDER]` values owed before launch (owner: MSFG / counsel)

All live in tenant config (`src/content/site.ts` `DEFAULT_TENANT_CONFIG`, and ultimately the published CMS revision) or in the drafted legal copy:

- [ ] **Company NMLS ID** — currently `1234567` (`contact.nmls`). Replace everywhere (footer strip, Licensing, NMLS page).
- [ ] **Per-state license numbers** — `legal.states[].licenseNumber` is `[PLACEHOLDER]` for all 7 states (CO, ND, SD, MN, TX, MI, IN). Supply each real license name/number (rendered in the Licensing `LicenseTable`).
- [ ] **Registered office address** — `legal.address` is `[PLACEHOLDER] — registered office address`. Used on Licensing, Privacy Policy, Terms.
- [ ] **Privacy/compliance contact email** — `legal.privacyEmail` (optional; pages fall back to `contact.email` = `hello@msfg.us`). Set a dedicated privacy address if required.
- [ ] **Phone** — `contact.phoneDisplay` is the placeholder `(303) 555-0142`.
- [ ] **Effective / "last updated" dates** — `legal.effectiveDates` is unset → every legal page shows `Last updated: [PLACEHOLDER]`. Set per-doc dates (keys: `privacy-policy`, `privacy-notice`, `terms`, `accessibility`, `licensing`).
- [ ] **Privacy Policy specifics** — confirm: do-we-sell-personal-info statement, the named third-party processors (CRM/GoHighLevel, Google Places, LOS), applicable state-privacy-rights list, and data-retention periods (all tagged `[PLACEHOLDER]` in `privacyPolicy.ts`).
- [ ] **GLBA Privacy Notice** — confirm the sharing-matrix answers (`glbaRows` in `privacyNotice.ts`): marketing, joint marketing, affiliate sharing, and the "can you limit" answers; plus the definitions section.
- [ ] **Terms of Use** — governing-law state, arbitration / class-action-waiver terms, and liability caps (tagged `[PLACEHOLDER]` in `terms.ts`).
- [ ] **Accessibility** — fill the "known limitations" section if any (`accessibility.ts`).

## 3. Launch steps

- [ ] Counsel reviews/approves all drafted legal text; then remove the "Draft for review" banner per page (`reviewBanner={false}`).
- [ ] Replace every `[PLACEHOLDER]` above (publish a new CMS config revision + cache-bust per the content-publishing model — these are **not** read from `src/content` at runtime).
- [ ] Optionally feed `legal.address` into the JSON-LD `localBusinessSchema` (`src/lib/schema.ts`) as a `PostalAddress` once the real address is set (deferred — see the plan).
- [ ] Flip `NEXT_PUBLIC_SITE_ENV=production` at apex cutover; confirm canonicals resolve to `https://msfg.us` and that `/coming-soon` remains `noindex` (it forces `robots: { index:false, follow:false }` regardless of env) while the legal pages become indexable.
- [ ] Confirm `robots.txt` allows the legal routes and the XML sitemap includes them (it does — `/coming-soon` is intentionally excluded).

## 4. Verified at build time (2026-06-14)

- `npx tsc --noEmit` clean; `npx vitest run` → 215/215 across 39 files; `npx next build` succeeds with all 8 new routes prerendered (`○ static`).
- Browser pass: each new page returns 200 with exactly one `<h1>`, the EHO logo, and the footer legal strip; the GLBA table renders on `/privacy-notice`, the license table on `/licensing`; `/buy` carries no soft-pull copy; all 7 footer legal links resolve.
