# Funnel Pivot (Officer Picker + Finish-Step LO Off-Ramp) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the apply-funnel's officer column with a searchable photo-forward picker and reintroduce a rendered finish screen that lets a borrower request their chosen loan officer reach out by call/text/email without leaving the page.

**Architecture:** Part 1 is a frontend-only redesign of `OfficerStep` (searchable grid + pure node-tested `filterOfficersByName`); Part 1.5 widens the shared `ApplyOfficer`/`FinishStep` types so officer contact fields flow end-to-end. Part 2 adds a tenant-scoped `contact-request` route (Postgres system-of-record + best-effort tag-only GHL sync), a typed analytics wrapper, fully-defaulted `applyOffRamp` tenant config, and rebuilds `FinishStep` into a pre-warmed Continue button plus a reveal-on-demand off-ramp with a TCPA-gated phone recapture. Every Part is independently shippable; all v1 tests are node-only (pure helpers extracted into their own modules + route tests that mock db/ghl).

**Tech Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · Prisma 7/Postgres · Zod · Vitest (node) · @vercel/analytics

**Spec:** docs/superpowers/specs/2026-06-27-funnel-pivot-officer-picker-and-lo-offramp-design.md

**Sequencing:** Part 1 (officer picker, frontend-only) → Part 1.5 (shared officer type widening) → Part 2 (finish-step off-ramp). Each Part is independently shippable.

**Known v1 scope gap (rollback lever):** `applyOffRamp.finishScreen` is derived, defaulted, and threaded to `Wizard`, but `FinishStep` does NOT gate its render on it in v1 — it always renders the screen (the v1 decision is `finishScreen: "rendered"` everywhere). This means the `finishScreen: "autoRedirect"` config rollback path (a config-only revert of commit 90188bb) is NOT functional until `FinishStep` gates on the flag. See "Rollout / known gap" at the end. The default is `"rendered"`, so behavior is correct for ship; only the config-driven rollback lever is deferred.

---

## File Structure

| File | Responsibility | Status |
| --- | --- | --- |
| `src/components/apply/steps/officerSearch.ts` | Pure case-insensitive name filter `filterOfficersByName` (node-tested) | new (Task 1) |
| `src/components/apply/steps/officerSearch.test.ts` | Node test for `filterOfficersByName` | new (Task 1) |
| `src/components/apply/steps/OfficerStep.tsx` | Searchable photo-forward officer grid; owns the widened `ApplyOfficer` type + `NO_PREFERENCE` sentinel | modified (Tasks 2, 3) |
| `src/app/apply/[intent]/page.tsx` | Server Component: maps roster → `ApplyOfficer[]` (now incl. `email`/`phone`); derives `applyOffRamp` config; threads props (incl. tenant email) to `Wizard` | modified (Tasks 3, 9, 16) |
| `src/components/apply/steps/FinishStep.tsx` | Finish screen: pre-warmed Continue button + reveal-on-demand LO off-ramp + TCPA-gated phone recapture; widened `officer` prop | modified (Task 3, 13–15) |
| `src/components/apply/Wizard.tsx` | Threads `applyOffRamp` + house line + tenant email + consent + officer to `FinishStep`; updates stale heading comment | modified (Task 16) |
| `src/validation/lead.ts` | `contactRequestSchema` + `ContactRequestInput` (reuses `idempotencyKeySchema`) | modified (Task 4) |
| `src/validation/lead.test.ts` | Node test for `contactRequestSchema` | new (Task 4) |
| `src/server/leads/leadService.ts` | `recordContactRequest` (read-modify-write of `contactPreference`) + `syncContactRequestTag` (best-effort GHL tag) + `resolveOfficerFromAnswers` | modified (Tasks 5, 6) |
| `src/server/leads/recordContactRequest.test.ts` | Node test for `recordContactRequest` (mocks db) | new (Task 5) |
| `src/server/leads/syncContactRequestTag.test.ts` | Node test for `syncContactRequestTag` (mocks ghlClient) | new (Task 6) |
| `src/server/integrations/ghl/mappers.ts` | `leadToContactInput` extended with optional `Requested:<channel>` + `officer:<slug>` tags | modified (Task 6) |
| `src/server/integrations/ghl/mappers.test.ts` | Node test for the extended mapper tags | new (Task 6) |
| `src/app/api/v1/leads/[id]/contact-request/route.ts` | `POST` handler: 400/404/422 gates + best-effort tag fire | new (Task 7) |
| `src/app/api/v1/leads/[id]/contact-request/route.test.ts` | Node route test (mocks leadService) | new (Task 7) |
| `src/lib/leads.ts` | `requestContact` fire-and-forget client helper (own idempotencyKey) | modified (Task 8) |
| `src/lib/requestContact.test.ts` | Node test for `requestContact` (mocks fetch) | new (Task 8) |
| `src/content/site.ts` | `ApplyOffRampSchema` + `applyOffRamp` on `TenantConfigSchema`/`DEFAULT_TENANT_CONFIG` + `deriveApplyOffRamp` | modified (Task 9) |
| `src/content/applyOffRamp.test.ts` | Node test for config defaults + override | new (Task 9) |
| `src/lib/analytics.ts` | Typed client-only `track()` wrapper over `@vercel/analytics` + `AnalyticsEvent` union | new (Task 10) |
| `src/components/apply/steps/handoffStale.ts` | Pure `isHandoffTokenStale` + `HANDOFF_STALE_MS` (node-tested) | new (Task 11) |
| `src/components/apply/steps/handoffStale.test.ts` | Node test for `isHandoffTokenStale` | new (Task 11) |
| `src/components/apply/steps/offRampLink.ts` | Pure `telHref`/`smsHref` guards (no bare `+`) (node-tested) | new (Task 12) |
| `src/components/apply/steps/offRampLink.test.ts` | Node test for the link guards | new (Task 12) |

---

## Task 1 — Extract the pure name filter into `officerSearch.ts` (failing test first)

The officer picker needs a case-insensitive substring filter on officer names. Per DECISIONS (node-only tests), extract this as a pure function in its own module so it is node-testable without any DOM.

- [ ] **1a — Write the failing test.** Create `/Users/zacharyzink/MSFG/WebProjects/msfg.us/src/components/apply/steps/officerSearch.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { filterOfficersByName } from "./officerSearch";
import type { ApplyOfficer } from "./OfficerStep";

const o = (slug: string, name: string): ApplyOfficer => ({
  slug,
  name,
  title: "Loan Officer",
  nmls: "123456",
  states: ["CO"],
  photo: "/x.jpg",
  email: `${slug}@msfg.us`,
  phone: "3035551234",
});

const officers: ApplyOfficer[] = [
  o("zachary-zink", "Zachary Zink"),
  o("jane-doe", "Jane Doe"),
  o("john-smith", "John Smith"),
];

describe("filterOfficersByName", () => {
  it("returns the full list unchanged when the query is empty", () => {
    expect(filterOfficersByName(officers, "")).toEqual(officers);
  });

  it("returns the full list unchanged when the query is only whitespace", () => {
    expect(filterOfficersByName(officers, "   ")).toEqual(officers);
  });

  it("matches on a case-insensitive substring of the name", () => {
    const out = filterOfficersByName(officers, "ZACH");
    expect(out.map((x) => x.slug)).toEqual(["zachary-zink"]);
  });

  it("matches a substring anywhere in the name (not just the start)", () => {
    const out = filterOfficersByName(officers, "smith");
    expect(out.map((x) => x.slug)).toEqual(["john-smith"]);
  });

  it("rejects non-matching queries with an empty array", () => {
    expect(filterOfficersByName(officers, "zzz")).toEqual([]);
  });
});
```

- [ ] **1b — Run it, expect FAIL** (module does not exist yet):

```bash
npx vitest run src/components/apply/steps/officerSearch.test.ts
```

Expected: FAIL — `Cannot find module './officerSearch'` (or a resolution error), 0 passing.

- [ ] **1c — Minimal implementation.** Create `/Users/zacharyzink/MSFG/WebProjects/msfg.us/src/components/apply/steps/officerSearch.ts`:

```typescript
import type { ApplyOfficer } from "./OfficerStep";

/**
 * Case-insensitive substring filter on officer name. An empty or
 * whitespace-only query returns the input list unchanged (so the picker falls
 * back to the in-state default view). Pure + node-testable — no DOM.
 */
export function filterOfficersByName(
  officers: ApplyOfficer[],
  query: string,
): ApplyOfficer[] {
  const q = query.trim().toLowerCase();
  if (!q) return officers;
  return officers.filter((o) => o.name.toLowerCase().includes(q));
}
```

> Note: This imports the `ApplyOfficer` type from `OfficerStep.tsx`, which at this point still has the **narrow** shape (no `email`/`phone`). The test fixture above includes `email`/`phone`, so it will fail type-checking until Task 2 widens `ApplyOfficer`. That is intentional and acceptable: vitest runs the test via esbuild (transpile-only, no type-check), so the test PASSES at runtime now, and Task 2 makes the types align. Do not add `email`/`phone` to the type in this task.

- [ ] **1d — Run it, expect PASS:**

```bash
npx vitest run src/components/apply/steps/officerSearch.test.ts
```

Expected: PASS — 5 passing.

- [ ] **1e — Commit:**

```bash
git add src/components/apply/steps/officerSearch.ts src/components/apply/steps/officerSearch.test.ts
git commit -m "feat(apply): pure filterOfficersByName helper for officer picker

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2 — Redesign `OfficerStep` as a searchable photo-forward grid

This rewrites the officer picker UI: add a search box, replace the vertical column with a responsive grid, redesign each tile photo-forward, move NMLS/states into the tile title + `aria-label`, drop the `showAll`/"Show all" affordance, add an `aria-live` empty state, and preserve auto-advance + "No preference". This is a frontend-only change with no node test (DOM tests are out of v1 — see Task 3's checklist note and the Final verification checklist).

There is no failing-test step here because this is pure presentational JSX with no extractable pure logic beyond `filterOfficersByName` (already tested in Task 1). Verification is the typecheck/lint/build in 2b and the manual checklist in Final verification.

- [ ] **2a — Replace the whole file.** Overwrite `/Users/zacharyzink/MSFG/WebProjects/msfg.us/src/components/apply/steps/OfficerStep.tsx` with:

```tsx
"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/cn";
import { stateName } from "@/content/officers";
import { filterOfficersByName } from "./officerSearch";

/** Lightweight officer shape passed from the server (no bios → smaller client
 *  bundle). Derived in apply/[intent]/page.tsx from the tenant roster. */
export type ApplyOfficer = {
  slug: string;
  name: string;
  title: string;
  nmls: string;
  states: string[];
  photo: string;
  email: string;
  phone: string;
};

/** Sentinel stored when the user declines to pick a specific officer. */
export const NO_PREFERENCE = "no-preference";

/**
 * Loan-officer picker. Defaults to officers licensed in the property's state
 * (derived from the address step), with a case-insensitive name search that,
 * when non-empty, searches the FULL roster (so a borrower can always reach an
 * out-of-state officer by name). A "No preference" choice keeps the funnel from
 * ever stalling. Tapping a tile stores the officer slug (or the sentinel) and
 * auto-advances, matching ChoiceStep.
 */
export function OfficerStep({
  officers,
  propertyState,
  sub,
  selected,
  onPick,
}: {
  officers: ApplyOfficer[];
  /** USPS state code of the subject property, when known. */
  propertyState?: string;
  sub?: string;
  /** Currently selected officer slug or NO_PREFERENCE. */
  selected?: string;
  /** Called on tap; parent stores the value and auto-advances. */
  onPick: (value: string) => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim();

  // In-state subset (the default view). Only applied when it yields matches.
  const inState = propertyState
    ? officers.filter((o) => o.states.includes(propertyState))
    : [];
  // Default (no search): show in-state when available, else everyone.
  // Searching: ignore the state filter and search the full roster by name.
  const base = q ? officers : inState.length > 0 ? inState : officers;
  const visible = useMemo(() => filterOfficersByName(base, q), [base, q]);

  const showInStateNote = !q && inState.length > 0 && propertyState;

  return (
    <>
      <div className="mb-5">
        <label htmlFor="officer-search" className="sr-only">
          Search loan officers by name
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
            id="officer-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name…"
            className="h-[52px] w-full rounded-full border border-line bg-white pl-12 pr-5 text-[16px] text-ink outline-none focus-visible:border-green-600 focus-visible:ring-2 focus-visible:ring-spring-soft"
          />
        </div>
      </div>

      {showInStateNote && (
        <p className="-mt-1 mb-5 text-[15px] text-muted">
          Licensed in{" "}
          <span className="font-semibold text-ink">{stateName(propertyState)}</span>
        </p>
      )}

      {visible.length === 0 ? (
        <p
          aria-live="polite"
          className="py-10 text-center text-[16px] text-muted"
        >
          No loan officers match “{q}”.
        </p>
      ) : (
        <div className="grid grid-cols-4 gap-3 max-[980px]:grid-cols-2">
          {visible.map((o) => {
            const on = selected === o.slug;
            return (
              <button
                key={o.slug}
                type="button"
                aria-pressed={on}
                aria-label={`${o.name}, ${o.title}, NMLS #${o.nmls}, licensed in ${o.states.join(", ")}`}
                onClick={() => onPick(o.slug)}
                className={cn(
                  "flex flex-col items-center gap-2.5 rounded-lg border-[1.5px] px-3 py-4 text-center transition-[transform,border-color,background,box-shadow,color] duration-150",
                  on
                    ? "border-green-600 bg-green-600 text-white [box-shadow:0_4px_0_#0a3a2a,var(--shadow-pop)]"
                    : "border-line bg-white text-ink shadow-3d hover:-translate-y-0.5 hover:border-green-600 hover:shadow-pop",
                )}
              >
                <span className="relative size-16 shrink-0 overflow-hidden rounded-full border border-line bg-paper-2">
                  <Image src={o.photo} alt="" fill sizes="64px" className="object-cover object-top" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[15px] font-bold leading-tight break-words hyphens-auto">{o.name}</span>
                  <span className={cn("mt-0.5 block text-[12.5px] font-semibold", on ? "text-white/85" : "text-green-600")}>
                    {o.title}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      <button
        type="button"
        aria-pressed={selected === NO_PREFERENCE}
        onClick={() => onPick(NO_PREFERENCE)}
        className={cn(
          "mt-5 flex min-h-[64px] w-full items-center rounded-lg border-[1.5px] px-[22px] text-left text-[16px] font-bold transition-[transform,border-color,background,box-shadow,color] duration-150",
          selected === NO_PREFERENCE
            ? "border-green-600 bg-green-600 text-white [box-shadow:0_4px_0_#0a3a2a,var(--shadow-pop)]"
            : "border-line bg-white text-ink shadow-3d hover:-translate-y-0.5 hover:border-green-600 hover:shadow-pop",
        )}
      >
        No preference — match me with the right loan officer
      </button>

      {sub && <div className="mt-6 text-[15px] text-muted">{sub}</div>}
    </>
  );
}
```

**a11y + layout specifics baked in (per spec):**
- The search input has a real, `sr-only` `<label htmlFor="officer-search">`; the input carries `id="officer-search"` to match.
- `type="search"` and `focus-visible:ring-2 focus-visible:ring-spring-soft` (spring-soft is the AA-safe focus ring on white per the design tokens).
- **No `autoFocus`** and **no `onKeyDown`/Enter handler** (the picker auto-advances on tap; an Enter handler would conflict). This is a deliberate departure from `PlaceStep`.
- Each tile keeps `aria-pressed={on}` for selected state and gains an `aria-label` that voices the name, title, NMLS#, and licensed states — because that metadata is no longer rendered as visible text in the compact grid tile (only name + title show).
- **Long-name wrap (spec line 86):** the name span carries `break-words hyphens-auto` so multi-word or long single-token names (e.g. "Michael Grensteiner", "Robert Hoff, CFA") wrap inside the ~120px grid tile rather than overflowing or truncating. The parent span keeps `min-w-0` so flex/grid children can shrink.
- The magnifier SVG is `aria-hidden` + `pointer-events-none` (copied verbatim from `GlossaryExplorer`).
- The empty state uses `aria-live="polite"` so a screen reader announces "No loan officers match …" when a search clears the grid.

- [ ] **2b — Verify lint (full `tsc` deferred to Task 3).**

> Note: `tsc --noEmit` will surface the `email`/`phone` widening consumed elsewhere only after Task 3 (the `page.tsx` map still omits `email`/`phone`, which **will** error until 3b). So run only eslint here and defer the full typecheck to Task 3d:

```bash
npx eslint src/components/apply/steps/OfficerStep.tsx src/components/apply/steps/officerSearch.ts
```

Expected: PASS — no lint errors.

- [ ] **2c — Commit:**

```bash
git add src/components/apply/steps/OfficerStep.tsx
git commit -m "feat(apply): photo-forward searchable officer grid

Search box (no autofocus, no Enter handler) over a 4-col→2-col grid;
NMLS/states moved into tile title + aria-label; long names wrap via
break-words; aria-live empty state; drops showAll/Show-all link;
keeps auto-advance + No preference.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3 — Shared widening: `ApplyOfficer` gains `email`/`phone`; page map + FinishStep prop

This is the small shared type change that Part 2 depends on. `ApplyOfficer` was already widened in Task 2a (the file now declares `email`/`phone`); this task wires the producer (`page.tsx`) and the consumer (`FinishStep`) so the whole graph type-checks.

- [ ] **3a — Confirm the widened type is in place.** `ApplyOfficer` in `/Users/zacharyzink/MSFG/WebProjects/msfg.us/src/components/apply/steps/OfficerStep.tsx` must already be (from Task 2a):

```tsx
export type ApplyOfficer = {
  slug: string;
  name: string;
  title: string;
  nmls: string;
  states: string[];
  photo: string;
  email: string;
  phone: string;
};
```

No edit needed if Task 2 landed exactly. If you skipped 2, add `email: string;` and `phone: string;` to the type now.

- [ ] **3b — Add `email`/`phone` to the `page.tsx` officer map.** The roster source (`src/server/officers/map.ts` → `rowToOfficer`) already projects `email` and `phone` (with `''` fallback), so the values are available on each `o`. Edit the map in `/Users/zacharyzink/MSFG/WebProjects/msfg.us/src/app/apply/[intent]/page.tsx`.

Replace this exact block (lines 48–55):

```typescript
  const officers: ApplyOfficer[] = (await listOfficers()).map((o) => ({
    slug: o.slug,
    name: o.name,
    title: o.title,
    nmls: o.nmls,
    states: o.states,
    photo: o.photo,
  }));
```

with:

```typescript
  const officers: ApplyOfficer[] = (await listOfficers()).map((o) => ({
    slug: o.slug,
    name: o.name,
    title: o.title,
    nmls: o.nmls,
    states: o.states,
    photo: o.photo,
    email: o.email,
    phone: o.phone,
  }));
```

- [ ] **3c — Widen the `FinishStep` officer prop type.** The off-ramp (Part 2) needs the chosen officer's `nmls`, `photo`, `email`, and `phone` on the finish screen, so widen the prop from `{ slug; name }` to the contract shape. Edit `/Users/zacharyzink/MSFG/WebProjects/msfg.us/src/components/apply/steps/FinishStep.tsx`.

Replace this exact line (line 31):

```tsx
  officer?: { slug: string; name: string } | null;
```

with:

```tsx
  officer?: { slug: string; name: string; nmls: string; photo: string; email: string; phone: string } | null;
```

> Note: **No `Wizard.tsx` call-site change is required.** `Wizard` derives `chosenOfficer` as `officers.find((o) => o.slug === officerSlug) ?? null` (an `ApplyOfficer | null`) and passes the whole object straight into `<FinishStep officer={chosenOfficer} />`. Because `ApplyOfficer` now structurally includes `slug`, `name`, `nmls`, `photo`, `email`, and `phone`, it already satisfies the widened prop — no edit to `Wizard.tsx`, and `FinishStep`'s current fallback (which reads only `officer.name` and `officer.slug`) keeps working unchanged.

- [ ] **3d — Full typecheck (now consistent end-to-end):**

```bash
npx tsc --noEmit
```

Expected: PASS — no errors. (This is the verification gate for Tasks 2 + 3 together: the producer now supplies `email`/`phone`, the type declares them, and both consumers accept the wider shape.)

- [ ] **3e — Re-run the officer search test to confirm the fixture now type-aligns:**

```bash
npx vitest run src/components/apply/steps/officerSearch.test.ts
```

Expected: PASS — 5 passing (and the `email`/`phone` fields in the test fixture now match the widened `ApplyOfficer`).

- [ ] **3f — Commit:**

```bash
git add src/app/apply/[intent]/page.tsx src/components/apply/steps/FinishStep.tsx
git commit -m "feat(apply): widen ApplyOfficer + FinishStep officer prop with email/phone

Producer (apply/[intent]/page.tsx) now maps email/phone from the roster;
FinishStep officer prop widened to {slug,name,nmls,photo,email,phone}|null
for the Part 2 off-ramp. Wizard passes the full ApplyOfficer object already,
so no call-site change.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4 — `contactRequestSchema` validation (+ node test)

**Files:** `src/validation/lead.ts`, `src/validation/lead.test.ts` (new)

This adds the request-body schema for `POST /api/v1/leads/{id}/contact-request`. It reuses the existing `idempotencyKeySchema` (defined at `src/validation/lead.ts:33-36`).

- [ ] **4a — Write the failing test.** Create `src/validation/lead.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { contactRequestSchema } from "./lead";

describe("contactRequestSchema", () => {
  it("accepts a minimal email request (channel only)", () => {
    const r = contactRequestSchema.safeParse({ channel: "email" });
    expect(r.success).toBe(true);
  });

  it("accepts a call request with a recaptured phone + consent", () => {
    const r = contactRequestSchema.safeParse({
      channel: "call",
      phone: "3035551234",
      consentTcpa: true,
      idempotencyKey: "abc-1234567890-xyz", // ≥16 chars
    });
    expect(r.success).toBe(true);
  });

  it("accepts an empty-string phone (treated as no recapture)", () => {
    const r = contactRequestSchema.safeParse({ channel: "text", phone: "" });
    expect(r.success).toBe(true);
  });

  it("rejects an unknown channel", () => {
    const r = contactRequestSchema.safeParse({ channel: "fax" });
    expect(r.success).toBe(false);
  });

  it("rejects a too-short non-empty phone", () => {
    const r = contactRequestSchema.safeParse({ channel: "call", phone: "123" });
    expect(r.success).toBe(false);
  });

  it("rejects a missing channel", () => {
    const r = contactRequestSchema.safeParse({ phone: "3035551234" });
    expect(r.success).toBe(false);
  });

  it("does NOT enforce the consent gate at the schema layer (consent is a route-level 422)", () => {
    // The schema allows call+phone with no consent; the ROUTE returns 422.
    const r = contactRequestSchema.safeParse({ channel: "call", phone: "3035551234" });
    expect(r.success).toBe(true);
  });
});
```

- [ ] **4b — Run it (expected FAIL — `contactRequestSchema` is not exported yet):**

```bash
npx vitest run src/validation/lead.test.ts
```

Expected: import error / "contactRequestSchema is not a function" → tests FAIL.

- [ ] **4c — Add the schema.** In `src/validation/lead.ts`, insert immediately after the `applicationHandoffSchema` block (after the `export type ApplicationHandoffInput` line, at the end of the file):

```ts

// ---------------------------------------------------------------------------
// Contact-request contract — POST /api/v1/leads/{id}/contact-request.
// The off-ramp lets a borrower ask their chosen officer to reach out by
// call/text/email. `phone` is an OPTIONAL recapture used only when the
// borrower skipped the phone step; an empty string means "no recapture".
// NOTE: the schema does NOT encode the TCPA consent gate — that is enforced at
// the ROUTE (422) so the rule (call|text + non-empty phone + !consentTcpa)
// stays a single server-side decision and is unit-testable in the route tests.
// ---------------------------------------------------------------------------
export const contactRequestSchema = z.object({
  channel: z.enum(["call", "text", "email"]),
  phone: z
    .string()
    .trim()
    .refine((v) => v === "" || v.length >= 7, "invalid phone")
    .optional(),
  consentTcpa: z.boolean().optional(),
  idempotencyKey: idempotencyKeySchema.optional(),
});
export type ContactRequestInput = z.infer<typeof contactRequestSchema>;
```

- [ ] **4d — Run it (expected PASS):**

```bash
npx vitest run src/validation/lead.test.ts
```

Expected: all 7 tests PASS.

- [ ] **4e — Commit:**

```bash
git add src/validation/lead.ts src/validation/lead.test.ts && git commit -m "feat(leads): contactRequestSchema for off-ramp contact-request route

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5 — `recordContactRequest` leadService helper (+ node test)

**Files:** `src/server/leads/leadService.ts`, `src/server/leads/recordContactRequest.test.ts` (new)

This is the tenant-scoped read-modify-write that persists `contactPreference` into the FULL `answers` blob (preserving `loanOfficer` and every other `answers.fields` key), idempotent on `channels[]`, and resolves `{name,slug}` server-side from `answers.fields.loanOfficer`. It mirrors the `patchLead` pattern (`leadService.ts:53-57`) and `getLeadById` (`leadService.ts:168-171`).

It uses the exact return contract from the shared signature:
`Promise<{ ok: true; channelWasNew: boolean; officer: { name: string; slug: string } | null } | { ok: false; reason: "not_found" | "consent_required" }>`.

The `consent_required` reason is reserved for the route's defense-in-depth call (the route checks the gate first and returns 422 itself, but `recordContactRequest` also refuses to persist a recaptured `phone` for call/text without `consentTcpa`). The route is the authority; this is belt-and-suspenders.

> **Single read (no re-read):** the implementation calls `db.lead.findFirst` EXACTLY ONCE, then `updateMany`. The returned `officer` is resolved from that single read (`lead.answers`). The test below therefore mocks `findFirst` with a SINGLE `mockResolvedValueOnce` per case — there is no second read to mock.

- [ ] **5a — Write the failing test.** Create `src/server/leads/recordContactRequest.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Tenant DB is mocked; we assert on what gets written via updateMany.
const updateMany = vi.fn();
const findFirst = vi.fn();
vi.mock("@/lib/db", () => ({
  getTenantDb: vi.fn(async () => ({
    lead: { updateMany, findFirst },
  })),
}));
vi.mock("@/content/officers", () => ({
  OFFICERS: [{ slug: "robert-hoff", name: "Robert Hoff, CFA" }],
}));

import { recordContactRequest } from "./leadService";

function leadRow(answers: unknown) {
  return { id: "row-1", firstName: "Z", lastName: "Z", email: "z@x.com", phone: "", answers };
}

beforeEach(() => {
  updateMany.mockReset().mockResolvedValue({ count: 1 });
  findFirst.mockReset();
});

describe("recordContactRequest", () => {
  it("returns not_found when the lead does not exist", async () => {
    findFirst.mockResolvedValueOnce(null);
    const r = await recordContactRequest("missing", { channel: "email" });
    expect(r).toEqual({ ok: false, reason: "not_found" });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("records a new channel without clobbering loanOfficer/address", async () => {
    findFirst.mockResolvedValueOnce(
      leadRow({ fields: { loanOfficer: "robert-hoff", address: { state: "CO" } }, returning: false }),
    );
    const r = await recordContactRequest("row-1", { channel: "email" });
    expect(r).toEqual({ ok: true, channelWasNew: true, officer: { name: "Robert Hoff, CFA", slug: "robert-hoff" } });
    const written = updateMany.mock.calls[0][0].data.answers as Record<string, unknown>;
    const fields = written.fields as Record<string, unknown>;
    expect(fields.loanOfficer).toBe("robert-hoff");
    expect(fields.address).toEqual({ state: "CO" });
    expect(written.returning).toBe(false); // top-level answers keys survive too
    const pref = fields.contactPreference as Record<string, unknown>;
    expect(pref.channels).toEqual(["email"]);
    expect(pref.latest).toBe("email");
    expect(typeof pref.requestedAt).toBe("string");
  });

  it("is idempotent on the same channel (channelWasNew=false) but refreshes latest/requestedAt", async () => {
    findFirst.mockResolvedValueOnce(
      leadRow({ fields: { contactPreference: { channels: ["text"], latest: "text", requestedAt: "OLD" } } }),
    );
    const r = await recordContactRequest("row-1", { channel: "text" });
    expect(r).toEqual({ ok: true, channelWasNew: false, officer: null });
    const pref = (updateMany.mock.calls[0][0].data.answers as { fields: { contactPreference: Record<string, unknown> } })
      .fields.contactPreference;
    expect(pref.channels).toEqual(["text"]); // not duplicated
    expect(pref.requestedAt).not.toBe("OLD"); // refreshed
  });

  it("appends a switched channel (records BOTH channels)", async () => {
    findFirst.mockResolvedValueOnce(
      leadRow({ fields: { contactPreference: { channels: ["text"], latest: "text", requestedAt: "OLD" } } }),
    );
    const r = await recordContactRequest("row-1", { channel: "call" });
    expect(r).toMatchObject({ ok: true, channelWasNew: true });
    const pref = (updateMany.mock.calls[0][0].data.answers as { fields: { contactPreference: Record<string, unknown> } })
      .fields.contactPreference;
    expect(pref.channels).toEqual(["text", "call"]);
    expect(pref.latest).toBe("call");
  });

  it("stores recaptured phone + consent fields when provided", async () => {
    findFirst.mockResolvedValueOnce(leadRow({ fields: {} }));
    await recordContactRequest("row-1", { channel: "call", phone: "3035551234", consentTcpa: true });
    const pref = (updateMany.mock.calls[0][0].data.answers as { fields: { contactPreference: Record<string, unknown> } })
      .fields.contactPreference;
    expect(pref.phone).toBe("3035551234");
    expect(pref.consentTcpa).toBe(true);
    expect(typeof pref.consentRequestedAt).toBe("string");
  });

  it("refuses a call/text recapture phone without consent (consent_required, nothing written)", async () => {
    findFirst.mockResolvedValueOnce(leadRow({ fields: {} }));
    const r = await recordContactRequest("row-1", { channel: "call", phone: "3035551234" });
    expect(r).toEqual({ ok: false, reason: "consent_required" });
    expect(updateMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **5b — Run it (expected FAIL — `recordContactRequest` not exported):**

```bash
npx vitest run src/server/leads/recordContactRequest.test.ts
```

Expected: import error → tests FAIL.

- [ ] **5c — Add the helper.** In `src/server/leads/leadService.ts`, add the `OFFICERS` import to the top import block (after the existing imports, before the `toIntentEnum` function):

```ts
import { OFFICERS } from "@/content/officers";
```

Then append to the end of `src/server/leads/leadService.ts` (after `getLeadById`):

```ts

/** Persisted shape at lead.answers.fields.contactPreference. */
type ContactPreference = {
  channels: ("call" | "text" | "email")[];
  latest: "call" | "text" | "email";
  requestedAt: string;
  phone?: string;
  consentTcpa?: boolean;
  consentRequestedAt?: string;
};

/** Resolve the officer the borrower chose, server-side, from the persisted
 *  slug at answers.fields.loanOfficer. Returns only {name,slug} (sufficient for
 *  the GHL tag); never trust a client-sent officer identity. */
function resolveOfficerFromAnswers(
  answers: unknown,
): { name: string; slug: string } | null {
  const slug = (answers as { fields?: Record<string, unknown> })?.fields?.loanOfficer;
  if (typeof slug !== "string" || !slug) return null;
  const o = OFFICERS.find((x) => x.slug === slug);
  return o ? { name: o.name, slug: o.slug } : null;
}

/**
 * Record an off-ramp contact request on the lead, tenant-scoped and idempotent
 * on the channel set. Postgres is the system-of-record; this is the durable
 * write. The route fires the best-effort GHL tag afterward (only when the
 * channel is newly added).
 *
 * SINGLE READ: we call findFirst once, then updateMany — the returned officer is
 * resolved from that same read. There is intentionally no re-read after the write.
 *
 * READ-MODIFY-WRITE of the FULL answers blob: the scoped client bans `.update()`
 * and `updateMany` REPLACES the JSON column (not a deep merge), so we must
 * reconstruct the entire answers object — preserving every existing
 * answers.fields key (loanOfficer, address, …) so the /continue hand-off is not
 * clobbered. TOCTOU note: the read→write window is unguarded; acceptable for v1
 * (single funnel session, low contention).
 */
export async function recordContactRequest(
  leadId: string,
  input: { channel: "call" | "text" | "email"; phone?: string; consentTcpa?: boolean },
): Promise<
  | { ok: true; channelWasNew: boolean; officer: { name: string; slug: string } | null }
  | { ok: false; reason: "not_found" | "consent_required" }
> {
  const db = await getTenantDb();
  const lead = await db.lead.findFirst({ where: { id: leadId } });
  if (!lead) return { ok: false, reason: "not_found" };

  const recapturedPhone = input.phone && input.phone.trim() !== "" ? input.phone.trim() : undefined;

  // Belt-and-suspenders: a recaptured call/text number requires affirmative
  // consent (the route also enforces this with a 422 before calling us).
  if (recapturedPhone && (input.channel === "call" || input.channel === "text") && input.consentTcpa !== true) {
    return { ok: false, reason: "consent_required" };
  }

  const answers = (lead.answers ?? {}) as Record<string, unknown>;
  const fields = (answers.fields ?? {}) as Record<string, unknown>;
  const prior = (fields.contactPreference ?? null) as ContactPreference | null;

  const priorChannels = prior?.channels ?? [];
  const channelWasNew = !priorChannels.includes(input.channel);
  const channels = channelWasNew ? [...priorChannels, input.channel] : priorChannels;
  const nowIso = new Date().toISOString();

  const nextPref: ContactPreference = {
    channels,
    latest: input.channel,
    requestedAt: nowIso,
    ...(prior?.phone ? { phone: prior.phone } : {}),
    ...(prior?.consentTcpa ? { consentTcpa: prior.consentTcpa } : {}),
    ...(prior?.consentRequestedAt ? { consentRequestedAt: prior.consentRequestedAt } : {}),
    // A newly recaptured number + consent overrides any prior.
    ...(recapturedPhone
      ? { phone: recapturedPhone, consentTcpa: true, consentRequestedAt: nowIso }
      : {}),
  };

  const nextAnswers = {
    ...answers,
    fields: { ...fields, contactPreference: nextPref },
  };

  await db.lead.updateMany({ where: { id: leadId }, data: { answers: nextAnswers as object } });

  return {
    ok: true,
    channelWasNew,
    officer: resolveOfficerFromAnswers(lead.answers),
  };
}
```

Note: `new Date().toISOString()` runs inside this request-time service function (not at module/render scope), so it does not violate the SSG determinism rule.

- [ ] **5d — Run it (expected PASS):**

```bash
npx vitest run src/server/leads/recordContactRequest.test.ts
```

Expected: all 6 tests PASS.

- [ ] **5e — Commit:**

```bash
git add src/server/leads/leadService.ts src/server/leads/recordContactRequest.test.ts && git commit -m "feat(leads): recordContactRequest read-modify-write of contactPreference

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6 — `Requested:<channel>` GHL tag + `syncContactRequestTag` (+ node test)

**Files:** `src/server/integrations/ghl/mappers.ts`, `src/server/leads/leadService.ts`, `src/server/integrations/ghl/mappers.test.ts` (new), `src/server/leads/syncContactRequestTag.test.ts` (new)

Two parts: (1) extend `leadToContactInput` to optionally append a `Requested:<channel>` tag (and optional `officer:<slug>`); (2) add the best-effort `syncContactRequestTag` that re-upserts the contact with that tag, swallowing all errors. Reuses `ghlClient.upsertContact` (which short-circuits via `ghlConfigured()`, per `ghlClient.ts:156-167`) and mirrors the `dispatchToGhl` swallow pattern.

> **Tag form is `Requested:<channel>` with NO space** (e.g. `Requested:call`) — consistent across prose, implementation, and tests. If a GHL automation/segment already keys on a different string, reconcile before shipping.

- [ ] **6a — Write the mapper test.** Create `src/server/integrations/ghl/mappers.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { leadToContactInput } from "./mappers";

const lead = {
  firstName: "Z",
  lastName: "Z",
  email: "z@x.com",
  phone: "3035551234",
  source: "apply-wizard",
  intent: "REFI",
  location: null,
} as unknown as Parameters<typeof leadToContactInput>[0];

describe("leadToContactInput contact-request tags", () => {
  it("keeps the base tags when no options are passed", () => {
    const out = leadToContactInput(lead);
    expect(out.tags).toEqual(["MSFG Web", "intent:REFI"]);
  });

  it("appends Requested:<channel> when requestedChannel is given", () => {
    const out = leadToContactInput(lead, { requestedChannel: "call" });
    expect(out.tags).toEqual(["MSFG Web", "intent:REFI", "Requested:call"]);
  });

  it("appends officer:<slug> when officerSlug is given", () => {
    const out = leadToContactInput(lead, { requestedChannel: "text", officerSlug: "robert-hoff" });
    expect(out.tags).toEqual([
      "MSFG Web",
      "intent:REFI",
      "Requested:text",
      "officer:robert-hoff",
    ]);
  });
});
```

- [ ] **6b — Run it (expected FAIL — `leadToContactInput` takes one arg):**

```bash
npx vitest run src/server/integrations/ghl/mappers.test.ts
```

Expected: TypeScript/arity error or wrong tags → FAIL.

- [ ] **6c — Extend the mapper.** In `src/server/integrations/ghl/mappers.ts`, replace the `leadToContactInput` function (lines 13-26) with:

```ts
/** Optional off-ramp context: appends contact-request tags. */
export type ContactRequestTagOpts = {
  requestedChannel?: "call" | "text" | "email";
  officerSlug?: string;
};

/** Map a Lead → GHL contact upsert input. When off-ramp context is supplied,
 *  appends an accumulating "Requested:<channel>" tag (and optional
 *  "officer:<slug>") on top of the base tags. */
export function leadToContactInput(
  lead: Lead,
  opts: ContactRequestTagOpts = {},
): UpsertContactInput {
  const tags = ["MSFG Web", `intent:${lead.intent}`];
  if (opts.requestedChannel) tags.push(`Requested:${opts.requestedChannel}`);
  if (opts.officerSlug) tags.push(`officer:${opts.officerSlug}`);
  return {
    firstName: lead.firstName,
    lastName: lead.lastName,
    email: lead.email,
    phone: lead.phone,
    source: lead.source,
    tags,
    customFields: {
      ...(lead.location ? { location: lead.location } : {}),
    },
  };
}
```

- [ ] **6d — Run the mapper test (expected PASS):**

```bash
npx vitest run src/server/integrations/ghl/mappers.test.ts
```

Expected: all 3 tests PASS. (The existing `dispatchToGhl` call site `leadToContactInput(lead)` still works — `opts` defaults to `{}`.)

- [ ] **6e — Write the sync test.** Create `src/server/leads/syncContactRequestTag.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const upsertContact = vi.fn();
vi.mock("@/server/integrations/ghl/ghlClient", () => ({
  ghlClient: { upsertContact },
}));
vi.mock("@/content/officers", () => ({
  OFFICERS: [{ slug: "robert-hoff", name: "Robert Hoff, CFA" }],
}));

import { syncContactRequestTag } from "./leadService";

const lead = {
  id: "row-1",
  firstName: "Z",
  lastName: "Z",
  email: "z@x.com",
  phone: "3035551234",
  source: "apply-wizard",
  intent: "REFI",
  location: null,
  answers: { fields: { loanOfficer: "robert-hoff" } },
} as unknown as Parameters<typeof syncContactRequestTag>[0];

beforeEach(() => upsertContact.mockReset());

describe("syncContactRequestTag", () => {
  it("upserts the contact with Requested:<channel> + officer:<slug> tags", async () => {
    upsertContact.mockResolvedValue({ id: "ghl-1" });
    await syncContactRequestTag(lead, "call");
    expect(upsertContact).toHaveBeenCalledTimes(1);
    const input = upsertContact.mock.calls[0][0];
    expect(input.tags).toContain("Requested:call");
    expect(input.tags).toContain("officer:robert-hoff");
  });

  it("swallows a thrown error (never rejects)", async () => {
    upsertContact.mockRejectedValue(new Error("GHL 500"));
    await expect(syncContactRequestTag(lead, "text")).resolves.toBeUndefined();
  });

  it("omits officer:<slug> when no officer slug is on the lead", async () => {
    upsertContact.mockResolvedValue({ id: "ghl-1" });
    const noOfficer = { ...lead, answers: { fields: {} } } as typeof lead;
    await syncContactRequestTag(noOfficer, "email");
    const input = upsertContact.mock.calls[0][0];
    expect(input.tags).toContain("Requested:email");
    expect(input.tags.some((t: string) => t.startsWith("officer:"))).toBe(false);
  });
});
```

- [ ] **6f — Run it (expected FAIL — `syncContactRequestTag` not exported):**

```bash
npx vitest run src/server/leads/syncContactRequestTag.test.ts
```

Expected: import error → FAIL.

- [ ] **6g — Add the sync helper.** In `src/server/leads/leadService.ts`, `Lead` is already imported (`leadService.ts:13`). Append after `recordContactRequest`:

```ts

/**
 * Best-effort, tag-only GHL sync for an off-ramp contact request. Re-upserts the
 * contact with an accumulating "Requested:<channel>" tag (and "officer:<slug>"
 * when the lead chose one). Mirrors dispatchToGhl's swallow contract: NEVER
 * throws. ghlClient.upsertContact short-circuits to a no-op when GHL is not
 * configured, so this is safe in every environment. No PII is logged.
 */
export async function syncContactRequestTag(
  lead: Lead,
  channel: "call" | "text" | "email",
): Promise<void> {
  try {
    const officer = resolveOfficerFromAnswers(lead.answers);
    await ghlClient.upsertContact(
      leadToContactInput(lead, {
        requestedChannel: channel,
        ...(officer ? { officerSlug: officer.slug } : {}),
      }),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[contact-request] GHL tag sync failed:", message.slice(0, 200));
  }
}
```

> Ensure `ghlClient` and `leadToContactInput` are imported in `leadService.ts` (they are already used by `dispatchToGhl`; reuse those imports).

- [ ] **6h — Run both tests (expected PASS):**

```bash
npx vitest run src/server/integrations/ghl/mappers.test.ts src/server/leads/syncContactRequestTag.test.ts
```

Expected: all PASS.

- [ ] **6i — Commit:**

```bash
git add src/server/integrations/ghl/mappers.ts src/server/integrations/ghl/mappers.test.ts src/server/leads/leadService.ts src/server/leads/syncContactRequestTag.test.ts && git commit -m "feat(leads): tag-only GHL sync for off-ramp contact requests

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7 — `POST /api/v1/leads/[id]/contact-request` route (+ node test)

**Files:** `src/app/api/v1/leads/[id]/contact-request/route.ts` (new), `src/app/api/v1/leads/[id]/contact-request/route.test.ts` (new)

The route: validates body (`contactRequestSchema`) → 400; enforces the TCPA gate (call|text + non-empty phone + !consentTcpa) → 422 BEFORE any write; calls `recordContactRequest` → 404 on `not_found`, 422 on `consent_required`; on `{ok:true, channelWasNew}` fires `syncContactRequestTag` best-effort only when the channel was new; returns `{ok:true}`. Scaffold mirrors `applications/route.ts` and `leads/route.ts`. `runtime "nodejs"`, `dynamic "force-dynamic"`.

This task depends on `contactRequestSchema` (Task 4), `recordContactRequest` + `syncContactRequestTag` (Tasks 5/6).

- [ ] **7a — Write the failing test.** Create `src/app/api/v1/leads/[id]/contact-request/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/server/leads/leadService", () => ({
  recordContactRequest: vi.fn(),
  syncContactRequestTag: vi.fn(),
  getLeadById: vi.fn(),
}));

import { POST } from "./route";
import * as leadService from "@/server/leads/leadService";

const recordContactRequest = vi.mocked(leadService.recordContactRequest);
const syncContactRequestTag = vi.mocked(leadService.syncContactRequestTag);
const getLeadById = vi.mocked(leadService.getLeadById);

function req(body: unknown) {
  return new Request("http://x/api/v1/leads/row-1/contact-request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
const ctx = { params: Promise.resolve({ id: "row-1" }) };

beforeEach(() => {
  recordContactRequest.mockReset();
  syncContactRequestTag.mockReset();
  getLeadById.mockReset();
});

describe("POST /api/v1/leads/[id]/contact-request", () => {
  it("400 on invalid JSON body", async () => {
    const bad = new Request("http://x/api/v1/leads/row-1/contact-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const res = await POST(bad, ctx);
    expect(res.status).toBe(400);
    expect(recordContactRequest).not.toHaveBeenCalled();
  });

  it("400 when channel is missing/invalid", async () => {
    const res = await POST(req({ channel: "fax" }), ctx);
    expect(res.status).toBe(400);
    expect(recordContactRequest).not.toHaveBeenCalled();
  });

  it("422 on a call recapture phone without consent — nothing written, no tag", async () => {
    const res = await POST(req({ channel: "call", phone: "3035551234" }), ctx);
    expect(res.status).toBe(422);
    expect(recordContactRequest).not.toHaveBeenCalled();
    expect(syncContactRequestTag).not.toHaveBeenCalled();
  });

  it("404 when the lead is missing/cross-tenant", async () => {
    recordContactRequest.mockResolvedValue({ ok: false, reason: "not_found" });
    const res = await POST(req({ channel: "email" }), ctx);
    expect(res.status).toBe(404);
    expect(syncContactRequestTag).not.toHaveBeenCalled();
  });

  it("200 happy path: records then fires the GHL tag when channel is new", async () => {
    recordContactRequest.mockResolvedValue({
      ok: true,
      channelWasNew: true,
      officer: { name: "Robert Hoff, CFA", slug: "robert-hoff" },
    });
    getLeadById.mockResolvedValue({ id: "row-1" } as never);
    const res = await POST(req({ channel: "email" }), ctx);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(syncContactRequestTag).toHaveBeenCalledTimes(1);
  });

  it("200 idempotent: does NOT fire a duplicate tag when channel already recorded", async () => {
    recordContactRequest.mockResolvedValue({ ok: true, channelWasNew: false, officer: null });
    const res = await POST(req({ channel: "text" }), ctx);
    expect(res.status).toBe(200);
    expect(syncContactRequestTag).not.toHaveBeenCalled();
  });

  it("200 even when the GHL tag sync throws (swallowed)", async () => {
    recordContactRequest.mockResolvedValue({ ok: true, channelWasNew: true, officer: null });
    getLeadById.mockResolvedValue({ id: "row-1" } as never);
    syncContactRequestTag.mockRejectedValue(new Error("GHL down"));
    const res = await POST(req({ channel: "call" }), ctx);
    expect(res.status).toBe(200);
  });

  it("does not log the borrower phone (no PII in logs)", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    recordContactRequest.mockResolvedValue({ ok: true, channelWasNew: true, officer: null });
    getLeadById.mockResolvedValue({ id: "row-1" } as never);
    await POST(req({ channel: "text", phone: "3035559999", consentTcpa: true }), ctx);
    const logged = errSpy.mock.calls.flat().join(" ");
    expect(logged).not.toContain("3035559999");
    errSpy.mockRestore();
  });
});
```

- [ ] **7b — Run it (expected FAIL — route file does not exist):**

```bash
npx vitest run "src/app/api/v1/leads/[id]/contact-request/route.test.ts"
```

Expected: cannot resolve `./route` → FAIL.

- [ ] **7c — Create the route.** Create `src/app/api/v1/leads/[id]/contact-request/route.ts`:

```ts
import { NextResponse } from "next/server";
import { contactRequestSchema } from "@/validation/lead";
import {
  recordContactRequest,
  syncContactRequestTag,
  getLeadById,
} from "@/server/leads/leadService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/leads/{id}/contact-request — off-ramp "ask my officer to reach
 * out" handler. Tenant-scoped via leadService. Postgres is the system-of-record;
 * the GHL tag is best-effort and never blocks the response.
 *
 *   400 — bad JSON / schema failure
 *   404 — missing or cross-tenant lead
 *   422 — TCPA gate: call|text + a recaptured (non-empty) phone + !consentTcpa
 *   200 — { ok: true }
 *
 * No PII in logs: at most leadId + channel + ok/fail.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = contactRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  }
  const { channel, phone, consentTcpa } = parsed.data;

  // TCPA hard gate (server-side enforcement). A recaptured (non-empty) phone on
  // a call/text request requires affirmative consent. Email is exempt. Reject
  // BEFORE any write or CRM tag.
  const hasRecapturedPhone = typeof phone === "string" && phone.trim() !== "";
  if ((channel === "call" || channel === "text") && hasRecapturedPhone && consentTcpa !== true) {
    return NextResponse.json({ ok: false, error: "consent_required" }, { status: 422 });
  }

  try {
    const result = await recordContactRequest(id, { channel, phone, consentTcpa });
    if (!result.ok) {
      const status = result.reason === "not_found" ? 404 : 422;
      return NextResponse.json({ ok: false, error: result.reason }, { status });
    }

    // Fire the GHL tag only when this channel is newly requested (idempotent —
    // a same-channel double-click does not duplicate the tag). Best-effort:
    // re-read the lead and sync; swallow everything so the client never waits.
    if (result.channelWasNew) {
      try {
        const lead = await getLeadById(id);
        if (lead) await syncContactRequestTag(lead, channel);
      } catch {
        // syncContactRequestTag already swallows; this guards the re-read.
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`[/api/v1/leads/${id}/contact-request] failed for channel=${channel}`);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
```

Note: the catch-all logs only `leadId` (already an unguessable id) + `channel` — never the phone/email/name. The `err` binding is intentionally not interpolated to avoid leaking a message that could carry input.

- [ ] **7d — Run it (expected PASS):**

```bash
npx vitest run "src/app/api/v1/leads/[id]/contact-request/route.test.ts"
```

Expected: all 8 tests PASS.

- [ ] **7e — Commit:**

```bash
git add "src/app/api/v1/leads/[id]/contact-request/" && git commit -m "feat(api): POST /leads/[id]/contact-request with TCPA 422 gate

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8 — `requestContact` client helper (+ node test)

**Files:** `src/lib/leads.ts`, `src/lib/requestContact.test.ts` (new)

Fire-and-forget client helper modeled on `submitLead` (`src/lib/leads.ts:52-80`): POST to the new route, generate its own `idempotencyKey` via `crypto.randomUUID()`, swallow/log errors (no PII), return `{ ok }`. It never blocks the Continue flow. This is consumed client-side in FinishStep (Tasks 14–15).

- [ ] **8a — Write the failing test.** Create `src/lib/requestContact.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { requestContact } from "./leads";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("crypto", { randomUUID: () => "fixed-uuid-0000000000" });
});
afterEach(() => vi.unstubAllGlobals());

describe("requestContact", () => {
  it("POSTs to the lead's contact-request route with channel + idempotencyKey", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    const out = await requestContact("row-1", "email");
    expect(out).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/leads/row-1/contact-request");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body.channel).toBe("email");
    expect(body.idempotencyKey).toBe("fixed-uuid-0000000000");
  });

  it("includes phone + consentTcpa when provided", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    await requestContact("row-1", "call", { phone: "3035551234", consentTcpa: true });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.phone).toBe("3035551234");
    expect(body.consentTcpa).toBe(true);
  });

  it("returns { ok: false } on a non-OK response (swallowed)", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 422, json: async () => ({ ok: false }) });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const out = await requestContact("row-1", "call");
    expect(out).toEqual({ ok: false });
    errSpy.mockRestore();
  });

  it("returns { ok: false } when fetch throws (swallowed)", async () => {
    fetchMock.mockRejectedValue(new Error("network"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const out = await requestContact("row-1", "text");
    expect(out).toEqual({ ok: false });
    errSpy.mockRestore();
  });
});
```

- [ ] **8b — Run it (expected FAIL — `requestContact` not exported):**

```bash
npx vitest run src/lib/requestContact.test.ts
```

Expected: import error → FAIL.

- [ ] **8c — Add the helper.** Append to `src/lib/leads.ts`:

```ts

/**
 * Fire-and-forget off-ramp contact request. Asks the borrower's chosen officer
 * (or the house line) to reach out via the picked channel. Modeled on
 * {@link submitLead}: generates its own idempotencyKey, swallows/logs all
 * errors (no PII), and returns { ok } — it must NEVER block the Continue flow.
 *
 * For call/text with a recaptured number, the caller MUST pass
 * { phone, consentTcpa: true }; the server returns 422 otherwise.
 */
export async function requestContact(
  leadId: string,
  channel: "call" | "text" | "email",
  opts?: { phone?: string; consentTcpa?: boolean },
): Promise<{ ok: boolean }> {
  const body = {
    channel,
    ...(opts?.phone ? { phone: opts.phone } : {}),
    ...(opts?.consentTcpa ? { consentTcpa: opts.consentTcpa } : {}),
    idempotencyKey: crypto.randomUUID(),
  };

  try {
    const res = await fetch(`/api/v1/leads/${encodeURIComponent(leadId)}/contact-request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error("[contact-request] failed:", res.status);
      return { ok: false };
    }
    const data = (await res.json().catch(() => null)) as { ok?: boolean } | null;
    return { ok: Boolean(data?.ok) };
  } catch (err) {
    console.error("[contact-request] error:", err instanceof Error ? err.message : String(err));
    return { ok: false };
  }
}
```

- [ ] **8d — Run it (expected PASS):**

```bash
npx vitest run src/lib/requestContact.test.ts
```

Expected: all 4 tests PASS.

- [ ] **8e — Run the full Part 2 backend suite to confirm no regressions:**

```bash
npx vitest run src/validation/lead.test.ts src/server/leads/recordContactRequest.test.ts src/server/leads/syncContactRequestTag.test.ts src/server/integrations/ghl/mappers.test.ts "src/app/api/v1/leads/[id]/contact-request/route.test.ts" src/lib/requestContact.test.ts
```

Expected: all PASS.

- [ ] **8f — Commit:**

```bash
git add src/lib/leads.ts src/lib/requestContact.test.ts && git commit -m "feat(leads): requestContact fire-and-forget client helper

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9 — Tenant `applyOffRamp` config: schema + defaults + derive helper

**Files:** `src/content/site.ts` (edit), `src/content/applyOffRamp.test.ts` (new)

This adds the additive `applyOffRamp` block to `TenantConfigSchema` and `DEFAULT_TENANT_CONFIG`, plus a tiny derive helper that older published CMS revisions (which lack the block) still resolve to MSFG defaults. Per the SHARED CONTRACT: `applyOffRamp: { channels; slaCopy; finishScreen }`, every field with `.default(...)`.

> **Fixture note (resolved):** `TenantConfigSchema` requires `brand`, `contact`, `legal`, `seo`, `features`, `ai` (only `theme`, `marketing`, and `ai.brain` have schema-level defaults). A partial `{ brand, contact }` object will NOT parse. To keep the failing test failing for the RIGHT reason (missing `deriveApplyOffRamp` export, not a parse error), the test below builds its fixtures by spreading `DEFAULT_TENANT_CONFIG` — a known-valid config — and only varies `applyOffRamp`.

- [ ] **9a — Write the failing test (node `.test.ts`).** Create `src/content/applyOffRamp.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { TenantConfigSchema, DEFAULT_TENANT_CONFIG, deriveApplyOffRamp } from "./site";

describe("applyOffRamp config", () => {
  it("parses an object MISSING applyOffRamp to MSFG defaults", () => {
    // A pre-existing published CMS revision predates the applyOffRamp block.
    // Start from a known-valid config and strip applyOffRamp entirely.
    const raw = structuredClone(DEFAULT_TENANT_CONFIG) as Record<string, unknown>;
    delete raw.applyOffRamp;
    const parsed = TenantConfigSchema.parse(raw);
    const off = deriveApplyOffRamp(parsed);
    expect(off.finishScreen).toBe("rendered");
    expect(off.channels).toEqual(["call", "text", "email"]);
    expect(off.slaCopy).toBe("within ~15 minutes");
  });

  it("respects an explicit applyOffRamp override", () => {
    const raw = {
      ...structuredClone(DEFAULT_TENANT_CONFIG),
      applyOffRamp: {
        channels: ["email"],
        slaCopy: "within one business day",
        finishScreen: "autoRedirect",
      },
    };
    const parsed = TenantConfigSchema.parse(raw);
    const off = deriveApplyOffRamp(parsed);
    expect(off.channels).toEqual(["email"]);
    expect(off.slaCopy).toBe("within one business day");
    expect(off.finishScreen).toBe("autoRedirect");
  });
});
```

> If `structuredClone` is unavailable in the test runtime, use `JSON.parse(JSON.stringify(DEFAULT_TENANT_CONFIG))` instead — both produce a deep, mutable copy whose `applyOffRamp` key can be deleted/overridden without touching the exported default.

- [ ] **9b — Run it (expect FAIL — `deriveApplyOffRamp` does not exist):**

```bash
npx vitest run src/content/applyOffRamp.test.ts
```

Expected: FAIL — `does not provide an export named 'deriveApplyOffRamp'` (the parse succeeds because the fixture is a valid full config; only the missing export fails).

- [ ] **9c — Add the schema, default, and derive helper.** In `src/content/site.ts`, add the sub-schema next to the other `z.object` schemas. Insert this block immediately after `ContactSchema` (lines 95–101):

```ts
/** Apply-funnel finish-step off-ramp. Additive + fully defaulted so a published
 *  CMS revision that predates these fields still parses to the MSFG defaults
 *  (no re-publish required for prod to render the screen). */
const ApplyOffRampSchema = z
  .object({
    channels: z
      .array(z.enum(["call", "text", "email"]))
      .default(["call", "text", "email"]),
    slaCopy: z.string().default("within ~15 minutes"),
    finishScreen: z.enum(["rendered", "autoRedirect"]).default("rendered"),
  })
  .default({});
```

Then add `applyOffRamp` to `TenantConfigSchema` (the `z.object({ ... })` that includes `contact: ContactSchema`, lines 180–192). Add this field alongside the existing ones:

```ts
  applyOffRamp: ApplyOffRampSchema,
```

Then add the explicit MSFG values to `DEFAULT_TENANT_CONFIG`, immediately after the `contact: { ... }` block (lines 218–224):

```ts
  applyOffRamp: {
    channels: ["call", "text", "email"],
    slaCopy: "within ~15 minutes",
    finishScreen: "rendered",
  },
```

Finally, add the derive helper and its return type at the bottom of `src/content/site.ts` (after `DEFAULT_TENANT_CONFIG` is declared):

```ts
export type ApplyOffRampConfig = {
  channels: ("call" | "text" | "email")[];
  slaCopy: string;
  finishScreen: "rendered" | "autoRedirect";
};

/** Pull the off-ramp block off a parsed tenant config. Because `ApplyOffRampSchema`
 *  is fully defaulted, `config.applyOffRamp` is always populated — this helper just
 *  gives the wiring layer a stable, narrowed accessor. */
export function deriveApplyOffRamp(config: TenantConfig): ApplyOffRampConfig {
  return {
    channels: config.applyOffRamp.channels,
    slaCopy: config.applyOffRamp.slaCopy,
    finishScreen: config.applyOffRamp.finishScreen,
  };
}
```

> `TenantConfig` is the existing `z.infer<typeof TenantConfigSchema>` exported from this module (line 194) — reuse it; do not redeclare it.

- [ ] **9d — Run it (expect PASS):**

```bash
npx vitest run src/content/applyOffRamp.test.ts
```

Expected: PASS (both cases).

- [ ] **9e — Commit:**

```bash
git add src/content/site.ts src/content/applyOffRamp.test.ts
git commit -m "feat(config): add applyOffRamp tenant block (channels/slaCopy/finishScreen) + derive helper

Fully-defaulted Zod sub-schema so older published CMS revisions parse to
MSFG defaults (finishScreen rendered) without a re-publish.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10 — `track()` analytics wrapper

**Files:** `src/lib/analytics.ts` (new)

A thin typed wrapper around `track()` from `@vercel/analytics` (pkg `^2.0.1`, already a dependency — confirmed at `layout.tsx:3`). Per the SHARED CONTRACT this is the single `track(event, props?)` surface; the event names are the snake_case union.

**No test for this task.** It is a one-line pass-through to `@vercel/analytics` `track()` plus a server no-op guard — there is no branching logic worth a node test, and exercising it would require mocking the Vercel SDK for zero behavioral coverage. The typed `AnalyticsEvent` union is the actual safety net (compile-time), enforced by `tsc`.

- [ ] **10a — Create the wrapper.** Create `src/lib/analytics.ts`:

```ts
import { track as vercelTrack } from "@vercel/analytics";

/** Snake_case event names for the apply finish-step funnel. Adding an event here
 *  is the only way to fire it — `track()` rejects unknown names at compile time. */
export type AnalyticsEvent =
  | "finish_view"
  | "continue_click"
  | "continue_fallback_shown"
  | "offramp_open"
  | "offramp_phone_prompt"
  | "offramp_phone_submit"
  | "channel_select"
  | "contact_request_ok"
  | "contact_request_fail";

/**
 * Typed, client-only wrapper around Vercel Analytics `track()`. No-op on the
 * server (and harmlessly no-op outside Vercel/dev, where the underlying SDK is
 * already inert). Never throws — analytics must never break the funnel.
 */
export function track(
  event: AnalyticsEvent,
  props?: Record<string, string | number | boolean>,
): void {
  if (typeof window === "undefined") return;
  try {
    vercelTrack(event, props);
  } catch {
    // Swallow — telemetry must never interrupt the user.
  }
}
```

- [ ] **10b — Typecheck (expect PASS):**

```bash
npx tsc --noEmit
```

Expected: PASS (no type errors introduced; `@vercel/analytics` already resolves).

- [ ] **10c — Commit:**

```bash
git add src/lib/analytics.ts
git commit -m "feat(analytics): typed client-only track() wrapper for finish-step events

Wraps @vercel/analytics track() with a snake_case AnalyticsEvent union;
no-op on the server, swallows errors so telemetry never breaks the funnel.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 11 — `isHandoffTokenStale` pure helper + `HANDOFF_STALE_MS`

**Files:** `src/components/apply/steps/handoffStale.ts` (new), `src/components/apply/steps/handoffStale.test.ts` (new)

Extract the "is the warmed hand-off token stale?" decision as a pure function so the FinishStep Continue-click logic is node-testable without a DOM (Testing strategy, spec line 337). Per the SHARED CONTRACT: `HANDOFF_STALE_MS = 8 * 60 * 1000`, `isHandoffTokenStale(mintedAt, now, ttlMs?)`. The 8-min window sits under the 10-min JWT TTL (`handoffToken.ts:51`).

- [ ] **11a — Write the failing test (node `.test.ts`).** Create `src/components/apply/steps/handoffStale.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isHandoffTokenStale, HANDOFF_STALE_MS } from "./handoffStale";

describe("isHandoffTokenStale", () => {
  it("treats a null mintedAt (never warmed) as stale", () => {
    expect(isHandoffTokenStale(null, 1_000_000)).toBe(true);
  });

  it("is NOT stale for a freshly minted token", () => {
    const now = 1_000_000;
    expect(isHandoffTokenStale(now, now)).toBe(false);
  });

  it("is NOT stale just UNDER the 8-minute window", () => {
    const minted = 1_000_000;
    const now = minted + HANDOFF_STALE_MS - 1;
    expect(isHandoffTokenStale(minted, now)).toBe(false);
  });

  it("IS stale exactly AT the 8-minute window", () => {
    const minted = 1_000_000;
    const now = minted + HANDOFF_STALE_MS;
    expect(isHandoffTokenStale(minted, now)).toBe(true);
  });

  it("IS stale past the 8-minute window", () => {
    const minted = 1_000_000;
    const now = minted + HANDOFF_STALE_MS + 5_000;
    expect(isHandoffTokenStale(minted, now)).toBe(true);
  });

  it("honors a custom ttlMs override", () => {
    const minted = 1_000_000;
    expect(isHandoffTokenStale(minted, minted + 999, 1_000)).toBe(false);
    expect(isHandoffTokenStale(minted, minted + 1_000, 1_000)).toBe(true);
  });
});
```

- [ ] **11b — Run it (expect FAIL — module does not exist):**

```bash
npx vitest run src/components/apply/steps/handoffStale.test.ts
```

Expected: FAIL — `Cannot find module './handoffStale'` / `does not provide an export named 'isHandoffTokenStale'`.

- [ ] **11c — Create the pure helper.** Create `src/components/apply/steps/handoffStale.ts`:

```ts
/** Safety window for a pre-warmed hand-off token: 8 minutes, 2 minutes under the
 *  10-minute JWT TTL minted by mintHandoffToken (handoffToken.ts). Past this we
 *  re-mint on the Continue click rather than navigate with a near-expired token. */
export const HANDOFF_STALE_MS = 8 * 60 * 1000;

/**
 * Pure predicate: should the warmed token be discarded and re-minted before
 * navigating? A null `mintedAt` (token never warmed) is always stale. Otherwise
 * stale once `now - mintedAt` reaches `ttlMs` (default {@link HANDOFF_STALE_MS}).
 */
export function isHandoffTokenStale(
  mintedAt: number | null,
  now: number,
  ttlMs: number = HANDOFF_STALE_MS,
): boolean {
  if (mintedAt === null) return true;
  return now - mintedAt >= ttlMs;
}
```

- [ ] **11d — Run it (expect PASS):**

```bash
npx vitest run src/components/apply/steps/handoffStale.test.ts
```

Expected: PASS (all six cases).

- [ ] **11e — Commit:**

```bash
git add src/components/apply/steps/handoffStale.ts src/components/apply/steps/handoffStale.test.ts
git commit -m "feat(finish): isHandoffTokenStale pure helper + 8-min HANDOFF_STALE_MS

Node-testable staleness predicate for the Continue-click re-mint guard;
8-min window sits under the 10-min handoff-token JWT TTL.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 12 — `telHref`/`smsHref` off-ramp deep-link guards (+ node test)

**Files:** `src/components/apply/steps/offRampLink.ts` (new), `src/components/apply/steps/offRampLink.test.ts` (new)

The off-ramp Call/Text deep links call `telDigits(phone)` from `@/content/officers`. Per the spec, an empty phone (`""`, the DB null-fallback) must not produce a bare `+` that we hand to a `tel:`/`sms:` link. We do NOT change `telDigits` (other callers rely on it); instead the FinishStep rewrite (Task 14) guards the call site. This task pins the guard contract with a tiny pure helper so the guard is node-testable without a DOM.

- [ ] **12a — Write the failing test.** Create `/Users/zacharyzink/MSFG/WebProjects/msfg.us/src/components/apply/steps/offRampLink.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { telHref, smsHref } from "./offRampLink";

describe("offRampLink deep-link guards", () => {
  it("builds a tel: href for a real phone", () => {
    expect(telHref("(720) 838-1246")).toBe("tel:+17208381246");
  });

  it("returns null for an empty phone (no bare '+')", () => {
    expect(telHref("")).toBeNull();
    expect(telHref("   ")).toBeNull();
  });

  it("builds an sms: href for a real phone", () => {
    expect(smsHref("(720) 838-1246")).toBe("sms:+17208381246");
  });

  it("returns null sms: for an empty phone", () => {
    expect(smsHref("")).toBeNull();
  });
});
```

- [ ] **12b — Run it (expect FAIL — module does not exist):**

```bash
npx vitest run src/components/apply/steps/offRampLink.test.ts
```

Expected: FAIL — `Failed to resolve import "./offRampLink"`.

- [ ] **12c — Minimal implementation.** Create `/Users/zacharyzink/MSFG/WebProjects/msfg.us/src/components/apply/steps/offRampLink.ts`:

```ts
import { telDigits } from "@/content/officers";

/**
 * tel:/sms: href builders that refuse to emit a bare "+" for an empty phone.
 * The DB officer projection maps a missing phone to "" (src/server/officers/map.ts),
 * and telDigits("") returns "+", which is a dead deep link. Returning null lets the
 * caller hide/disable the Call/Text channel instead.
 */
export function telHref(phone: string): string | null {
  if (phone.trim() === "") return null;
  return `tel:${telDigits(phone)}`;
}

export function smsHref(phone: string): string | null {
  if (phone.trim() === "") return null;
  return `sms:${telDigits(phone)}`;
}
```

- [ ] **12d — Run it (expect PASS):**

```bash
npx vitest run src/components/apply/steps/offRampLink.test.ts
```

Expected: PASS (4 tests).

- [ ] **12e — Commit:**

```bash
git add src/components/apply/steps/offRampLink.ts src/components/apply/steps/offRampLink.test.ts && git commit -m "feat(finish): tel/sms href guards that refuse a bare '+' for empty phones

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 13 — FinishStep continue-path rewrite: pre-warm + click-time navigate (no off-ramp yet)

This is the first slice of the full FinishStep rewrite. It deletes the auto-navigate effect, keeps the mount mint as a pre-warm, records `mintedAt` in a ref inside the `.then()`, moves navigation to a rendered Continue button using `isHandoffTokenStale` (from `./handoffStale`, Task 11), and renders the screen with its own in-component title. The off-ramp disclosure is added in Task 14 and the recapture sub-form in Task 15.

This task references the already-defined shared contract members:
- `isHandoffTokenStale(mintedAt, now, ttlMs?)` and `HANDOFF_STALE_MS` from `/Users/zacharyzink/MSFG/WebProjects/msfg.us/src/components/apply/steps/handoffStale.ts` (Task 11).
- `track(event, props?)` from `/Users/zacharyzink/MSFG/WebProjects/msfg.us/src/lib/analytics.ts` (Task 10).
- The widened `FinishStep` `officer` prop type `{ slug; name; nmls; photo; email; phone } | null` (Task 3).
- `requestContact` from `@/lib/leads` (Task 8; used in Tasks 14/15, not here).

> **No node test in this step** — the testable predicate (`isHandoffTokenStale`) is owned and unit-tested by Task 11; the DOM behavior is verified manually (Final verification) per the v1 node-only decision (no RTL/jsdom).

- [ ] **13a — Replace the whole file.** Replace `/Users/zacharyzink/MSFG/WebProjects/msfg.us/src/components/apply/steps/FinishStep.tsx` with the version below. (This is the continue-path-only intermediate; Tasks 14 and 15 extend the same file.)

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { APP_URL } from "@/lib/auth/appLink";
import { isHandoffTokenStale } from "./handoffStale";
import { track } from "@/lib/analytics";
import type { Intent } from "@/content/flows";
import type { LeadContact } from "@/lib/leads";

type OffRampOfficer = {
  slug: string;
  name: string;
  nmls: string;
  photo: string;
  email: string;
  phone: string;
} | null;

/**
 * Finish screen (Part 2 of the funnel pivot). Re-introduces a rendered screen
 * (partially reversing 90188bb): the hand-off token is minted on mount as a
 * PRE-WARM, but navigation happens on the Continue CLICK (TTL-aware re-mint),
 * not on mount. A quiet reveal-on-demand off-ramp (added in a later slice) lets
 * the borrower reach the chosen loan officer without leaving the screen.
 */
export function FinishStep({
  contact,
  leadId,
  shortName,
}: {
  intent?: Intent;
  contact: LeadContact | null;
  leadId: string | null;
  shortName: string;
  calendarHref?: string;
  officer?: OffRampOfficer;
}) {
  const fired = useRef(false);
  const mintedAtRef = useRef<number | null>(null);
  const reminting = useRef(false);
  const [token, setToken] = useState<string | null>(null);
  const [warmFailed, setWarmFailed] = useState(false);
  const [pending, setPending] = useState(false);
  const [fallback, setFallback] = useState(false);

  // PRE-WARM: mint the hand-off token once on mount (no navigation here).
  useEffect(() => {
    if (fired.current || !contact || !leadId) return;
    fired.current = true;
    const controller = new AbortController();
    fetch("/api/v1/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: controller.signal,
      body: JSON.stringify({ leadId }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.handoffToken) {
          mintedAtRef.current = Date.now();
          setToken(String(d.handoffToken));
        } else {
          setWarmFailed(true);
        }
      })
      .catch(() => setWarmFailed(true));
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact, leadId]);

  // finish_view: rendered finish screen mounted.
  useEffect(() => {
    track("finish_view");
  }, []);

  function navigateWith(t: string) {
    window.location.href = `${APP_URL}/continue?t=${encodeURIComponent(t)}`;
  }

  async function remint(): Promise<string | null> {
    if (!leadId) return null;
    const res = await fetch("/api/v1/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ leadId }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    return res?.handoffToken ? String(res.handoffToken) : null;
  }

  async function onContinue() {
    const warmed = token !== null;
    const stale = isHandoffTokenStale(mintedAtRef.current, Date.now());

    if (token && !stale) {
      track("continue_click", { warmed: true, remintRequired: false });
      navigateWith(token);
      return;
    }

    // Stale or never-warmed → click-time re-mint with a pending/disabled state.
    track("continue_click", { warmed, remintRequired: true });
    if (reminting.current) return;
    reminting.current = true;
    setPending(true);
    const fresh = await remint();
    reminting.current = false;
    if (fresh) {
      mintedAtRef.current = Date.now();
      navigateWith(fresh);
      return;
    }
    // Both warm and click-time mint failed → stay on screen, show fallback.
    setPending(false);
    setFallback(true);
    track("continue_fallback_shown");
  }

  return (
    <>
      <h1 className="mb-2 text-pretty text-[clamp(26px,3.6vw,38px)] font-extrabold leading-[1.08] tracking-[-0.03em] [text-wrap:balance]">
        You’re all set — finish your application
      </h1>
      <p className="mb-6 text-[16px] text-muted">
        Pick up right where you left off in the {shortName} app.
      </p>

      {fallback ? (
        <a
          href={APP_URL}
          className="flex h-[66px] w-full items-center justify-center gap-2.5 rounded-lg bg-green-600 text-[18px] font-bold text-white [box-shadow:0_3px_0_#0a3a2a,var(--shadow-3d)] transition-[transform,background,box-shadow] duration-150 hover:-translate-y-0.5 hover:bg-green-700 hover:[box-shadow:0_5px_0_#0a3a2a,var(--shadow-pop)] active:translate-y-px"
        >
          Continue in the {shortName} app
          <ArrowRight className="size-5" strokeWidth={2.2} aria-hidden="true" />
        </a>
      ) : (
        <button
          type="button"
          onClick={onContinue}
          disabled={pending}
          className="flex h-[66px] w-full items-center justify-center gap-2.5 rounded-lg bg-green-600 text-[18px] font-bold text-white [box-shadow:0_3px_0_#0a3a2a,var(--shadow-3d)] transition-[transform,background,box-shadow] duration-150 hover:-translate-y-0.5 hover:bg-green-700 hover:[box-shadow:0_5px_0_#0a3a2a,var(--shadow-pop)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-70"
        >
          {pending ? "Setting up…" : "Continue your application"}
          {!pending && <ArrowRight className="size-5" strokeWidth={2.2} aria-hidden="true" />}
        </button>
      )}

      <p className="sr-only" aria-live="polite">
        {pending ? "Setting up your application, one moment." : ""}
      </p>

      {warmFailed && !fallback && (
        <p className="mt-3 text-center text-[13px] text-muted">
          Taking a moment longer than usual — tap Continue to retry.
        </p>
      )}
    </>
  );
}
```

> Note the `officer` and `calendarHref` props are accepted in the signature (so the Wizard call-site keeps compiling) but unused until Task 14. The `remint()` in-flight guard uses `reminting.current`; the mount pre-warm keeps its own `fired` guard, exactly per the contract.

- [ ] **13b — Typecheck (expect PASS):**

```bash
npx tsc --noEmit
```

Expected: PASS (no type errors).

- [ ] **13c — Commit:**

```bash
git add src/components/apply/steps/FinishStep.tsx && git commit -m "feat(finish): render finish screen, move handoff navigate from mount to Continue click

Deletes the auto-navigate effect (90188bb); keeps the mount mint as a pre-warm
and records mintedAt in a ref. Continue click uses isHandoffTokenStale to decide
fresh-navigate vs. TTL-aware re-mint with a pending state; both-fail falls back
to the bare APP_URL link. Emits finish_view, continue_click, continue_fallback_shown.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 14 — Add the reveal-on-demand off-ramp (disclosure + 3 channels + confirmation), phone-on-file paths only

Extend the same `FinishStep.tsx` with the disclosure trigger, the revealed panel (officer photo/name/NMLS or generic + house line when `officer === null`), the three channel buttons gated by the `channels` config, SLA copy, and a stable `aria-live` confirmation node. This slice covers ONLY the paths where the deep link/request fire immediately: **Email always** (officer email, else the tenant house email), and **Call/Text when `contact.phone` is non-empty**. The phone-skipped recapture sub-form is added in Task 15.

This task references the shared contract members:
- `requestContact(leadId, channel, opts?)` from `@/lib/leads` (Task 8).
- `telHref`/`smsHref` from `./offRampLink` (Task 12).
- `track` from `@/lib/analytics` (Task 10).
- New props threaded by the Wizard task (Task 16): `phoneDisplay: string`, `phoneHref: string`, `emailDisplay: string`, `offRampChannels: ("call"|"text"|"email")[]`, `offRampSla: string`.

> **Email target (resolves the no-officer degenerate-`mailto:` finding):** the no-officer branch must use the tenant email (`config.contact.email`, threaded as `emailDisplay`), NOT `phoneDisplay`. The email channel renders only when a real email address is available — officer email when an officer was chosen, else the tenant `emailDisplay`. We never build `mailto:<phone-display-string>`.

> The off-ramp config props (`offRampChannels`, `offRampSla`) and `phoneDisplay`/`phoneHref`/`emailDisplay` are derived server-side in `page.tsx` and threaded through Wizard (Task 16). This task consumes them.

- [ ] **14a — Extend the imports.** Edit `/Users/zacharyzink/MSFG/WebProjects/msfg.us/src/components/apply/steps/FinishStep.tsx`. Replace:

```tsx
import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { APP_URL } from "@/lib/auth/appLink";
import { isHandoffTokenStale } from "./handoffStale";
import { track } from "@/lib/analytics";
import type { Intent } from "@/content/flows";
import type { LeadContact } from "@/lib/leads";
```

with:

```tsx
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ArrowRight, Phone, MessageSquare, Mail } from "lucide-react";
import { APP_URL } from "@/lib/auth/appLink";
import { isHandoffTokenStale } from "./handoffStale";
import { telHref, smsHref } from "./offRampLink";
import { track } from "@/lib/analytics";
import { requestContact } from "@/lib/leads";
import type { Intent } from "@/content/flows";
import type { LeadContact } from "@/lib/leads";

type Channel = "call" | "text" | "email";
```

- [ ] **14b — Replace the component's destructured signature.** Replace:

```tsx
export function FinishStep({
  contact,
  leadId,
  shortName,
}: {
  intent?: Intent;
  contact: LeadContact | null;
  leadId: string | null;
  shortName: string;
  calendarHref?: string;
  officer?: OffRampOfficer;
}) {
```

with:

```tsx
export function FinishStep({
  contact,
  leadId,
  shortName,
  officer = null,
  phoneDisplay,
  phoneHref,
  emailDisplay,
  offRampChannels,
  offRampSla,
}: {
  intent?: Intent;
  contact: LeadContact | null;
  leadId: string | null;
  shortName: string;
  calendarHref?: string;
  officer?: OffRampOfficer;
  /** Tenant house line (used when no officer was chosen). */
  phoneDisplay: string;
  phoneHref: string;
  /** Tenant house email (used for the Email channel when no officer was chosen). */
  emailDisplay: string;
  /** Off-ramp channels enabled for this tenant (config). */
  offRampChannels: Channel[];
  /** SLA callback copy, e.g. "within ~15 minutes". */
  offRampSla: string;
}) {
```

- [ ] **14c — Add the off-ramp state + handlers.** Insert the following block immediately AFTER the existing `const [fallback, setFallback] = useState(false);` line:

```tsx
  // --- Off-ramp (reveal-on-demand) state ---
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState<Channel | null>(null);
  const panelHeadingRef = useRef<HTMLHeadingElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const officerFirst = officer?.name.split(" ")[0] ?? null;
  // Number used for Call/Text: the officer's, else the tenant house line.
  const callHref = officer ? telHref(officer.phone) : phoneHref || telHref(phoneDisplay);
  const smsLink = officer ? smsHref(officer.phone) : smsHref(phoneDisplay);
  // Email target: the officer's address, else the tenant house email. Never a phone string.
  const emailAddress = officer?.email || emailDisplay || "";
  const mailHref = emailAddress
    ? `mailto:${emailAddress}?subject=${encodeURIComponent("My mortgage application")}`
    : null;

  function toggleOpen() {
    setOpen((wasOpen) => {
      const next = !wasOpen;
      if (next) {
        track("offramp_open");
        // Focus the panel heading after it renders.
        requestAnimationFrame(() => panelHeadingRef.current?.focus());
      } else {
        requestAnimationFrame(() => triggerRef.current?.focus());
      }
      return next;
    });
  }

  function fireRequest(channel: Channel, opts?: { phone?: string; consentTcpa?: boolean }) {
    if (!leadId) return;
    requestContact(leadId, channel, opts).then((r) =>
      track(r.ok ? "contact_request_ok" : "contact_request_fail"),
    );
  }

  // Email (gate-exempt) + Call/Text when a phone is already on file fire immediately.
  function onChannel(channel: Channel) {
    track("channel_select", { channel });
    if (channel === "email") {
      fireRequest("email");
      setConfirmed("email");
      return;
    }
    // Call/Text. Phone-skipped recapture is handled in a later slice; here we
    // assume contact.phone is present (the only path wired in this slice).
    fireRequest(channel);
    setConfirmed(channel);
  }

  function confirmationLine(): string {
    if (!confirmed) return "";
    const who = officerFirst ?? "A loan officer";
    if (confirmed === "email") return `${who} will email you back ${offRampSla}.`;
    if (confirmed === "text") return `${who} will text you ${offRampSla} — keep an eye on your phone.`;
    return `${who} will call you ${offRampSla}.`;
  }

  const showCall = offRampChannels.includes("call") && callHref !== null;
  const showText = offRampChannels.includes("text") && smsLink !== null;
  const showEmail = offRampChannels.includes("email") && mailHref !== null;
```

> Note: `channelPhone` is intentionally NOT declared here — it is added in Task 15 (the recapture slice) to avoid an unused-var lint failure now. `showEmail` is now gated purely on `mailHref !== null`, which is null whenever there is neither an officer email nor a tenant `emailDisplay` — so a degenerate email channel never renders.

- [ ] **14d — Add the disclosure + panel UI.** Insert the following block immediately BEFORE the closing `</>` of the component's returned JSX (i.e. after the `warmFailed && !fallback` paragraph block):

```tsx
      {(showCall || showText || showEmail) && (
        <div className="mt-6">
          <button
            ref={triggerRef}
            type="button"
            onClick={toggleOpen}
            aria-expanded={open}
            aria-controls="offramp-panel"
            className="text-[14px] font-semibold text-green-600 underline underline-offset-2"
          >
            {officerFirst
              ? `Prefer to talk to ${officerFirst} first?`
              : "Prefer to talk to a loan officer first?"}
          </button>

          {open && (
            <div
              id="offramp-panel"
              className="mt-4 rounded-lg border border-line bg-paper-2 p-5 text-left"
            >
              <div className="flex items-center gap-3.5">
                {officer && officer.photo ? (
                  <span className="relative size-12 shrink-0 overflow-hidden rounded-full border border-line bg-white">
                    <Image src={officer.photo} alt="" fill sizes="48px" className="object-cover object-top" />
                  </span>
                ) : null}
                <div className="min-w-0">
                  <h2
                    ref={panelHeadingRef}
                    tabIndex={-1}
                    className="text-[16px] font-bold leading-tight text-ink outline-none"
                  >
                    {officer ? officer.name : "Talk to a loan officer"}
                  </h2>
                  <p className="text-[13px] text-muted">
                    {officer ? `NMLS #${officer.nmls}` : `Call us at ${phoneDisplay}`}
                  </p>
                </div>
              </div>

              <p className="mt-4 text-[14px] text-muted">
                {officerFirst ? `${officerFirst} will reach out ` : "A loan officer will reach out "}
                {offRampSla}.
              </p>

              <div className="mt-4 flex flex-col gap-2.5">
                {showCall && callHref && (
                  <a
                    href={callHref}
                    onClick={() => onChannel("call")}
                    aria-label={officerFirst ? `Call ${officerFirst}` : "Call a loan officer"}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-lg border-[1.5px] border-line bg-white text-[15px] font-bold text-ink shadow-3d transition-colors duration-150 hover:bg-paper-2"
                  >
                    <Phone className="size-4 text-green-600" strokeWidth={2.2} aria-hidden="true" />
                    Call
                  </a>
                )}
                {showText && smsLink && (
                  <a
                    href={smsLink}
                    onClick={() => onChannel("text")}
                    aria-label={officerFirst ? `Text ${officerFirst}` : "Text a loan officer"}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-lg border-[1.5px] border-line bg-white text-[15px] font-bold text-ink shadow-3d transition-colors duration-150 hover:bg-paper-2"
                  >
                    <MessageSquare className="size-4 text-green-600" strokeWidth={2.2} aria-hidden="true" />
                    Text
                  </a>
                )}
                {showEmail && mailHref && (
                  <a
                    href={mailHref}
                    onClick={() => onChannel("email")}
                    aria-label={officerFirst ? `Email ${officerFirst}` : "Email a loan officer"}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-lg border-[1.5px] border-line bg-white text-[15px] font-bold text-ink shadow-3d transition-colors duration-150 hover:bg-paper-2"
                  >
                    <Mail className="size-4 text-green-600" strokeWidth={2.2} aria-hidden="true" />
                    Email
                  </a>
                )}
              </div>

              <p className="mt-4 text-[14px] font-semibold text-green-700" aria-live="polite">
                {confirmationLine()}
              </p>
            </div>
          )}
        </div>
      )}
```

> The Email anchor now renders only when `showEmail && mailHref` (a guaranteed-valid `mailto:<email>`), so the no-officer branch never produces `mailto:<phone-display>`. The `aria-live` confirmation `<p>` is rendered ONCE inside the open panel and only its text content swaps (via `confirmationLine()`), satisfying the "stable node" requirement.

- [ ] **14e — Typecheck (expect PASS):**

> This step's `tsc` will only go green after the Wizard task (Task 16) threads `phoneDisplay`/`phoneHref`/`emailDisplay`/`offRampChannels`/`offRampSla` into `<FinishStep>`. If Task 14 lands before Task 16, the Wizard call-site will report the new required props as missing — that is expected and resolved by Task 16. Sequence Task 16 immediately after this task (or land both in one commit).

```bash
npx tsc --noEmit
```

- [ ] **14f — Commit:**

```bash
git add src/components/apply/steps/FinishStep.tsx && git commit -m "feat(finish): reveal-on-demand LO off-ramp (call/text/email) on the finish screen

Quiet disclosure under Continue: officer photo/name/NMLS (or generic house-line
when no officer), three config-gated channel buttons, SLA copy, and a stable
aria-live confirmation. Email uses the officer email else the tenant house email
(never a phone string); Call/Text fire when a phone is on file (recapture path
follows). Emits offramp_open, channel_select, contact_request_*.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 15 — Phone-skipped recapture sub-form + TCPA consent gate (strict ordering)

Final FinishStep slice. When `contact.phone` is empty AND the chosen channel ∈ {call, text}, defer the request (and, for Text, the `sms:` deep link) until the borrower submits a valid number with affirmative TCPA consent. This task references the same contract members plus the new prop `consentTcpa: string` (the exact `buildConsentTcpa(config)` string, threaded by the Wizard task, Task 16 — never paraphrased).

This task references:
- `requestContact`, `track`, `smsHref` (already imported in Task 14).
- New prop `consentTcpa: string`.

- [ ] **15a — Add the `consentTcpa` prop.** Edit `/Users/zacharyzink/MSFG/WebProjects/msfg.us/src/components/apply/steps/FinishStep.tsx`. In the destructured signature, replace:

```tsx
  offRampChannels,
  offRampSla,
}: {
```

with:

```tsx
  offRampChannels,
  offRampSla,
  consentTcpa,
}: {
```

and in the prop type block, replace:

```tsx
  /** SLA callback copy, e.g. "within ~15 minutes". */
  offRampSla: string;
}) {
```

with:

```tsx
  /** SLA callback copy, e.g. "within ~15 minutes". */
  offRampSla: string;
  /** Exact TCPA consent string from buildConsentTcpa(config). Never paraphrase. */
  consentTcpa: string;
}) {
```

- [ ] **15b — Add recapture state.** Immediately AFTER the `const [confirmed, setConfirmed] = useState<Channel | null>(null);` line, insert:

```tsx
  // Phone-recapture sub-form (only when contact.phone is empty + channel is call/text).
  const [recapture, setRecapture] = useState<Channel | null>(null);
  const [recapturePhone, setRecapturePhone] = useState("");
  const [recaptureConsent, setRecaptureConsent] = useState(false);
  const phoneOnFile = (contact?.phone ?? "").trim() !== "";
  const recaptureValid = recapturePhone.trim().length >= 7 && recaptureConsent;
```

- [ ] **15c — Replace the Call/Text branch of `onChannel`.** Replace this block:

```tsx
    // Call/Text. Phone-skipped recapture is handled in a later slice; here we
    // assume contact.phone is present (the only path wired in this slice).
    fireRequest(channel);
    setConfirmed(channel);
  }
```

with:

```tsx
    // Call/Text with a phone already on file → fire immediately.
    if (phoneOnFile) {
      fireRequest(channel);
      setConfirmed(channel);
      return;
    }
    // Phone was skipped → reveal the consented-recapture sub-form. Do NOT fire
    // the request or open the sms: link yet (Call's tel: link still works via href).
    setRecapture(channel);
    track("offramp_phone_prompt");
  }

  function onRecaptureSubmit() {
    const channel = recapture;
    if (!channel || !recaptureValid) return;
    track("offramp_phone_submit");
    const phone = recapturePhone.trim();
    fireRequest(channel, { phone, consentTcpa: true });
    if (channel === "text") {
      const link = smsHref(phone);
      if (link) window.location.href = link;
    }
    setRecapture(null);
    setConfirmed(channel);
  }
```

- [ ] **15d — Render the sub-form.** Inside the open panel, REPLACE the confirmation paragraph:

```tsx
              <p className="mt-4 text-[14px] font-semibold text-green-700" aria-live="polite">
                {confirmationLine()}
              </p>
```

with:

```tsx
              {recapture && (
                <div className="mt-4 rounded-lg border border-line bg-white p-4">
                  <label htmlFor="recapture-phone" className="sr-only">
                    Your phone number
                  </label>
                  <input
                    id="recapture-phone"
                    type="tel"
                    inputMode="tel"
                    value={recapturePhone}
                    onChange={(e) => setRecapturePhone(e.target.value)}
                    placeholder="Your phone number"
                    aria-describedby="recapture-consent"
                    className="h-[52px] w-full rounded-lg border-[1.5px] border-line bg-white px-[18px] text-[16px] font-semibold text-ink shadow-3d outline-none transition-colors duration-150 placeholder:font-medium placeholder:text-[#9aa39c] focus:border-2 focus:border-green-600"
                  />
                  <label className="mt-3 flex items-start gap-2.5 text-[12.5px] leading-snug text-muted">
                    <input
                      type="checkbox"
                      checked={recaptureConsent}
                      onChange={(e) => setRecaptureConsent(e.target.checked)}
                      className="mt-0.5 size-4 shrink-0 accent-green-600"
                    />
                    <span id="recapture-consent">{consentTcpa}</span>
                  </label>
                  <button
                    type="button"
                    onClick={onRecaptureSubmit}
                    disabled={!recaptureValid}
                    className="mt-3 flex h-12 w-full items-center justify-center rounded-lg bg-green-600 text-[15px] font-bold text-white [box-shadow:0_3px_0_#0a3a2a,var(--shadow-3d)] transition-[transform,background,box-shadow] duration-150 hover:-translate-y-0.5 hover:bg-green-700 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                  >
                    Confirm
                  </button>
                </div>
              )}

              <p className="mt-4 text-[14px] font-semibold text-green-700" aria-live="polite">
                {confirmationLine()}
              </p>
```

> Strict ordering honored: tapping Call/Text with no phone on file ONLY reveals the sub-form (`offramp_phone_prompt`) — no `requestContact`, no `sms:`. The Confirm button is disabled until `recapturePhone.length >= 7 && recaptureConsent`. On submit: `offramp_phone_submit`, then `requestContact({phone, consentTcpa:true})`, then (Text) `sms:`, then confirmation. The TCPA string is rendered verbatim from the `consentTcpa` prop and associated via `aria-describedby="recapture-consent"`.

- [ ] **15e — Typecheck (expect PASS):**

```bash
npx tsc --noEmit
```

Expected: PASS (once Task 16 has threaded `consentTcpa` into `<FinishStep>`).

- [ ] **15f — Commit:**

```bash
git add src/components/apply/steps/FinishStep.tsx && git commit -m "feat(finish): TCPA-gated phone recapture for phone-skipped call/text off-ramp

When the borrower skipped their phone, Call/Text reveal a recapture sub-form
(sr-only label + exact consentTcpa string via aria-describedby + required consent
checkbox); Confirm is disabled until a valid number is entered and consent checked.
Only on submit do we fire requestContact({phone,consentTcpa:true}) and (Text) open
sms:. Emits offramp_phone_prompt, offramp_phone_submit.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 16 — Wire `applyOffRamp` config + officer/house contact through `page.tsx` → `Wizard` → `FinishStep`

**Files:** `src/app/apply/[intent]/page.tsx` (edit), `src/components/apply/Wizard.tsx` (edit)

Derive the off-ramp config server-side in the page (the page passes only plain strings/arrays to the client Wizard) and thread it — plus the already-derived `phoneDisplay`/`phoneHref`/`consentTcpa` and the tenant `emailDisplay` — through Wizard to FinishStep. Also update the now-stale heading-suppression comment in Wizard.

> **Prerequisites:** Task 9 (`deriveApplyOffRamp` exported from `src/content/site.ts`) and the FinishStep slices (Tasks 14–15) that widened FinishStep's signature with `phoneDisplay`/`phoneHref`/`emailDisplay`/`consentTcpa`/`offRampChannels`/`offRampSla`. The `officer` object already flows to `FinishStep` (`Wizard.tsx:231`) and the widened officer prop **type** is owned by Task 3 — this task only adds the config + email props.

No node test: this is pure JSX/prop plumbing with no extractable logic (the testable logic — `deriveApplyOffRamp`, `isHandoffTokenStale` — is covered in Tasks 9/11). Verify with `tsc`.

> **Prop-name discipline:** FinishStep (Tasks 14–15) destructures `offRampChannels` and `offRampSla`. Use those exact names end-to-end. The simplest path is to name the Wizard props `offRampChannels` and `offRampSla` too (no `offRampSlaCopy` alias). `finishScreen` is threaded only as far as Wizard (Wizard prop) and is NOT passed to `<FinishStep>` in v1 — FinishStep does not declare it (see 16c note).

- [ ] **16a — Derive the off-ramp config in `page.tsx`.** In `src/app/apply/[intent]/page.tsx`, import the helper. Add it to the existing import from `@/content/site` (currently `import { buildConsentTcpa, buildTestimonialCaption } from "@/content/site";`):

```ts
import { buildConsentTcpa, buildTestimonialCaption, deriveApplyOffRamp } from "@/content/site";
```

Then, immediately before the `return (<Wizard ... />)` block (lines 57–70), derive the config from the already-loaded tenant `config`:

```ts
  const offRamp = deriveApplyOffRamp(config);
```

> `config` is the tenant config already in scope in this Server Component (it is the source of `config.contact.phoneHref`, `config.brand.*`, etc., used in the existing Wizard props block). Reuse it; do not re-fetch.

- [ ] **16b — Pass the derived props to `<Wizard>`.** In the same file, edit the existing Wizard props block (lines 58–69) to add the off-ramp + tenant-email props. Replace:

```tsx
  return (
    <Wizard
      intent={intent}
      phoneHref={config.contact.phoneHref}
      phoneDisplay={config.contact.phoneDisplay}
      consentTcpa={buildConsentTcpa(config)}
      assistantName={config.brand.assistantName}
      shortName={config.brand.shortName}
      iconSrc={config.brand.logos.mark}
      testimonial={testimonial}
      calendarHref={calendarEmbedUrl() ?? ""}
      officers={officers}
    />
  );
```

with:

```tsx
  return (
    <Wizard
      intent={intent}
      phoneHref={config.contact.phoneHref}
      phoneDisplay={config.contact.phoneDisplay}
      emailDisplay={config.contact.email}
      consentTcpa={buildConsentTcpa(config)}
      assistantName={config.brand.assistantName}
      shortName={config.brand.shortName}
      iconSrc={config.brand.logos.mark}
      testimonial={testimonial}
      calendarHref={calendarEmbedUrl() ?? ""}
      officers={officers}
      offRampChannels={offRamp.channels}
      offRampSla={offRamp.slaCopy}
      finishScreen={offRamp.finishScreen}
    />
  );
```

- [ ] **16c — Accept the new props in `Wizard.tsx` and thread to `FinishStep`.** In `src/components/apply/Wizard.tsx`, add the new props to the Wizard component's props type/destructure. Locate the props block that already declares `phoneHref`, `phoneDisplay`, `consentTcpa`, `shortName`, `calendarHref`, `officers` (the values passed from `page.tsx` Step 16b). Add these fields to the props type:

```ts
  emailDisplay: string;
  offRampChannels: ("call" | "text" | "email")[];
  offRampSla: string;
  finishScreen: "rendered" | "autoRedirect";
```

and add `emailDisplay`, `offRampChannels`, `offRampSla`, `finishScreen` to the destructured parameter list alongside the existing `officers`, `phoneDisplay`, etc.

Then edit the `FinishStep` render block (lines 230–232). Replace:

```tsx
      {(step.type === "finish" || step.type === "account") && (
        <FinishStep intent={intent} contact={contact} leadId={leadId} shortName={shortName} calendarHref={calendarHref} officer={chosenOfficer} />
      )}
```

with:

```tsx
      {(step.type === "finish" || step.type === "account") && (
        <FinishStep
          intent={intent}
          contact={contact}
          leadId={leadId}
          shortName={shortName}
          calendarHref={calendarHref}
          officer={chosenOfficer}
          phoneDisplay={phoneDisplay}
          phoneHref={phoneHref}
          emailDisplay={emailDisplay}
          consentTcpa={consentTcpa}
          offRampChannels={offRampChannels}
          offRampSla={offRampSla}
        />
      )}
```

> `phoneDisplay`, `phoneHref`, `consentTcpa`, and `chosenOfficer` are already in scope in Wizard (`phoneDisplay`/`phoneHref`/`consentTcpa` are existing Wizard props; `chosenOfficer` is derived at lines 124–128). `emailDisplay` is the new Wizard prop added above. `FinishStep` accepts all of these per Tasks 14–15.
>
> **`finishScreen` is intentionally NOT passed to `<FinishStep>`.** FinishStep (Tasks 13–15) does not declare a `finishScreen` prop — it always renders the screen for v1 (the decision is `finishScreen: "rendered"` everywhere). Passing it would be an unknown prop and fail `tsc`. Keep `finishScreen` as a Wizard prop only (it is consumed by the page→Wizard contract and is available for a future FinishStep gate). The `<FinishStep>` element above deliberately omits it. See the rollout gap note at the end of the plan.

- [ ] **16d — Reference `finishScreen` so it is not an unused-var lint error.** Because `finishScreen` is destructured in Wizard but not yet forwarded to `<FinishStep>`, ESLint may flag it as unused. Add a single small reference that documents intent without changing behavior. Immediately before the `FinishStep` render block (Task 16c), insert:

```tsx
      {/* finishScreen is a tenant flag ("rendered" | "autoRedirect"). v1 always
          renders the finish screen; the autoRedirect rollback lever is wired but
          not yet consumed by FinishStep. Referenced here to keep it live. */}
      {void finishScreen}
```

> `{void finishScreen}` evaluates to `undefined` (renders nothing) and counts as a use, so no unused-var lint error. If your lint config still objects, instead prefix the destructured name with an eslint-disable for that line, or—cleaner—omit `finishScreen` from the Wizard destructure entirely and drop it from the props type (it is then carried only as far as the page's `<Wizard>` call). Pick whichever your lint config accepts; do NOT pass it to `<FinishStep>`.

- [ ] **16e — Update the stale heading-suppression comment in `Wizard.tsx`.** The comment at lines 156–162 still claims the finish step auto-redirects. Replace:

```tsx
      {/* The finish/account step auto-redirects to the app's /continue page,
          so we suppress the big step heading (no "You're all set" screen). */}
      {step.type !== "finish" && step.type !== "account" && (
```

with:

```tsx
      {/* The finish/account step now renders its own screen and owns its in-component
          title (Continue + the LO off-ramp); we keep the big Wizard step heading
          suppressed so the finish screen isn't double-headed. */}
      {step.type !== "finish" && step.type !== "account" && (
```

- [ ] **16f — Typecheck:**

```bash
npx tsc --noEmit
```

Expected: PASS (with FinishStep widened by Tasks 14–15 and the prop names aligned per 16c; `finishScreen` is NOT on the `<FinishStep>` element).

- [ ] **16g — Commit:**

```bash
git add "src/app/apply/[intent]/page.tsx" src/components/apply/Wizard.tsx
git commit -m "feat(apply): thread applyOffRamp config + house line + tenant email + consent to FinishStep

page.tsx derives applyOffRamp (channels/slaCopy/finishScreen) and passes plain
strings/array to Wizard, which threads them plus phoneDisplay/phoneHref/emailDisplay/
consentTcpa and the chosen officer to FinishStep. finishScreen stays a Wizard-level
flag (not consumed by FinishStep in v1). Updates the stale auto-redirect heading comment.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification

Run the full gates and both manual UI checklists before declaring the funnel pivot complete.

- [ ] **Full node test suite (expect PASS, no `.tsx` collected):**

```bash
npx vitest run
```

Expected: PASS — including `officerSearch.test.ts`, `handoffStale.test.ts`, `offRampLink.test.ts`, `applyOffRamp.test.ts`, `lead.test.ts`, `recordContactRequest.test.ts`, `syncContactRequestTag.test.ts`, `mappers.test.ts`, the contact-request `route.test.ts`, and `requestContact.test.ts`. The vitest glob is `src/**/*.test.ts` — no `.tsx`/jsdom tests are collected, consistent with the v1 node-only decision.

- [ ] **Typecheck + lint (expect PASS):**

```bash
npx tsc --noEmit && npm run lint
```

Expected: PASS. If `npm run lint` flags an unused `calendarHref` in `FinishStep` (intentionally accepted for call-site compatibility but unused after the rewrite), drop it from the destructure (keeping it only in the prop type) — the off-ramp supersedes the old calendar CTA. If `finishScreen` is flagged unused in `Wizard.tsx`, apply the Task 16d resolution. If a lint fix was made:

```bash
git add src/components/apply/steps/FinishStep.tsx src/components/apply/Wizard.tsx && git commit -m "chore(finish): drop unused calendarHref destructure / settle finishScreen ref after off-ramp rewrite

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Part 1 manual UI checklist.** Run `npm run dev`, open `http://localhost:3000/apply/buy`, advance to the "Who would you like to work with?" step, and confirm:

1. **Desktop 4-col grid.** At ≥981px the officer tiles render in **4 columns** (`grid-cols-4`): round avatar on top, then name, then green title — centered.
2. **≤980px 2-col grid.** Narrow to ≤980px; tiles reflow to **2 columns** (`max-[980px]:grid-cols-2`). No horizontal overflow.
3. **In-state default + note.** With a known property state, only in-state officers show by default and the "Licensed in <State>" note appears above the grid. (If no officer is in-state, all officers show and the note is hidden.)
4. **Search searches the full roster.** Type a name belonging to an **out-of-state** officer; they appear (state filter bypassed while searching) and the "Licensed in" note disappears while the query is non-empty.
5. **Focus retention while typing.** Typing does not steal/drop focus between keystrokes (no `autoFocus`, no input remount); cursor stays and characters appear in order.
6. **No Enter side-effect.** Pressing Enter in the search box does nothing (no auto-advance, no submit).
7. **Empty state.** Type `zzz`; the grid is replaced by the centered "No loan officers match "zzz"." message (`aria-live="polite"`). Clearing the box restores the grid.
8. **Long-name wrap.** A long officer name (e.g. "Michael Grensteiner" or "Robert Hoff, CFA") wraps onto multiple lines INSIDE its tile (via `break-words`) — it does not overflow the tile edge, push the grid wider, or get truncated. Verify in both 4-col and 2-col layouts.
9. **Auto-advance preserved.** Tap a tile; it shows the selected green/white state (`aria-pressed="true"`) and the wizard auto-advances to the finish step after ~260ms (`AUTO_ADVANCE_MS`).
10. **No preference preserved.** The "No preference — match me with the right loan officer" button renders below the grid, toggles `aria-pressed`, and auto-advances.
11. **Keyboard a11y.** Tab to the search input (visible focus ring), Tab to tiles (visible focus ring), activate a tile with Space/Enter — it selects and advances.

- [ ] **Part 2 manual UI checklist.** Reach the finish step in the dev server and confirm:

1. **Rendered finish screen.** The screen RENDERS (title "You're all set — finish your application" + green "Continue your application" button) instead of an instant redirect. The Wizard heading stays suppressed (no duplicate heading). `finish_view` fires on mount.
2. **Continue happy path.** Click Continue after the pre-warm lands → navigates to `${APP_URL}/continue?t=<token>`; `continue_click` fires with `{ warmed: true, remintRequired: false }`.
3. **Continue fallback.** In DevTools block `POST /api/v1/applications`. Click Continue → button shows "Setting up…" disabled, click-time re-mint also fails → button swaps to the bare-`APP_URL` `<a>` fallback and `continue_fallback_shown` fires. You are NOT navigated to a token-required `/continue` without a token.
4. **Off-ramp disclosure (officer chosen, phone on file).** Click "Prefer to talk to {officerFirst} first?" → panel expands, focus moves to the officer-name heading, `offramp_open` fires, `aria-expanded` flips to `true`.
5. **Email / Call / Text (phone on file).** Click Email → `mailto:<officer-or-house-email>` opens (never a phone string), `channel_select{channel:"email"}` then `contact_request_ok`/`_fail` fire, confirmation appears in the stable `aria-live` node. Click Call → `tel:` dials; click Text → `sms:` opens; both fire `channel_select` + `contact_request_*` and swap the confirmation text in place (the `aria-live` node is NOT remounted).
6. **Collapse.** Re-click the disclosure trigger → focus returns to the trigger.
7. **No officer chosen (`officer === null`).** Panel shows "Talk to a loan officer" + the house line `phoneDisplay`; channel `aria-label`s read "Call/Text/Email a loan officer"; Call/Text use the house line; **Email uses the tenant house email (`config.contact.email`)** — confirm the `mailto:` target is a valid email address, NOT the phone display. A channel whose config flag is off does not render. If the tenant had no email at all, the Email channel does not render.
8. **Phone-skipped recapture (Text).** With a lead whose phone was skipped (`contact.phone === ""`): click Text → recapture sub-form reveals (sr-only-labeled phone input + the exact `consentTcpa` string + required checkbox + disabled Confirm); `offramp_phone_prompt` fires; NO `contact_request_*` and NO `sms:` yet.
9. **Recapture gating.** Confirm stays disabled with only a number, and with only the checkbox. Enter a 7+ digit number AND check the box → Confirm enables. Click Confirm → `offramp_phone_submit` fires, then `requestContact` fires with `{ phone, consentTcpa: true }` (verify request body in Network), then `sms:` opens to the recaptured number, then the confirmation line appears; `contact_request_ok`/`_fail` fires on resolve.
10. **Phone-skipped Call.** Click Call with no phone on file → sub-form reveals the same way, but the officer/house `tel:` link still dials immediately on the Call tap (its `href`), while NO LO-callback request is sent until Confirm. Abandoning the sub-form (collapsing without submitting) fires no request and shows no confirmation.

Once both checklists pass with the test suite + typecheck + lint green, the funnel pivot (Part 1 + Part 1.5 + Part 2) is complete and each Part is independently shippable.

---

## Rollout / known gap

- **Config-driven rollback lever (`finishScreen: "autoRedirect"`) is NOT functional in v1.** The flag is derived (`deriveApplyOffRamp`), defaulted to `"rendered"`, persisted on the tenant config, and threaded to `Wizard` — but `FinishStep` never reads it and always renders the screen. Flipping a tenant's `applyOffRamp.finishScreen` to `"autoRedirect"` therefore does NOT restore the pre-90188bb auto-redirect behavior; that rollback would currently require a code revert.
- **If the config rollback lever is required for ship,** add a small gate in `FinishStep`: when `finishScreen === "autoRedirect"`, re-introduce the mount-navigate effect (the deleted effect from 90188bb) behind that condition and skip rendering the Continue/off-ramp UI. Thread `finishScreen` into `<FinishStep>` (add the `finishScreen?: "rendered" | "autoRedirect"` prop) at that time. This is intentionally deferred — the v1 decision is `"rendered"` everywhere, so default behavior is correct and the gap affects only the config-only rollback path, not any shipped user-facing behavior.
