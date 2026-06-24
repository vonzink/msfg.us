# Mortgage Glossary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/resources/mortgage-glossary` page (linked from the footer Resources column) that renders ~400 terms parsed from markdown into a committed typed module, with a sticky A–Z nav, a live term filter, per-term deep links, and `DefinedTermSet` JSON-LD.

**Architecture:** A committed generator script parses `glossary-terms.md` → emits `src/content/glossary.ts` (typed, no runtime markdown parsing). A Server Component page renders SEO + breadcrumb + JSON-LD and hands the data to one client island (`GlossaryExplorer`) that owns the sticky nav, filter, and deep-link scroll/highlight. Pure logic (slugify, parser, generated-data invariants) is TDD'd with vitest; the page + client components are verified via the preview/browser workflow (vitest here is node-env and only runs `src/**/*.test.ts`).

**Tech Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · vitest 4 · tsx. No new npm dependencies.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/lib/glossary/types.ts` | Shared `GlossaryTerm` / `GlossaryLetter` types |
| `src/lib/glossary/slug.ts` | `slugify()` — URL-safe term slugs |
| `src/lib/glossary/slug.test.ts` | slugify unit tests |
| `src/lib/glossary/parse.ts` | `parseGlossary(markdown)` → `GlossaryLetter[]` (sectioning, definition capture, dedupe) |
| `src/lib/glossary/parse.test.ts` | parser unit tests (small inline fixture) |
| `scripts/glossary-source/glossary-terms.md` | Committed generator INPUT (provenance; never read at runtime) |
| `scripts/glossary-source/index.md` | Committed provenance copy (not parsed) |
| `scripts/generate-glossary.ts` | Thin generator: read md → `parseGlossary` → write `src/content/glossary.ts` |
| `src/content/glossary.ts` | **Generated, committed** typed data module (`export const GLOSSARY`) |
| `src/content/glossary.test.ts` | Invariants on the generated data |
| `src/components/ui/Breadcrumb.tsx` | Small breadcrumb primitive |
| `src/components/glossary/GlossaryExplorer.tsx` | Client island: filter + sticky A–Z nav + sections + deep-link |
| `src/app/(marketing)/resources/mortgage-glossary/page.tsx` | Server page: metadata, breadcrumb, JSON-LD, renders the island |
| `src/content/nav.ts` | Edit: add footer Resources link |
| `src/content/nav.test.ts` | Edit: add `/resources/mortgage-glossary` to `KNOWN` |
| `package.json` | Edit: add `glossary:generate` script |

---

## Task 1: Glossary types + slugify

**Files:**
- Create: `src/lib/glossary/types.ts`
- Create: `src/lib/glossary/slug.ts`
- Test: `src/lib/glossary/slug.test.ts`

- [ ] **Step 1: Create the shared types**

`src/lib/glossary/types.ts`:

```ts
/** One glossary term and its definition. */
export type GlossaryTerm = {
  /** Display name, e.g. "1003 Form". */
  term: string;
  /** URL-safe slug, e.g. "1003-form". Used for ?term= deep links + ids. */
  slug: string;
  /** Plain-text definition (whitespace-collapsed). */
  definition: string;
};

/** A letter section, e.g. "A" / "#" (Numbers). */
export type GlossaryLetter = {
  /** Nav label: "#", "A" … "Z". */
  label: string;
  /** In-page anchor / section id: "num", "A" … "Z". */
  anchor: string;
  terms: GlossaryTerm[];
};
```

- [ ] **Step 2: Write the failing slugify test**

`src/lib/glossary/slug.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { slugify } from "./slug";

describe("slugify", () => {
  it("lowercases and hyphenates spaces", () => {
    expect(slugify("1003 Form")).toBe("1003-form");
  });

  it("strips parentheses but keeps existing hyphens", () => {
    expect(slugify("Co-borrower(s)")).toBe("co-borrowers");
    expect(slugify("Section 203(k) loan program")).toBe("section-203k-loan-program");
  });

  it("strips commas, periods and symbols, collapsing gaps", () => {
    expect(slugify("Equal Credit Opportunity Act (ECOA), 15 U.S.C. §1691 et seq.")).toBe(
      "equal-credit-opportunity-act-ecoa-15-usc-1691-et-seq",
    );
  });

  it("trims and collapses stray separators", () => {
    expect(slugify("  Adjustable-rate mortgage (ARM)  ")).toBe("adjustable-rate-mortgage-arm");
    expect(slugify("FHLMC — Freddie Mac")).toBe("fhlmc-freddie-mac");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/lib/glossary/slug.test.ts`
Expected: FAIL — cannot resolve `./slug`.

- [ ] **Step 4: Implement slugify**

`src/lib/glossary/slug.ts`:

```ts
/**
 * URL-safe slug for a glossary term.
 * Rule: lowercase → drop punctuation (keep spaces & hyphens)
 *       → spaces to hyphens → collapse repeats → trim.
 * Keeps intra-word hyphens ("co-borrower") but removes parens/commas/periods.
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    // Drop punctuation and any non-ASCII (no term name relies on accents),
    // keeping spaces and intra-word hyphens.
    .replace(/[^a-z0-9\s-]+/g, "")
    .trim()
    .replace(/\s+/g, "-") // spaces → hyphens
    .replace(/-+/g, "-") // collapse repeats
    .replace(/^-+|-+$/g, ""); // trim hyphens
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/lib/glossary/slug.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/glossary/types.ts src/lib/glossary/slug.ts src/lib/glossary/slug.test.ts
git commit -m "feat(glossary): term types + slugify util"
```

---

## Task 2: Markdown parser

**Files:**
- Create: `src/lib/glossary/parse.ts`
- Test: `src/lib/glossary/parse.test.ts`

- [ ] **Step 1: Write the failing parser test**

`src/lib/glossary/parse.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseGlossary } from "./parse";

const FIXTURE = `## # (Numbers) {#num}

### 1003 Form
A loan application document.

## A {#A}

### Acceptance
First line.
Second line.

### Interest rate
The cost of borrowing money from a lender, expressed as a percentage of

### Interest rate
The cost of borrowing money from a lender, expressed as a percentage of the loan amount.

## K {#K}
`;

describe("parseGlossary", () => {
  const sections = parseGlossary(FIXTURE);

  it("creates one section per ## heading, mapping label + anchor", () => {
    expect(sections.map((s) => s.label)).toEqual(["#", "A", "K"]);
    expect(sections.map((s) => s.anchor)).toEqual(["num", "A", "K"]);
  });

  it("captures terms with slug + whitespace-collapsed multi-line definitions", () => {
    const num = sections[0];
    expect(num.terms[0]).toEqual({
      term: "1003 Form",
      slug: "1003-form",
      definition: "A loan application document.",
    });
    const acceptance = sections[1].terms.find((t) => t.slug === "acceptance");
    expect(acceptance?.definition).toBe("First line. Second line.");
  });

  it("dedupes repeated terms by slug, keeping the longer definition", () => {
    const a = sections[1];
    const matches = a.terms.filter((t) => t.slug === "interest-rate");
    expect(matches).toHaveLength(1);
    expect(matches[0].definition).toContain("the loan amount.");
  });

  it("keeps sections with no terms as empty arrays", () => {
    expect(sections[2].terms).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/glossary/parse.test.ts`
Expected: FAIL — cannot resolve `./parse`.

- [ ] **Step 3: Implement the parser**

`src/lib/glossary/parse.ts`:

```ts
import type { GlossaryLetter } from "./types";
import { slugify } from "./slug";

const SECTION_RE = /^##\s+(.+?)\s*\{#([^}]+)\}\s*$/; // "## A {#A}"
const TERM_RE = /^###\s+(.+?)\s*$/; //                  "### Term"

/** "# (Numbers)" → "#"; "A" → "A". */
function sectionLabel(raw: string): string {
  const t = raw.trim();
  return t.startsWith("#") ? "#" : t;
}

/**
 * Parse glossary markdown into letter sections.
 * - `## Label {#anchor}` starts a section.
 * - `### Term` starts a term; subsequent non-heading lines are its definition.
 * - Repeated terms (same slug within a section) are deduped, keeping the
 *   longer definition (the source has a truncated duplicate "Interest rate").
 */
export function parseGlossary(markdown: string): GlossaryLetter[] {
  const lines = markdown.split(/\r?\n/);
  const sections: GlossaryLetter[] = [];
  let section: GlossaryLetter | null = null;
  let pending: { term: string; lines: string[] } | null = null;

  const flush = () => {
    if (!section || !pending) return;
    const definition = pending.lines.join(" ").replace(/\s+/g, " ").trim();
    const slug = slugify(pending.term);
    const existing = section.terms.find((t) => t.slug === slug);
    if (existing) {
      if (definition.length > existing.definition.length) existing.definition = definition;
    } else {
      section.terms.push({ term: pending.term.trim(), slug, definition });
    }
    pending = null;
  };

  for (const line of lines) {
    const sec = SECTION_RE.exec(line);
    if (sec) {
      flush();
      section = { label: sectionLabel(sec[1]), anchor: sec[2].trim(), terms: [] };
      sections.push(section);
      continue;
    }
    const term = TERM_RE.exec(line);
    if (term) {
      flush();
      pending = { term: term[1], lines: [] };
      continue;
    }
    if (pending) pending.lines.push(line);
  }
  flush();
  return sections;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/glossary/parse.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/glossary/parse.ts src/lib/glossary/parse.test.ts
git commit -m "feat(glossary): markdown parser with dedupe"
```

---

## Task 3: Generator + generated data module

**Files:**
- Create: `scripts/glossary-source/glossary-terms.md` (copied input)
- Create: `scripts/glossary-source/index.md` (provenance copy)
- Create: `scripts/generate-glossary.ts`
- Create (generated): `src/content/glossary.ts`
- Test: `src/content/glossary.test.ts`
- Modify: `package.json` (add script)

- [ ] **Step 1: Copy the source markdown into the repo**

```bash
mkdir -p scripts/glossary-source
cp ~/Desktop/DNS/Glossary/glossary-terms.md scripts/glossary-source/glossary-terms.md
cp ~/Desktop/DNS/Glossary/index.md scripts/glossary-source/index.md
```

Verify both copied:

Run: `wc -l scripts/glossary-source/*.md`
Expected: two files, `glossary-terms.md` ~889 lines.

- [ ] **Step 2: Write the generator**

`scripts/generate-glossary.ts`:

```ts
/**
 * Generate src/content/glossary.ts from scripts/glossary-source/glossary-terms.md.
 * Run: npx tsx scripts/generate-glossary.ts  (or: npm run glossary:generate)
 * The app renders the generated module; markdown is never read at runtime.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseGlossary } from "../src/lib/glossary/parse";

const SRC = join(process.cwd(), "scripts/glossary-source/glossary-terms.md");
const OUT = join(process.cwd(), "src/content/glossary.ts");

const data = parseGlossary(readFileSync(SRC, "utf8"));
const termCount = data.reduce((n, s) => n + s.terms.length, 0);

const file = `// GENERATED FILE — do not edit by hand.
// Source: scripts/glossary-source/glossary-terms.md
// Regenerate: npm run glossary:generate
import type { GlossaryLetter } from "@/lib/glossary/types";

export type { GlossaryTerm, GlossaryLetter } from "@/lib/glossary/types";

export const GLOSSARY: GlossaryLetter[] = ${JSON.stringify(data, null, 2)};
`;

writeFileSync(OUT, file, "utf8");
console.log(`Wrote ${OUT}: ${data.length} sections, ${termCount} terms`);
```

- [ ] **Step 3: Add the npm script**

In `package.json`, add to `"scripts"` (after `"db:seed"`):

```json
    "glossary:generate": "tsx scripts/generate-glossary.ts",
```

- [ ] **Step 4: Run the generator**

Run: `npm run glossary:generate`
Expected: prints `Wrote .../src/content/glossary.ts: 25 sections, ~400 terms` and creates the file. (Exact counts may vary slightly; sections should be 25 — `#` plus A–Z minus K and X.)

- [ ] **Step 5: Write the invariants test**

`src/content/glossary.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { GLOSSARY } from "./glossary";

describe("GLOSSARY (generated)", () => {
  const allTerms = GLOSSARY.flatMap((s) => s.terms);

  it("starts with the numbers section and has many letter sections", () => {
    expect(GLOSSARY[0].label).toBe("#");
    expect(GLOSSARY[0].anchor).toBe("num");
    expect(GLOSSARY.length).toBeGreaterThan(20);
  });

  it("every term has a name, slug and definition", () => {
    for (const t of allTerms) {
      expect(t.term).toBeTruthy();
      expect(t.slug).toBeTruthy();
      expect(t.definition).toBeTruthy();
    }
  });

  it("slugs are globally unique", () => {
    const slugs = allTerms.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("omits empty letters K and X", () => {
    const labels = GLOSSARY.map((s) => s.label);
    expect(labels).not.toContain("K");
    expect(labels).not.toContain("X");
  });

  it("dedupes the duplicate 'Interest rate', keeping the complete definition", () => {
    const matches = allTerms.filter((t) => t.slug === "interest-rate");
    expect(matches).toHaveLength(1);
    expect(matches[0].definition).toContain("the loan amount");
  });

  it("slugs long legal term names correctly", () => {
    expect(allTerms.map((t) => t.slug)).toContain(
      "equal-credit-opportunity-act-ecoa-15-usc-1691-et-seq",
    );
  });
});
```

- [ ] **Step 6: Run the invariants test**

Run: `npx vitest run src/content/glossary.test.ts`
Expected: PASS (6 tests). If `omits K/X` or counts fail, re-check the source file copied fully in Step 1.

- [ ] **Step 7: Commit**

```bash
git add scripts/glossary-source scripts/generate-glossary.ts src/content/glossary.ts src/content/glossary.test.ts package.json
git commit -m "feat(glossary): generator + committed glossary data module"
```

---

## Task 4: Breadcrumb primitive

**Files:**
- Create: `src/components/ui/Breadcrumb.tsx`

- [ ] **Step 1: Implement the breadcrumb**

`src/components/ui/Breadcrumb.tsx`:

```tsx
import Link from "next/link";
import { cn } from "@/lib/cn";

export type Crumb = { label: string; href?: string };

/** Ordered breadcrumb trail. Items without `href` render as plain text;
 *  the last item is marked aria-current="page". */
export function Breadcrumb({ items, className }: { items: Crumb[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center gap-1.5 text-[13px] text-muted">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={item.label} className="flex items-center gap-1.5">
              {item.href && !isLast ? (
                <Link href={item.href} className="hover:text-ink hover:underline">
                  {item.label}
                </Link>
              ) : (
                <span className={cn(isLast && "font-semibold text-ink")} aria-current={isLast ? "page" : undefined}>
                  {item.label}
                </span>
              )}
              {!isLast && <span aria-hidden="true" className="text-line">/</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
```

- [ ] **Step 2: Typecheck the new file**

Run: `npx tsc --noEmit`
Expected: no errors (existing baseline). If `@/lib/cn` path errors, confirm it exists at `src/lib/cn.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/Breadcrumb.tsx
git commit -m "feat(ui): Breadcrumb primitive"
```

---

## Task 5: GlossaryExplorer client island

**Files:**
- Create: `src/components/glossary/GlossaryExplorer.tsx`

- [ ] **Step 1: Implement the client island**

`src/components/glossary/GlossaryExplorer.tsx`:

```tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GlossaryLetter } from "@/content/glossary";
import { cn } from "@/lib/cn";

const PAGE_PATH = "/resources/mortgage-glossary";
const NAV_LETTERS = ["#", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")];
/** Offset so anchored headings clear the sticky nav. */
const SCROLL_OFFSET = "scroll-mt-[140px]";

export function GlossaryExplorer({ sections }: { sections: GlossaryLetter[] }) {
  const [query, setQuery] = useState("");
  const [activeAnchor, setActiveAnchor] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());

  // label -> anchor (only letters that actually have a section)
  const anchorByLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of sections) m.set(s.label, s.anchor);
    return m;
  }, [sections]);

  const q = query.trim().toLowerCase();

  // Filtered view: keep only terms whose NAME matches the query.
  const visibleSections = useMemo(() => {
    if (!q) return sections;
    return sections
      .map((s) => ({ ...s, terms: s.terms.filter((t) => t.term.toLowerCase().includes(q)) }))
      .filter((s) => s.terms.length > 0);
  }, [sections, q]);

  const visibleLabels = useMemo(() => new Set(visibleSections.map((s) => s.label)), [visibleSections]);
  const totalVisible = visibleSections.reduce((n, s) => n + s.terms.length, 0);

  // Smooth-scroll a term/section into view and flag it for a brief highlight.
  function scrollToTerm(slug: string) {
    const el = document.getElementById(slug);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    setHighlight(slug);
    window.setTimeout(() => setHighlight((cur) => (cur === slug ? null : cur)), 2200);
  }

  // Deep link: on mount, honor ?term=<slug> from the URL.
  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get("term");
    if (slug) requestAnimationFrame(() => scrollToTerm(slug));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track which section is active for nav highlighting.
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActiveAnchor((e.target as HTMLElement).dataset.anchor ?? null);
        }
      },
      { rootMargin: "-140px 0px -65% 0px", threshold: 0 },
    );
    sectionRefs.current.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [visibleSections]);

  function onTermClick(e: React.MouseEvent, slug: string) {
    e.preventDefault();
    window.history.replaceState(null, "", `${PAGE_PATH}?term=${slug}`);
    scrollToTerm(slug);
  }

  return (
    <div>
      {/* Filter */}
      <div className="mx-auto mb-8 max-w-[560px]">
        <label htmlFor="glossary-filter" className="sr-only">
          Filter glossary terms
        </label>
        <div className="relative">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            id="glossary-filter"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter terms…"
            className="h-[52px] w-full rounded-full border border-line bg-white pl-12 pr-5 text-[16px] text-ink outline-none focus-visible:border-green-600 focus-visible:ring-2 focus-visible:ring-spring-soft"
          />
        </div>
      </div>

      {/* Sticky A–Z nav */}
      <nav
        aria-label="Jump to letter"
        className="sticky top-0 z-30 -mx-4 mb-10 border-y border-line bg-paper/95 px-4 py-3 backdrop-blur"
      >
        <ul className="flex flex-wrap justify-center gap-1 max-[600px]:flex-nowrap max-[600px]:justify-start max-[600px]:overflow-x-auto">
          {NAV_LETTERS.map((label) => {
            const anchor = anchorByLabel.get(label);
            const enabled = anchor !== undefined && visibleLabels.has(label);
            return (
              <li key={label}>
                {enabled ? (
                  <a
                    href={`#${anchor}`}
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-md text-[14px] font-semibold text-ink hover:bg-paper-2",
                      activeAnchor === anchor && "bg-green-900 text-white hover:bg-green-900",
                    )}
                  >
                    {label}
                  </a>
                ) : (
                  <span
                    aria-disabled="true"
                    className="flex h-9 w-9 items-center justify-center rounded-md text-[14px] font-semibold text-line"
                  >
                    {label}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Body */}
      {totalVisible === 0 ? (
        <p className="py-16 text-center text-[17px] text-muted">
          No terms match “{query.trim()}”.
        </p>
      ) : (
        <div className="space-y-14">
          {visibleSections.map((s) => (
            <section
              key={s.anchor}
              id={s.anchor}
              data-anchor={s.anchor}
              ref={(el) => {
                if (el) sectionRefs.current.set(s.anchor, el);
                else sectionRefs.current.delete(s.anchor);
              }}
              className={SCROLL_OFFSET}
            >
              <h2 className="mb-5 border-b border-line pb-2 text-[28px] font-extrabold tracking-[-0.02em] text-green-900">
                {s.label}
              </h2>
              <dl className="space-y-7">
                {s.terms.map((t) => (
                  <div
                    key={t.slug}
                    id={t.slug}
                    className={cn(
                      SCROLL_OFFSET,
                      "rounded-lg transition-colors duration-500",
                      highlight === t.slug && "bg-spring-soft/40 ring-2 ring-spring-soft",
                    )}
                  >
                    <dt className="text-[18px] font-bold text-ink">
                      <a
                        href={`${PAGE_PATH}?term=${t.slug}`}
                        onClick={(e) => onTermClick(e, t.slug)}
                        className="hover:text-green-600 hover:underline"
                      >
                        {t.term}
                      </a>
                    </dt>
                    <dd className="mt-1.5 text-[15.5px] leading-[1.6] text-muted">{t.definition}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors. (If `GlossaryLetter` import errors, ensure Task 3 generated `src/content/glossary.ts` with the `export type` re-export.)

- [ ] **Step 3: Commit**

```bash
git add src/components/glossary/GlossaryExplorer.tsx
git commit -m "feat(glossary): client island (filter, sticky A–Z nav, deep links)"
```

---

## Task 6: Page + metadata + JSON-LD

**Files:**
- Create: `src/app/(marketing)/resources/mortgage-glossary/page.tsx`

- [ ] **Step 1: Implement the page**

`src/app/(marketing)/resources/mortgage-glossary/page.tsx`:

```tsx
import type { Metadata } from "next";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { GlossaryExplorer } from "@/components/glossary/GlossaryExplorer";
import { JsonLd } from "@/components/JsonLd";
import { PageJsonLd } from "@/components/seo/PageJsonLd";
import { buildMetadata } from "@/lib/seo/buildMetadata";
import { GLOSSARY } from "@/content/glossary";

const PATH = "/resources/mortgage-glossary";

export function generateMetadata(): Promise<Metadata> {
  return buildMetadata(PATH, {
    title: "Mortgage Glossary",
    description:
      "Plain-English definitions of mortgage and home-loan terms — from the 1003 form to zoning ordinances. Search and browse the MSFG mortgage glossary A–Z.",
    canonical: PATH,
  });
}

/** schema.org DefinedTermSet for the glossary (one DefinedTerm per entry). */
function definedTermSet() {
  return {
    "@context": "https://schema.org",
    "@type": "DefinedTermSet",
    name: "Mortgage Glossary",
    hasDefinedTerm: GLOSSARY.flatMap((s) =>
      s.terms.map((t) => ({
        "@type": "DefinedTerm",
        name: t.term,
        description: t.definition,
        termCode: t.slug,
        url: `${PATH}?term=${t.slug}`,
      })),
    ),
  };
}

export default function MortgageGlossaryPage() {
  return (
    <>
      <PageJsonLd path={PATH} />
      <JsonLd data={definedTermSet()} />

      <section className="bg-paper pb-6 pt-12 text-ink">
        <div className="wrap">
          <Breadcrumb
            items={[
              { label: "Home", href: "/" },
              { label: "Resources" },
              { label: "Mortgage Glossary" },
            ]}
          />
          <h1 className="mt-4 text-[clamp(32px,4.2vw,48px)] font-extrabold tracking-[-0.03em]">
            Mortgage Glossary
          </h1>
          <p className="mt-3 max-w-[60ch] text-[18px] text-muted">
            Plain-English definitions for the terms you’ll meet on the way to a home loan.
          </p>
        </div>
      </section>

      <section className="bg-paper pb-24 text-ink">
        <div className="wrap">
          <GlossaryExplorer sections={GLOSSARY} />
        </div>
      </section>
    </>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(marketing)/resources/mortgage-glossary/page.tsx"
git commit -m "feat(glossary): /resources/mortgage-glossary page + DefinedTermSet JSON-LD"
```

---

## Task 7: Footer link + nav test

**Files:**
- Modify: `src/content/nav.ts`
- Modify: `src/content/nav.test.ts`

- [ ] **Step 1: Add the footer link**

In `src/content/nav.ts`, in `FOOTER_COLUMNS` → the `"Resources"` column `links` array, add as the last entry (after `{ label: "Buy a home", href: "/buy" }`):

```ts
      { label: "Mortgage Glossary", href: "/resources/mortgage-glossary" },
```

- [ ] **Step 2: Allow the new route in the nav test**

In `src/content/nav.test.ts`, add `"/resources/mortgage-glossary"` to the `KNOWN` set (e.g. on the line with `"/about", "/careers", "/know-your-lender",`):

```ts
  "/about", "/careers", "/know-your-lender", "/resources/mortgage-glossary",
```

- [ ] **Step 3: Run the nav test**

Run: `npx vitest run src/content/nav.test.ts`
Expected: PASS (3 tests) — including "every internal link resolves to a known route".

- [ ] **Step 4: Commit**

```bash
git add src/content/nav.ts src/content/nav.test.ts
git commit -m "feat(glossary): link Mortgage Glossary in footer Resources"
```

---

## Task 8: Full verification (test + build + browser)

**Files:** none (verification only)

- [ ] **Step 1: Run the whole unit suite**

Run: `npm test`
Expected: all tests pass, including the new slug/parse/glossary/nav tests.

- [ ] **Step 2: Production build (SSG)**

Run: `npm run build`
Expected: build succeeds; `/resources/mortgage-glossary` is listed as a static (prerendered) route. If Next errors about client hooks needing Suspense, confirm `GlossaryExplorer` reads the query via `window.location.search` (Task 5) and does **not** use `useSearchParams`.

- [ ] **Step 3: Browser verification via preview workflow**

Start the dev server (`preview_start`) and load `/resources/mortgage-glossary`, then confirm:
- Breadcrumb reads **Home / Resources / Mortgage Glossary** (Home is a link).
- Sticky A–Z bar stays pinned on scroll; **K** and **X** are greyed/non-clickable (`aria-disabled`); clicking a letter smooth-scrolls to that section with the heading clearing the sticky bar.
- Typing in the filter (e.g. "escrow") narrows terms live; non-matching letters disable; clearing restores all; a no-match query shows the "No terms match" message.
- Loading `/resources/mortgage-glossary?term=escrow` scrolls to and briefly highlights the **Escrow** term.
- Clicking a term name updates the URL to `?term=<slug>` without a full reload.
- Footer **Resources** column shows **Mortgage Glossary** linking to the page.

Use `preview_console_logs` (no errors) and `preview_screenshot` to capture the result. Adjust the sticky nav `top-*` / `scroll-mt` offset if the global marketing header overlaps the pinned bar.

- [ ] **Step 4: Final commit (only if Step 3 required tweaks)**

```bash
git add -A
git commit -m "fix(glossary): sticky offset + preview polish"
```

---

## Self-Review (completed during planning)

- **Spec coverage:** data sourcing (Task 3 generator/committed module) · term filter only (Task 5) · breadcrumb (Tasks 4/6) · sticky A–Z nav with dynamic K/X disable (Tasks 5/3 invariants) · per-term slugs + `?term=` deep link + highlight (Tasks 1/5) · metadata + DefinedTermSet JSON-LD (Task 6) · footer link (Task 7) · a11y (labels, `aria-disabled`, h1→h2→h3, focus rings) (Tasks 4–6) · brand tokens only (Tasks 4–6) · committed source md provenance (Task 3). All covered.
- **Placeholder scan:** none — every code/test step is complete.
- **Type consistency:** `GlossaryTerm` / `GlossaryLetter` defined in `src/lib/glossary/types.ts`, re-exported from generated `src/content/glossary.ts`, consumed unchanged by `parse.ts`, `GlossaryExplorer.tsx`, and the page. `parseGlossary` / `slugify` / `GLOSSARY` names consistent across tasks.
```
