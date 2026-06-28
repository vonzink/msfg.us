# Mortgage Glossary page — design

**Date:** 2026-06-23
**Status:** Approved (design); pending implementation plan
**Route:** `/resources/mortgage-glossary`
**Tenant:** MSFG (tenant #1)

## Goal

Add a **Mortgage Glossary** page, linked from the footer **Resources** column.
The page renders ~400 glossary terms grouped A–Z with a sticky alphabet nav,
a live client-side term filter, per-term deep links, and `DefinedTermSet`
JSON-LD for SEO. Terms are parsed from the provided markdown into a typed,
committed content module — never hardcoded inline.

Source markdown (provided by user, currently at `~/Desktop/DNS/Glossary/`):
- `index.md` — page metadata, search/CTA block, A–Z index, term URL pattern.
- `glossary-terms.md` — terms grouped under `## Letter {#anchor}` headings,
  each term a `### Term` heading followed by a definition paragraph.

## Decisions (locked)

1. **Data sourcing:** Generate a typed module and **commit it**. A committed
   generator script parses the markdown → emits `src/content/glossary.ts`.
   Nothing parses markdown at runtime (SSG-friendly, no new deps). Re-run the
   script when terms change.
2. **Search:** **Term filter only.** Repurpose the search box to live-filter
   glossary terms as the user types (keep the magnifying-glass affordance).
   The spec's "Search by Address, City or ZIP" location box and "Meet Your
   Home Loan Expert" heading are **dropped** — msfg.us has no location-search
   endpoint, and a term filter is the useful behavior on a glossary page.

## Architecture

Server page (SSG) + one client island for interactivity.

```
src/app/(marketing)/resources/mortgage-glossary/page.tsx   (Server Component)
  ├─ generateMetadata() via buildMetadata  → title + description
  ├─ <Breadcrumb> Home / Resources / Mortgage Glossary
  ├─ <h1>Mortgage Glossary</h1>
  ├─ DefinedTermSet JSON-LD (<script type="application/ld+json">)
  └─ <GlossaryExplorer sections={GLOSSARY} />            (Client Component)

src/components/glossary/GlossaryExplorer.tsx   ("use client")
  ├─ filter <input> (labeled, magnifying-glass icon)
  ├─ sticky A–Z nav  (real <a href="#anchor"> anchors; K/X disabled)
  ├─ rendered letter sections + terms
  └─ deep-link handling (?term=<slug> → scroll + highlight on mount)

src/content/glossary.ts          (generated, committed) — typed term data
src/components/ui/Breadcrumb.tsx  (new small primitive)
scripts/generate-glossary.ts     (committed generator)
scripts/glossary-source/*.md      (committed generator INPUT; not read at runtime)
src/content/nav.ts                (edit: add footer link)
```

### Why a client island holds the body

Client Components are still server-rendered on first load in Next, so every
term/definition is present in the initial HTML (good for SEO and no-JS
readability). The island only *toggles visibility* for filtering and runs the
nav/deep-link behavior — it does not gate content behind JS.

## Data model (`src/content/glossary.ts`)

```ts
export type GlossaryTerm = {
  term: string;        // "1003 Form"
  slug: string;        // "1003-form"
  definition: string;  // plain text (may contain inline markdown left as-is)
};

export type GlossaryLetter = {
  label: string;       // "#", "A", "B", …
  anchor: string;      // "num", "A", "B", …  (used as section id + nav href)
  terms: GlossaryTerm[];
};

export const GLOSSARY: GlossaryLetter[] = [ /* generated */ ];
```

Slugs are precomputed at generation time, so runtime needs no slugify.

## Parser / generator (`scripts/generate-glossary.ts`)

Plain string parsing (no gray-matter/remark). Run with the repo's existing
`ts` script runner (same approach as `prisma/enable-brain.ts`).

Rules:
- `## <Label> {#<anchor>}` starts a section. `## # (Numbers) {#num}` →
  `label: "#"`, `anchor: "num"`.
- `### <Term>` starts a term; following non-heading lines (until the next
  `###`/`##`) are the definition, trimmed and whitespace-collapsed.
- **Slugify:** lowercase → strip punctuation → spaces to `-` → collapse
  repeated `-` → trim leading/trailing `-`.
  - `"1003 Form"` → `1003-form`
  - `"Section 203(k) loan program"` → `section-203k-loan-program`
  - `"Co-borrower(s)"` → `co-borrowers`
  - `"Equal Credit Opportunity Act (ECOA), 15 U.S.C. §1691 et seq."`
    → `equal-credit-opportunity-act-ecoa-15-usc-1691-et-seq`
- **Dedupe by slug:** the source contains a duplicate, truncated **"Interest
  rate"** entry (one definition is cut off mid-sentence). Keep the longer /
  complete definition per slug.
- **Empty letters detected dynamically:** a letter section is "disabled" when
  it has zero terms. No hardcoded K/X list — derived from the data. (All 26
  letters + `#` appear in the nav; absent/empty ones render disabled.)

The generator emits a header comment noting the file is generated and how to
regenerate. The committed source `.md` lives under `scripts/glossary-source/`
purely as reproducible generator input; the app never reads it at runtime.

## Interactivity (`GlossaryExplorer.tsx`)

- **Filter:** controlled `<input>`; case-insensitive substring match on the
  term **name only** (predictable, fast; definition text is not searched).
  Non-matching terms hide; letter sections
  with zero visible matches hide, and their nav links become disabled. Empty
  input restores the full glossary. A polite "no results" message shows when
  nothing matches.
- **A–Z nav:** real `<a href="#A">` anchors → native smooth-scroll
  (`scroll-behavior: smooth`, with `scroll-margin-top` offset for the sticky
  bar). Sticky via `position: sticky`. Active-letter highlight via
  `IntersectionObserver` on the sections. Disabled letters render as
  `<span aria-disabled="true">` (non-focusable, greyed). Mobile: nav wraps or
  horizontal-scrolls.
- **Per-term deep links:** each term name is an `<a>` to
  `/resources/mortgage-glossary?term=<slug>` and the term wrapper carries
  `id={slug}`. On mount, read `?term=<slug>` (via `useSearchParams`), scroll
  to that `id`, and apply a brief highlight (token-based, e.g. ring/`spring`
  flash that fades). Clearing happens after the animation.

## SEO & accessibility

- `generateMetadata` → title **"Mortgage Glossary"**, a descriptive meta
  description, canonical `/resources/mortgage-glossary` (via `buildMetadata`).
- **JSON-LD:** one `DefinedTermSet` with a `DefinedTerm[]`; each term sets
  `name`, `description`, `termCode` (= slug), `inDefinedTermSet`. Rendered
  server-side.
- Headings: `h1` page → `h2` per letter → `h3` per term (logical order).
- Filter input has a real `<label>` (visually hidden ok) and the magnifying
  glass is decorative (`aria-hidden`); the control is the input/submit.
- Disabled nav letters use `aria-disabled="true"` and are not focusable.
- Visible focus rings retained; brand tokens only — **no hardcoded hex**.

## Styling (brand tokens)

Use existing primitives and tokens per `AGENTS.md`:
`wrap`, `Section`/`SectionHead`/`Eyebrow`, `Button`, `green-900/850/800`,
`spring`/`spring-soft`, `mint`, `ink`/`paper`/`paper-2`/`muted`/`line`,
`rounded-*`, `shadow-card`. Responsive breakpoint 980px
(`max-[980px]:` / `min-[981px]:`). a11y rule: mint/spring greens only on dark
or as button bg with dark text — never small text on light.

## Footer wiring (`src/content/nav.ts`)

Add to the **Resources** column:
```ts
{ label: "Mortgage Glossary", href: "/resources/mortgage-glossary" }
```

## Breadcrumb

New `src/components/ui/Breadcrumb.tsx`. **Home** → `/`; **Resources** is plain
text (no resources landing page exists yet); the current page is plain text /
`aria-current="page"`. Rendered as an ordered list of links + separators.

## Out of scope (YAGNI)

- Location/address search and the "Meet Your Home Loan Expert" CTA block.
- Any new npm dependency (gray-matter, remark) — generator uses plain parsing.
- A `/resources` landing page or breadcrumb link target for "Resources".
- Per-term standalone routes — deep linking uses `?term=` + in-page anchors.
- DB/CMS integration for glossary content (Phase 1 reads the content module,
  consistent with other `src/content/*` modules; DB seeding can follow later).

## Open flag for reviewer

Generator input markdown is committed under `scripts/glossary-source/`. If you
prefer the generator to read straight from `~/Desktop/DNS/Glossary/` instead
(non-reproducible for other contributors), say so and I'll adjust.
