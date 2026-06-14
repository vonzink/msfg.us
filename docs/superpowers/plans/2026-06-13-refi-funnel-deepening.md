# Refi Funnel Deepening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deepen the refinance branch of the apply wizard into a Better-grade qualified-lead funnel (goals → Google-Places address → property → value/balance/credit-band → optional income → split contact → two-door finish), with hero-deck step motion, and hand off prefilled to the LOS — no credit pull, no schema migration.

**Architecture:** Extend the existing config-driven wizard (`FLOW[intent]` → typed step renderers). Add four step types + a deck-motion transition wrapper; normalize answers into named lead fields (pure); set a best-effort `returning` flag server-side; proxy Google Places behind a swappable server-side `AddressProvider`. Build generically so `buy`/`cash` adopt the new types later; **refi is deepened now**.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4 tokens, vitest (node env — pure-TS tests only), lucide-react, Prisma 7 / Postgres (tenant-scoped), Google Places API (New).

**Spec:** `docs/superpowers/specs/2026-06-13-refi-funnel-deepening-design.md`

**Conventions (every task):** no hardcoded hex outside `globals.css` beyond the established exceptions already in these files (`#0a3a2a` button lip, `#9aa39c` placeholder, `#cfd6cd`/`#cfd6cd` disabled, `#F4B740` star); breakpoint 980px; `@/*` → `src/*`. Reuse the existing apply input/button class strings verbatim (shown in tasks). Run `npx tsc --noEmit && npm run lint` before every commit; end commit messages with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

## File map

| File | Action | Responsibility |
| --- | --- | --- |
| `src/lib/leads.ts` | Modify | `AnswerValue`, `StructuredAddress` types; widen `LeadPayload.answers`; add `fields` |
| `src/lib/applyFields.ts` | Create | Pure: `buildLeadFields`, `parseCurrency`, `formatCurrency` |
| `src/lib/applyFields.test.ts` | Create | Unit tests for the pure helpers |
| `src/content/flows.ts` | Modify | New step shapes (`multi`/`currency`/`address`/`finish`), `field` keys, deepened `FLOW.refi` |
| `src/server/leads/returning.ts` | Create | Pure `resolveReturning(signals)` |
| `src/server/leads/returning.test.ts` | Create | Unit tests for the resolver |
| `src/server/leads/leadService.ts` | Modify | Gather signals + set `returning` in `captureLead` |
| `src/app/api/v1/leads/route.ts` | Modify | Best-effort session → pass `sessionEmail`/`cognitoSub` to capture |
| `src/validation/lead.ts` | Modify | Accept optional `fields` on the lead payload |
| `src/app/globals.css` | Modify | Deck-motion keyframes |
| `src/components/apply/DeckStage.tsx` | Create | Direction-aware two-layer step transition (peek + spring) |
| `src/components/apply/steps/MultiStep.tsx` | Create | Multi-select checkboxes + Continue |
| `src/components/apply/steps/CurrencyStep.tsx` | Create | `$` input + optional Skip |
| `src/server/integrations/address/types.ts` | Create | `AddressProvider`, `AddressSuggestion`, `StructuredAddress` |
| `src/server/integrations/address/googlePlaces.ts` | Create | Google Places (New) impl |
| `src/server/integrations/address/index.ts` | Create | `getAddressProvider()` selector |
| `src/server/integrations/address/googlePlaces.test.ts` | Create | Provider mapping tests (mocked fetch) |
| `src/app/api/v1/address/suggest/route.ts` | Create | Autocomplete proxy |
| `src/app/api/v1/address/details/route.ts` | Create | Place-details proxy |
| `src/lib/env.ts` | Modify | `GOOGLE_PLACES_API_KEY` (optional) |
| `src/components/apply/steps/AddressStep.tsx` | Create | Autocomplete + Apt/Unit + ZIP, text fallback |
| `src/components/apply/steps/ContactStep.tsx` | Create | Two-pane name+email → phone+TCPA, "Hi {name}!" |
| `src/components/apply/steps/FinishStep.tsx` | Create | Two-door finish (evolves AccountStep + GHL booking) |
| `src/components/apply/Wizard.tsx` | Modify | Widen answers; render new types; direction tracking; named-fields submit |

---

### Task 1: Answer types + named-field normalizer (pure, TDD)

**Files:**
- Modify: `src/lib/leads.ts`
- Create: `src/lib/applyFields.ts`
- Test: `src/lib/applyFields.test.ts`

- [ ] **Step 1: Add shared types to `src/lib/leads.ts`**

Insert after the `LeadContact` type:

```ts
/** A structured property address captured by the `address` step. */
export type StructuredAddress = {
  line1: string;
  /** Apt / unit / suite. */
  line2?: string;
  city: string;
  state: string;
  zip: string;
  /** Provider place id (Google), when an autocomplete suggestion was chosen. */
  placeId?: string;
};

/** Any value a wizard step can store. Index-keyed in the wizard; the named
 *  normalizer (`buildLeadFields`) turns these into meaningful lead fields. */
export type AnswerValue = string | string[] | number | StructuredAddress | null;
```

Then widen `LeadPayload` — change `answers: Record<number, string>` to `answers: Record<number, AnswerValue>` and add an optional `fields`:

```ts
export type LeadPayload = {
  intent: Intent;
  contact: LeadContact;
  /** Raw step answers, keyed by step index. */
  answers: Record<number, AnswerValue>;
  /** Named, normalized fields (built by buildLeadFields) for CRM/LOS/LO use. */
  fields?: Record<string, AnswerValue>;
  location?: string;
  consentTcpa: true;
  idempotencyKey: string;
  source: "apply-wizard";
};
```

Update the `submitLead` `input` type accordingly (it's `Omit<LeadPayload, "consentTcpa" | "idempotencyKey" | "source">` — no change needed beyond the widened `LeadPayload`).

- [ ] **Step 2: Write the failing tests**

`src/lib/applyFields.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildLeadFields, parseCurrency, formatCurrency } from "./applyFields";
import type { Step } from "@/content/flows";

const STEPS: Step[] = [
  { type: "multi", q: "Goals?", field: "goals", opts: [] },
  { type: "address", q: "Address?", field: "address" },
  { type: "choice", q: "Use?", field: "propertyUse", opts: [] },
  { type: "currency", q: "Value?", field: "homeValue" },
  { type: "currency", q: "Income?", field: "income", optional: true },
  { type: "form", q: "Contact" },
];

describe("parseCurrency", () => {
  it("strips formatting to a number", () => {
    expect(parseCurrency("$485,000")).toBe(485000);
    expect(parseCurrency("485000")).toBe(485000);
  });
  it("returns null for empty/garbage", () => {
    expect(parseCurrency("")).toBeNull();
    expect(parseCurrency("abc")).toBeNull();
  });
});

describe("formatCurrency", () => {
  it("groups thousands; null → empty", () => {
    expect(formatCurrency(485000)).toBe("485,000");
    expect(formatCurrency(null)).toBe("");
  });
});

describe("buildLeadFields", () => {
  it("maps answers to each step's field key, skipping empties and fieldless steps", () => {
    const answers = {
      0: ["Lower my monthly payment", "Take cash out"],
      1: { line1: "9035 Wadsworth Pkwy", city: "Broomfield", state: "CO", zip: "80021" },
      2: "Primary residence",
      3: 485000,
      4: null, // optional income skipped
      // index 5 (form) has no `field` → never included
    };
    expect(buildLeadFields(STEPS, answers)).toEqual({
      goals: ["Lower my monthly payment", "Take cash out"],
      address: { line1: "9035 Wadsworth Pkwy", city: "Broomfield", state: "CO", zip: "80021" },
      propertyUse: "Primary residence",
      homeValue: 485000,
    });
  });
  it("omits a field whose answer is an empty string", () => {
    expect(buildLeadFields([{ type: "choice", q: "x", field: "propertyUse", opts: [] }], { 0: "" })).toEqual({});
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/lib/applyFields.test.ts`
Expected: FAIL — `Cannot find module './applyFields'`

- [ ] **Step 4: Implement `src/lib/applyFields.ts`**

```ts
import type { Step } from "@/content/flows";
import type { AnswerValue } from "@/lib/leads";

/** Parse a user-typed currency string to a whole number, or null. */
export function parseCurrency(input: string): number | null {
  const digits = input.replace(/[^0-9]/g, "");
  if (!digits) return null;
  return Number(digits);
}

/** Format a number with thousands separators for display; null → "". */
export function formatCurrency(n: number | null): string {
  return n == null ? "" : n.toLocaleString("en-US");
}

/** True for values that should not be written to the lead (blank/absent). */
function isEmpty(v: AnswerValue | undefined): boolean {
  return v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
}

/**
 * Normalize index-keyed wizard answers into named lead fields, using each
 * step's `field` key. Steps without a `field` (e.g. `form`, `finish`) are
 * skipped, as are empty answers. Pure.
 */
export function buildLeadFields(
  steps: Step[],
  answers: Record<number, AnswerValue>,
): Record<string, AnswerValue> {
  const out: Record<string, AnswerValue> = {};
  steps.forEach((step, i) => {
    const field = "field" in step ? step.field : undefined;
    if (!field) return;
    const v = answers[i];
    if (isEmpty(v)) return;
    out[field] = v as AnswerValue;
  });
  return out;
}
```

(Task 2 adds the `field` keys + new step shapes to `flows.ts`; this file compiles against them once Task 2 lands. To keep Task 1 self-contained and green, do Step 5 only after Task 2 — OR temporarily run just the unit file, which imports types only. Since vitest erases types, `npx vitest run src/lib/applyFields.test.ts` passes now; `tsc` goes green after Task 2. Commit Task 1 + Task 2 are sequential and both precede any `tsc` gate in Task 3.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/applyFields.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/leads.ts src/lib/applyFields.ts src/lib/applyFields.test.ts
git commit -m "feat(apply): answer-value types + pure named-field normalizer"
```

---

### Task 2: Step config — new shapes, field keys, deepened FLOW.refi

**Files:**
- Modify: `src/content/flows.ts`

- [ ] **Step 1: Add `field` to existing answerable steps + define new step types**

In `src/content/flows.ts`, add `field?` to `ChoiceStep` and `PlaceStep`, and add the four new step types. Replace the step-type block:

```ts
type ChoiceStep = {
  type: "choice";
  q: string;
  /** Named lead-field key (e.g. "propertyUse"); omit for non-captured choices. */
  field?: string;
  opts: ChoiceOption[];
  sub?: string;
  review?: boolean;
};

type BinaryStep = {
  type: "binary";
  q: string;
  field?: string;
  help?: string;
  usatoday?: boolean;
};

type PlaceStep = {
  type: "place";
  q: string;
  field?: string;
  field_label: string; // renamed below to avoid clash — see note
  placeholder: string;
};

type FormStep = { type: "form"; q: string };
type AccountStep = { type: "account"; q: string };

/** Multi-select (checkboxes). Stores string[]. */
type MultiStep = {
  type: "multi";
  q: string;
  field: string;
  opts: ChoiceOption[];
  sub?: string;
};

/** Currency ($) input. Stores number | null. `optional` adds a Skip control. */
type CurrencyStep = {
  type: "currency";
  q: string;
  field: string;
  placeholder?: string;
  optional?: boolean;
  help?: string;
};

/** Street-address autocomplete (+ Apt/Unit + ZIP). Stores StructuredAddress. */
type AddressStep = {
  type: "address";
  q: string;
  field: string;
  help?: string;
};

/** Two-door finish (Continue in the app / Talk to a loan officer). */
type FinishStep = { type: "finish"; q: string };

export type Step =
  | ChoiceStep
  | BinaryStep
  | PlaceStep
  | FormStep
  | AccountStep
  | MultiStep
  | CurrencyStep
  | AddressStep
  | FinishStep;
```

**Note on `PlaceStep.field`:** the existing `PlaceStep` already has a property named `field` (the floating label). Rename that label property to `fieldLabel` to free `field` for the lead-key. Update `PlaceStep` to:

```ts
type PlaceStep = {
  type: "place";
  q: string;
  /** Named lead-field key. */
  field?: string;
  /** Floating-label text for the input. */
  fieldLabel: string;
  placeholder: string;
};
```

Then update the three existing `place` entries in `FLOW` (buy/refi/cash) to use `fieldLabel` instead of `field`, and `PlaceStep.tsx` prop `field` → `fieldLabel` (Task is small — see Step 3).

- [ ] **Step 2: Replace `FLOW.refi` with the deepened sequence**

```ts
  refi: [
    {
      type: "multi",
      q: "What are your refinance goals?",
      field: "goals",
      sub: "Select all that apply.",
      opts: [
        { label: "Lower my monthly payment", icon: "invest" },
        { label: "Long-term savings", icon: "cal", badge: "15" },
        { label: "Take cash out", icon: "house" },
        { label: "Just checking rates", icon: "help" },
      ],
    },
    {
      type: "address",
      q: "What home are you refinancing?",
      field: "address",
      help: "Why do we need this?",
    },
    {
      type: "choice",
      q: "How do you use this property?",
      field: "propertyUse",
      opts: [
        { label: "Primary residence", icon: "mailbox" },
        { label: "Second home", icon: "palm" },
        { label: "Investment property", icon: "invest" },
      ],
    },
    {
      type: "choice",
      q: "What type of property is it?",
      field: "propertyType",
      opts: [
        { label: "Single Family", icon: "house" },
        { label: "Condo", icon: "condo" },
        { label: "Townhouse", icon: "coop" },
        { label: "Manufactured home", icon: "manuf" },
      ],
      review: true,
    },
    {
      type: "currency",
      q: "What's your estimated home value?",
      field: "homeValue",
      placeholder: "e.g. 485,000",
    },
    {
      type: "currency",
      q: "What's your current mortgage balance?",
      field: "mortgageBalance",
      placeholder: "e.g. 312,000",
    },
    {
      type: "choice",
      q: "What's your estimated credit score?",
      field: "creditBand",
      sub: "A self-estimate is fine — this won't affect your credit.",
      opts: [
        { label: "Excellent (740+)", icon: "invest" },
        { label: "Good (680–739)", icon: "house" },
        { label: "Fair (620–679)", icon: "cal", badge: "F" },
        { label: "Below 620", icon: "help" },
        { label: "Not sure", icon: "help" },
      ],
    },
    {
      type: "currency",
      q: "What's your household income?",
      field: "income",
      placeholder: "e.g. 120,000",
      optional: true,
    },
    { type: "form", q: "Let's start personalizing your offer!" },
    { type: "finish", q: "You're all set — what's next?" },
  ],
```

Leave `FLOW.buy` and `FLOW.cash` unchanged except the `place` step's `field:` → `fieldLabel:` rename (mechanical).

- [ ] **Step 3: Rename `PlaceStep` label prop usage**

In `src/components/apply/steps/PlaceStep.tsx`, rename the prop `field` → `fieldLabel` (both the destructure and the two usages — the `<label>` text and the `htmlFor` stays `id`). In `Wizard.tsx` the `place` branch passes `field={step.field}` → change to `fieldLabel={step.fieldLabel}` (Task 10 covers the Wizard switch; for now just keep it compiling — update this one prop here).

- [ ] **Step 4: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: clean (Task 1's `applyFields.ts` now resolves `field` on steps).

- [ ] **Step 5: Commit**

```bash
git add src/content/flows.ts src/components/apply/steps/PlaceStep.tsx
git commit -m "feat(apply): new step shapes + field keys + deepened FLOW.refi"
```

---

### Task 3: Returning-borrower resolver (pure, TDD) + wire into capture

**Files:**
- Create: `src/server/leads/returning.ts`
- Test: `src/server/leads/returning.test.ts`
- Modify: `src/server/leads/leadService.ts`, `src/app/api/v1/leads/route.ts`, `src/validation/lead.ts`

- [ ] **Step 1: Write the failing test**

`src/server/leads/returning.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveReturning } from "./returning";

describe("resolveReturning", () => {
  it("session match wins", () => {
    expect(resolveReturning({ sessionEmailMatches: true, priorLeadExists: true, ghlContactExists: false }))
      .toEqual({ returning: true, reason: "session" });
  });
  it("prior lead next", () => {
    expect(resolveReturning({ sessionEmailMatches: false, priorLeadExists: true, ghlContactExists: false }))
      .toEqual({ returning: true, reason: "prior-lead" });
  });
  it("ghl last", () => {
    expect(resolveReturning({ sessionEmailMatches: false, priorLeadExists: false, ghlContactExists: true }))
      .toEqual({ returning: true, reason: "ghl" });
  });
  it("no signals → not returning", () => {
    expect(resolveReturning({ sessionEmailMatches: false, priorLeadExists: false, ghlContactExists: false }))
      .toEqual({ returning: false, reason: null });
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run src/server/leads/returning.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/server/leads/returning.ts`**

```ts
/** Signals gathered server-side for returning-borrower recognition. */
export type ReturningSignals = {
  /** An authenticated session whose email equals the lead email. */
  sessionEmailMatches: boolean;
  /** A prior tenant Lead exists with the same email. */
  priorLeadExists: boolean;
  /** A GHL contact already exists for the email (when GHL is configured). */
  ghlContactExists: boolean;
};

export type ReturningResult = {
  returning: boolean;
  reason: "session" | "prior-lead" | "ghl" | null;
};

/** Resolve recognition from signals, in priority order. Pure. */
export function resolveReturning(s: ReturningSignals): ReturningResult {
  if (s.sessionEmailMatches) return { returning: true, reason: "session" };
  if (s.priorLeadExists) return { returning: true, reason: "prior-lead" };
  if (s.ghlContactExists) return { returning: true, reason: "ghl" };
  return { returning: false, reason: null };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/server/leads/returning.test.ts`
Expected: PASS

- [ ] **Step 5: Accept optional `fields` + `sessionEmail` in the lead contract**

In `src/validation/lead.ts`, add to `leadInputSchema` (after `answers`):

```ts
  /** Named, normalized fields (built client-side by buildLeadFields). */
  fields: z.record(z.string(), z.unknown()).optional(),
```

- [ ] **Step 6: Gather signals + set returning in `captureLead`**

In `src/server/leads/leadService.ts`, extend `captureLead`. After computing `existing` and before building `data`, gather signals and fold a `returning` marker into the stored answers. Add this just before the `const data:` block:

```ts
  // Returning-borrower recognition (best-effort; never blocks). The route may
  // pass the signed-in email (sessionEmail) when a Cognito session is present.
  const priorLead = await db.lead.findFirst({
    where: { email: input.contact.email, NOT: { idempotencyKey: input.idempotencyKey } },
    select: { id: true },
  });
  const { resolveReturning } = await import("./returning");
  const recognition = resolveReturning({
    sessionEmailMatches:
      Boolean(input.sessionEmail) &&
      input.sessionEmail!.toLowerCase() === input.contact.email.toLowerCase(),
    priorLeadExists: Boolean(priorLead),
    ghlContactExists: false, // GHL existence lookup deferred (no find-by-email yet)
  });

  // Merge the recognition marker + named fields into the persisted answers JSON.
  const mergedAnswers = {
    ...(input.answers as Record<string, unknown>),
    ...(input.fields ? { fields: input.fields } : {}),
    returning: recognition.returning,
    returningReason: recognition.reason,
  };
```

Then change the `data` object's `answers` to `mergedAnswers as object`, and set `cognitoSub: input.cognitoSub ?? null` on the create payload. Add `sessionEmail?: string` and `cognitoSub?: string` to the `LeadInput` type usage — they come from the route (Step 7); add them to `leadInputSchema` as optional server-only fields:

```ts
  /** Set server-side from the session — never trusted from the public client. */
  sessionEmail: z.string().email().optional(),
  cognitoSub: z.string().min(1).optional(),
```

(These are stripped/overwritten by the route in Step 7 so a hostile client can't spoof them.)

- [ ] **Step 7: Populate session fields in the route**

In `src/app/api/v1/leads/route.ts`, after `const parsed = leadInputSchema.safeParse(json)` succeeds, overwrite any client-supplied session fields with the real session (best-effort):

```ts
  // Never trust client-supplied identity; derive from the session if present.
  const { getSession } = await import("@/lib/auth/session");
  const session = await getSession().catch(() => null);
  const data = {
    ...parsed.data,
    sessionEmail: session?.email,
    cognitoSub: session?.sub,
  };
```

Then call `captureLead(data)` instead of `captureLead(parsed.data)`.

(Verify `getSession()` returns `{ email?, sub? }` — adjust field names to match `src/lib/auth/session.ts`. If `getSession` requires no args and returns null when unconfigured, the `.catch` + optional chaining keep this safe.)

- [ ] **Step 8: Add a capture test for returning**

Append to an existing leadService test file if present, else create `src/server/leads/leadService.returning.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

// Verifies the recognition marker is merged into the persisted answers.
// getTenantDb + crm are mocked so this stays a pure-logic test.
vi.mock("@/lib/db", () => ({
  getTenantDb: async () => ({
    lead: {
      findFirst: vi.fn().mockResolvedValue(null), // no prior lead
      create: vi.fn().mockImplementation(async ({ data }: any) => ({ id: "L1", ...data, syncStatus: "PENDING" })),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  }),
}));

describe("captureLead returning marker", () => {
  it("stamps returning:false with no signals", async () => {
    const { captureLead } = await import("./leadService");
    const crm = { upsertContact: async () => ({ skipped: true }), createOpportunity: async () => ({}) } as any;
    const res = await captureLead(
      {
        intent: "refi",
        contact: { firstName: "Z", lastName: "Z", email: "z@x.com", phone: "3035550000" },
        answers: {},
        consentTcpa: true,
        idempotencyKey: "0123456789abcdef",
        source: "apply-wizard",
      } as any,
      crm,
    );
    expect(res.leadId).toBe("L1");
  });
});
```

- [ ] **Step 9: Verify + commit**

Run: `npx vitest run src/server/leads/ && npx tsc --noEmit && npm run lint`
Expected: PASS / clean

```bash
git add src/server/leads/returning.ts src/server/leads/returning.test.ts src/server/leads/leadService.ts src/server/leads/leadService.returning.test.ts src/app/api/v1/leads/route.ts src/validation/lead.ts
git commit -m "feat(apply): best-effort returning-borrower flag on lead capture"
```

---

### Task 4: Deck-motion step transition

**Files:**
- Create: `src/components/apply/DeckStage.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Add deck-motion keyframes to `globals.css`**

Inside `@layer components`, after the `.step-in` block:

```css
  /* Apply-wizard deck motion: the incoming step springs forward; the outgoing
     step briefly recedes/peeks behind (hero-deck depth language, linear flow). */
  .deck-enter-fwd {
    animation: deck-enter-fwd 0.5s cubic-bezier(0.18, 0.9, 0.2, 1.05) both;
  }
  .deck-enter-back {
    animation: deck-enter-back 0.5s cubic-bezier(0.18, 0.9, 0.2, 1.05) both;
  }
  .deck-exit-fwd {
    animation: deck-exit-fwd 0.5s cubic-bezier(0.4, 0, 0.2, 1) both;
  }
  .deck-exit-back {
    animation: deck-exit-back 0.5s cubic-bezier(0.4, 0, 0.2, 1) both;
  }
```

At the end of the file (next to the other `@keyframes`):

```css
@keyframes deck-enter-fwd {
  from { opacity: 0; transform: translateY(34px) scale(0.96); }
  to { opacity: 1; transform: none; }
}
@keyframes deck-enter-back {
  from { opacity: 0; transform: translateY(-22px) scale(0.98); }
  to { opacity: 1; transform: none; }
}
@keyframes deck-exit-fwd {
  from { opacity: 1; transform: none; }
  to { opacity: 0; transform: translateY(-18px) scale(0.97); }
}
@keyframes deck-exit-back {
  from { opacity: 1; transform: none; }
  to { opacity: 0; transform: translateY(26px) scale(0.97); }
}
```

(The global `prefers-reduced-motion` rule already forces these to ~0ms → instant swap.)

- [ ] **Step 2: Create `src/components/apply/DeckStage.tsx`**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Wraps the active wizard step and animates step changes with the hero deck's
 * motion: the incoming step springs forward while the previous step briefly
 * recedes/peeks behind. Linear + focused — only the active step is interactive;
 * the receding ghost is aria-hidden and pointer-events-none, and is unmounted
 * once the transition ends. `stepKey` identifies the active step (its index);
 * `direction` is +1 forward / -1 back.
 */
export function DeckStage({
  stepKey,
  direction,
  children,
}: {
  stepKey: number;
  direction: 1 | -1;
  children: React.ReactNode;
}) {
  const [current, setCurrent] = useState({ key: stepKey, node: children });
  const [ghost, setGhost] = useState<{ key: number; node: React.ReactNode } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (stepKey === current.key) {
      // same step, content may have updated (e.g. selection) — refresh in place
      setCurrent((c) => ({ key: c.key, node: children }));
      return;
    }
    // Step changed: push the old one to the ghost layer, swap in the new one.
    setGhost(current);
    setCurrent({ key: stepKey, node: children });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setGhost(null), 520);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepKey, children]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const enter = direction === 1 ? "deck-enter-fwd" : "deck-enter-back";
  const exit = direction === 1 ? "deck-exit-fwd" : "deck-exit-back";

  return (
    <div className="relative w-full">
      {ghost && (
        <div key={`ghost-${ghost.key}`} className={`absolute inset-0 ${exit}`} aria-hidden>
          <div className="pointer-events-none">{ghost.node}</div>
        </div>
      )}
      <div key={`cur-${current.key}`} className={enter}>
        {current.node}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean (DeckStage is not yet wired — Task 10 wires it).

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css src/components/apply/DeckStage.tsx
git commit -m "feat(apply): deck-motion step transition (spring enter + peek exit)"
```

---

### Task 5: MultiStep + CurrencyStep renderers

**Files:**
- Create: `src/components/apply/steps/MultiStep.tsx`, `src/components/apply/steps/CurrencyStep.tsx`

- [ ] **Step 1: Create `MultiStep.tsx`**

```tsx
"use client";

import { cn } from "@/lib/cn";
import type { ChoiceOption } from "@/content/flows";
import { StepIcon } from "./icons";

/** Multi-select step: toggle options, explicit Continue. Stores string[]. */
export function MultiStep({
  options,
  sub,
  selected,
  onChange,
  onNext,
}: {
  options: ChoiceOption[];
  sub?: string;
  selected: string[];
  onChange: (next: string[]) => void;
  onNext: () => void;
}) {
  const toggle = (label: string) =>
    onChange(selected.includes(label) ? selected.filter((l) => l !== label) : [...selected, label]);

  return (
    <>
      <div className="flex flex-col gap-3.5">
        {options.map((o) => {
          const on = selected.includes(o.label);
          return (
            <button
              key={o.label}
              type="button"
              role="checkbox"
              aria-checked={on}
              onClick={() => toggle(o.label)}
              className={cn(
                "flex min-h-[70px] items-center gap-4 rounded-lg border-[1.5px] px-[22px] text-left text-[18px] font-bold transition-[transform,border-color,background,box-shadow,color] duration-150",
                on
                  ? "border-green-600 bg-green-600 text-white [box-shadow:0_4px_0_#0a3a2a,var(--shadow-pop)]"
                  : "border-line bg-white text-ink shadow-3d hover:-translate-y-0.5 hover:border-green-600 hover:shadow-pop",
              )}
            >
              <span
                className={cn(
                  "flex size-11 shrink-0 items-center justify-center rounded-[10px] transition-colors duration-150",
                  on ? "bg-white/[0.18] text-white" : "bg-spring-soft text-green-600",
                )}
              >
                <StepIcon icon={o.icon} badge={o.badge} />
              </span>
              {o.label}
              <span
                className={cn(
                  "ml-auto flex size-6 shrink-0 items-center justify-center rounded-md border-[1.5px]",
                  on ? "border-white bg-white/20" : "border-line",
                )}
                aria-hidden
              >
                {on && "✓"}
              </span>
            </button>
          );
        })}
      </div>

      {sub && <div className="mt-7 text-[16px] text-muted">{sub}</div>}

      <button
        type="button"
        onClick={onNext}
        disabled={selected.length === 0}
        aria-disabled={selected.length === 0}
        className={cn(
          "mt-7 h-[66px] w-full rounded-lg text-[18px] font-bold text-white transition-[transform,background,box-shadow] duration-150",
          selected.length > 0
            ? "bg-green-600 [box-shadow:0_3px_0_#0a3a2a,var(--shadow-3d)] hover:-translate-y-0.5 hover:bg-green-700 hover:[box-shadow:0_5px_0_#0a3a2a,var(--shadow-pop)] active:translate-y-px"
            : "cursor-default bg-[#cfd6cd]",
        )}
      >
        Continue
      </button>
    </>
  );
}
```

- [ ] **Step 2: Create `CurrencyStep.tsx`**

```tsx
"use client";

import { useId } from "react";
import { cn } from "@/lib/cn";
import { formatCurrency, parseCurrency } from "@/lib/applyFields";

/** Currency ($) input. Stores number | null. `optional` shows a Skip link. */
export function CurrencyStep({
  field,
  placeholder,
  optional,
  value,
  onChange,
  onNext,
  onSkip,
}: {
  field: string;
  placeholder?: string;
  optional?: boolean;
  value: number | null;
  onChange: (n: number | null) => void;
  onNext: () => void;
  onSkip: () => void;
}) {
  const id = useId();
  const display = formatCurrency(value);

  return (
    <>
      <div className="relative mb-3.5 text-left">
        <label htmlFor={id} className="sr-only">{field}</label>
        <span className="pointer-events-none absolute left-[18px] top-1/2 -translate-y-1/2 text-[18px] font-semibold text-muted">$</span>
        <input
          id={id}
          autoFocus
          inputMode="numeric"
          value={display}
          placeholder={placeholder}
          onChange={(e) => onChange(parseCurrency(e.target.value))}
          onKeyDown={(e) => { if (e.key === "Enter") onNext(); }}
          className="h-[68px] w-full rounded-lg border-[1.5px] border-line bg-white pl-[34px] pr-[18px] text-[18px] font-semibold text-ink shadow-3d outline-none transition-colors duration-150 placeholder:font-medium placeholder:text-[#9aa39c] focus:border-2 focus:border-green-600"
        />
      </div>

      <button
        type="button"
        onClick={onNext}
        disabled={value == null}
        aria-disabled={value == null}
        className={cn(
          "mt-2 h-[66px] w-full rounded-lg text-[18px] font-bold text-white transition-[transform,background,box-shadow] duration-150",
          value != null
            ? "bg-green-600 [box-shadow:0_3px_0_#0a3a2a,var(--shadow-3d)] hover:-translate-y-0.5 hover:bg-green-700 hover:[box-shadow:0_5px_0_#0a3a2a,var(--shadow-pop)] active:translate-y-px"
            : "cursor-default bg-[#cfd6cd]",
        )}
      >
        Next
      </button>

      {optional && (
        <button
          type="button"
          onClick={onSkip}
          className="mt-3.5 inline-block text-[15px] font-bold text-green-600 hover:underline"
        >
          Skip this for now
        </button>
      )}
    </>
  );
}
```

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean (renderers not yet wired into the Wizard switch — Task 10).

- [ ] **Step 4: Commit**

```bash
git add src/components/apply/steps/MultiStep.tsx src/components/apply/steps/CurrencyStep.tsx
git commit -m "feat(apply): multi-select + currency step renderers"
```

---

### Task 6: AddressProvider interface + Google Places impl + routes (TDD)

**Files:**
- Create: `src/server/integrations/address/types.ts`, `googlePlaces.ts`, `index.ts`, `googlePlaces.test.ts`
- Create: `src/app/api/v1/address/suggest/route.ts`, `src/app/api/v1/address/details/route.ts`
- Modify: `src/lib/env.ts`

- [ ] **Step 1: Add the env var**

In `src/lib/env.ts`, add inside the server env object (near the other optional integration keys):

```ts
  // Google Places (New) server key — optional. When absent, the address step
  // degrades to a validated free-text field. Restrict the key to the Places
  // API in Google Cloud.
  GOOGLE_PLACES_API_KEY: z.string().min(1).optional(),
```

- [ ] **Step 2: Create the interface `types.ts`**

```ts
import type { StructuredAddress } from "@/lib/leads";

export type AddressSuggestion = {
  /** Provider place id (opaque). */
  id: string;
  /** Human-readable single-line suggestion. */
  label: string;
};

/** Swappable address-autocomplete provider (Google now; Mapbox later). */
export interface AddressProvider {
  suggest(query: string, sessionToken?: string): Promise<AddressSuggestion[]>;
  details(id: string, sessionToken?: string): Promise<StructuredAddress | null>;
}

export type { StructuredAddress };
```

- [ ] **Step 3: Write the failing test `googlePlaces.test.ts`**

```ts
import { describe, expect, it, vi, afterEach } from "vitest";
import { GooglePlacesProvider } from "./googlePlaces";

const KEY = "test-key";

afterEach(() => vi.restoreAllMocks());

describe("GooglePlacesProvider.suggest", () => {
  it("maps placePrediction suggestions", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        suggestions: [
          { placePrediction: { placeId: "p1", text: { text: "9035 Wadsworth Pkwy, Broomfield, CO" } } },
        ],
      }), { status: 200 }),
    );
    const p = new GooglePlacesProvider(KEY);
    expect(await p.suggest("9035 Wads")).toEqual([{ id: "p1", label: "9035 Wadsworth Pkwy, Broomfield, CO" }]);
  });
  it("returns [] on a non-ok response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 500 }));
    const p = new GooglePlacesProvider(KEY);
    expect(await p.suggest("x")).toEqual([]);
  });
});

describe("GooglePlacesProvider.details", () => {
  it("maps addressComponents to StructuredAddress", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        id: "p1",
        addressComponents: [
          { types: ["street_number"], longText: "9035", shortText: "9035" },
          { types: ["route"], longText: "Wadsworth Parkway", shortText: "Wadsworth Pkwy" },
          { types: ["locality"], longText: "Broomfield", shortText: "Broomfield" },
          { types: ["administrative_area_level_1"], longText: "Colorado", shortText: "CO" },
          { types: ["postal_code"], longText: "80021", shortText: "80021" },
        ],
      }), { status: 200 }),
    );
    const p = new GooglePlacesProvider(KEY);
    expect(await p.details("p1")).toEqual({
      line1: "9035 Wadsworth Parkway",
      city: "Broomfield",
      state: "CO",
      zip: "80021",
      placeId: "p1",
    });
  });
});
```

- [ ] **Step 4: Run to verify fail**

Run: `npx vitest run src/server/integrations/address/googlePlaces.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 5: Implement `googlePlaces.ts`**

```ts
import type { StructuredAddress } from "@/lib/leads";
import type { AddressProvider, AddressSuggestion } from "./types";

const AUTOCOMPLETE_URL = "https://places.googleapis.com/v1/places:autocomplete";
const DETAILS_BASE = "https://places.googleapis.com/v1/places/";

type Component = { types: string[]; longText?: string; shortText?: string };

function pick(components: Component[], type: string, prefer: "long" | "short" = "long"): string {
  const c = components.find((x) => x.types.includes(type));
  if (!c) return "";
  return (prefer === "short" ? c.shortText : c.longText) ?? c.longText ?? c.shortText ?? "";
}

/** Google Places API (New) provider. US-biased; address-typed predictions. */
export class GooglePlacesProvider implements AddressProvider {
  constructor(private readonly apiKey: string) {}

  async suggest(query: string, sessionToken?: string): Promise<AddressSuggestion[]> {
    if (query.trim().length < 3) return [];
    try {
      const res = await fetch(AUTOCOMPLETE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": this.apiKey },
        body: JSON.stringify({
          input: query,
          includedRegionCodes: ["us"],
          includedPrimaryTypes: ["street_address", "premise", "subpremise"],
          ...(sessionToken ? { sessionToken } : {}),
        }),
      });
      if (!res.ok) return [];
      const data = (await res.json()) as {
        suggestions?: { placePrediction?: { placeId: string; text?: { text?: string } } }[];
      };
      return (data.suggestions ?? [])
        .map((s) => s.placePrediction)
        .filter((p): p is { placeId: string; text?: { text?: string } } => Boolean(p?.placeId))
        .map((p) => ({ id: p.placeId, label: p.text?.text ?? "" }));
    } catch {
      return [];
    }
  }

  async details(id: string, sessionToken?: string): Promise<StructuredAddress | null> {
    try {
      const url = new URL(DETAILS_BASE + encodeURIComponent(id));
      if (sessionToken) url.searchParams.set("sessionToken", sessionToken);
      const res = await fetch(url, {
        headers: {
          "X-Goog-Api-Key": this.apiKey,
          "X-Goog-FieldMask": "id,addressComponents",
        },
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { id?: string; addressComponents?: Component[] };
      const c = data.addressComponents ?? [];
      const num = pick(c, "street_number");
      const route = pick(c, "route");
      return {
        line1: [num, route].filter(Boolean).join(" "),
        city: pick(c, "locality") || pick(c, "sublocality") || pick(c, "postal_town"),
        state: pick(c, "administrative_area_level_1", "short"),
        zip: pick(c, "postal_code"),
        placeId: data.id ?? id,
      };
    } catch {
      return null;
    }
  }
}
```

- [ ] **Step 6: Implement `index.ts` (selector)**

```ts
import { serverEnv } from "@/lib/env";
import type { AddressProvider } from "./types";
import { GooglePlacesProvider } from "./googlePlaces";

/** The configured address provider, or null when no key is set (→ text field). */
export function getAddressProvider(): AddressProvider | null {
  const key = serverEnv.GOOGLE_PLACES_API_KEY;
  return key ? new GooglePlacesProvider(key) : null;
}
```

(Confirm the env accessor name — `serverEnv` per `src/lib/env.ts`; adjust import if the module exports a different symbol.)

- [ ] **Step 7: Run to verify pass**

Run: `npx vitest run src/server/integrations/address/googlePlaces.test.ts`
Expected: PASS

- [ ] **Step 8: Create the two routes**

`src/app/api/v1/address/suggest/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getAddressProvider } from "@/server/integrations/address";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const token = url.searchParams.get("t") ?? undefined;
  const provider = getAddressProvider();
  if (!provider) return NextResponse.json({ configured: false, suggestions: [] });
  const suggestions = await provider.suggest(q, token);
  return NextResponse.json({ configured: true, suggestions });
}
```

`src/app/api/v1/address/details/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getAddressProvider } from "@/server/integrations/address";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id") ?? "";
  const token = url.searchParams.get("t") ?? undefined;
  const provider = getAddressProvider();
  if (!provider || !id) return NextResponse.json({ configured: Boolean(provider), address: null });
  const address = await provider.details(id, token);
  return NextResponse.json({ configured: true, address });
}
```

- [ ] **Step 9: Verify + commit**

Run: `npx tsc --noEmit && npm run lint && npx vitest run src/server/integrations/address/`
Expected: clean / PASS

```bash
git add src/lib/env.ts src/server/integrations/address/ src/app/api/v1/address/
git commit -m "feat(apply): server-side Google Places address provider + proxy routes"
```

---

### Task 7: AddressStep (autocomplete + Apt/Unit + ZIP, text fallback)

**Files:**
- Create: `src/components/apply/steps/AddressStep.tsx`

- [ ] **Step 1: Create `AddressStep.tsx`**

```tsx
"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { StructuredAddress } from "@/lib/leads";
import type { AddressSuggestion } from "@/server/integrations/address/types";

/**
 * Property-address step. Queries our /api/v1/address/suggest proxy (Google
 * Places behind the scenes); selecting a suggestion fetches /details and fills
 * a StructuredAddress. Apt/Unit and ZIP are editable secondary fields. If the
 * proxy reports `configured:false` (no key), it silently becomes a validated
 * free-text street field — the funnel never breaks.
 */
export function AddressStep({
  value,
  onChange,
  onNext,
}: {
  value: StructuredAddress | null;
  onChange: (a: StructuredAddress | null) => void;
  onNext: () => void;
}) {
  const id = useId();
  const [query, setQuery] = useState(value?.line1 ?? "");
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [configured, setConfigured] = useState(true);
  const tokenRef = useRef<string>(Math.random().toString(36).slice(2));
  const line2 = value?.line2 ?? "";
  const zip = value?.zip ?? "";

  // Debounced autocomplete.
  useEffect(() => {
    if (query.trim().length < 3) { setSuggestions([]); return; }
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/v1/address/suggest?q=${encodeURIComponent(query)}&t=${tokenRef.current}`);
        const data = await res.json();
        setConfigured(data.configured !== false);
        setSuggestions(data.suggestions ?? []);
        setOpen(true);
      } catch { /* keep typing; fallback handles it */ }
    }, 220);
    return () => clearTimeout(handle);
  }, [query]);

  const choose = async (s: AddressSuggestion) => {
    setOpen(false);
    setQuery(s.label);
    try {
      const res = await fetch(`/api/v1/address/details?id=${encodeURIComponent(s.id)}&t=${tokenRef.current}`);
      const data = await res.json();
      if (data.address) onChange({ ...data.address, line2, zip: data.address.zip || zip });
    } catch { /* leave as typed */ }
    tokenRef.current = Math.random().toString(36).slice(2); // new session token
  };

  // Free-text fallback / manual edits: keep line1 in sync from the query.
  const syncManual = (next: Partial<StructuredAddress>) =>
    onChange({
      line1: next.line1 ?? value?.line1 ?? query,
      line2: next.line2 ?? line2,
      city: next.city ?? value?.city ?? "",
      state: next.state ?? value?.state ?? "",
      zip: next.zip ?? zip,
      placeId: value?.placeId,
    });

  const ready = Boolean((value?.line1 ?? query).trim() && (value?.zip ?? zip).trim());

  return (
    <>
      <a href="#" onClick={(e) => e.preventDefault()} className="mb-3 inline-block text-[15px] font-bold text-green-600 underline">
        Why do we need this?
      </a>

      <div className="relative mb-3.5 text-left">
        <label htmlFor={id} className="pointer-events-none absolute left-[18px] top-3 z-10 text-[12.5px] font-semibold text-muted">
          Address
        </label>
        <input
          id={id}
          autoFocus
          autoComplete="off"
          value={query}
          onChange={(e) => { setQuery(e.target.value); syncManual({ line1: e.target.value }); }}
          onKeyDown={(e) => { if (e.key === "Enter" && ready) onNext(); }}
          className="h-[68px] w-full rounded-lg border-[1.5px] border-line bg-white px-[18px] pb-2 pt-[22px] text-[18px] font-semibold text-ink shadow-3d outline-none transition-colors duration-150 placeholder:font-medium placeholder:text-[#9aa39c] focus:border-2 focus:border-green-600"
        />
        {open && configured && suggestions.length > 0 && (
          <ul className="absolute left-0 right-0 top-[72px] z-20 overflow-hidden rounded-lg border border-line bg-white shadow-pop">
            {suggestions.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => choose(s)}
                  className="block w-full px-[18px] py-3 text-left text-[15px] text-ink hover:bg-paper-2"
                >
                  {s.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mb-3.5 grid grid-cols-2 gap-3.5">
        <input
          aria-label="Apt / Unit (optional)"
          placeholder="Apt / Unit"
          value={line2}
          onChange={(e) => syncManual({ line2: e.target.value })}
          className="h-[60px] w-full rounded-lg border-[1.5px] border-line bg-white px-[18px] text-[16px] font-semibold text-ink shadow-3d outline-none focus:border-2 focus:border-green-600"
        />
        <input
          aria-label="ZIP code"
          inputMode="numeric"
          placeholder="ZIP code"
          value={zip}
          onChange={(e) => syncManual({ zip: e.target.value.replace(/[^0-9]/g, "").slice(0, 5) })}
          className="h-[60px] w-full rounded-lg border-[1.5px] border-line bg-white px-[18px] text-[16px] font-semibold text-ink shadow-3d outline-none focus:border-2 focus:border-green-600"
        />
      </div>

      <button
        type="button"
        onClick={onNext}
        disabled={!ready}
        aria-disabled={!ready}
        className={
          ready
            ? "mt-2 h-[66px] w-full rounded-lg bg-green-600 text-[18px] font-bold text-white [box-shadow:0_3px_0_#0a3a2a,var(--shadow-3d)] transition-[transform,background,box-shadow] duration-150 hover:-translate-y-0.5 hover:bg-green-700 hover:[box-shadow:0_5px_0_#0a3a2a,var(--shadow-pop)] active:translate-y-px"
            : "mt-2 h-[66px] w-full cursor-default rounded-lg bg-[#cfd6cd] text-[18px] font-bold text-white"
        }
      >
        Next
      </button>
    </>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean (wired in Task 10).

- [ ] **Step 3: Commit**

```bash
git add src/components/apply/steps/AddressStep.tsx
git commit -m "feat(apply): address autocomplete step with text fallback"
```

---

### Task 8: ContactStep (two-pane) + FinishStep (two-door)

**Files:**
- Create: `src/components/apply/steps/ContactStep.tsx`, `src/components/apply/steps/FinishStep.tsx`

- [ ] **Step 1: Create `ContactStep.tsx` (name+email → phone+TCPA, personalized)**

```tsx
"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/cn";
import type { LeadContact } from "@/lib/leads";

/**
 * Contact captured in two panes for conversion (Better pattern): name+email,
 * then phone+TCPA personalized "Hi {firstName}!". `onDone` fires with the full
 * contact when the phone pane is submitted — that is when the lead fires.
 */
export function ContactStep({
  q,
  onDone,
  consentTcpa,
}: {
  q: string;
  onDone: (contact: LeadContact) => void;
  consentTcpa: string;
}) {
  const baseId = useId();
  const [pane, setPane] = useState<0 | 1>(0);
  const [f, setF] = useState<LeadContact>({ firstName: "", lastName: "", email: "", phone: "" });

  const pane0ok = Boolean(f.firstName.trim() && f.lastName.trim() && f.email.trim());
  const pane1ok = Boolean(f.phone.trim());

  const field = (key: keyof LeadContact, label: string, type: string, autoComplete: string, inputMode?: "email" | "tel") => {
    const id = `${baseId}-${key}`;
    return (
      <div className="relative mb-3.5 text-left">
        <label htmlFor={id} className="sr-only">{label}</label>
        <input
          id={id}
          type={type}
          autoComplete={autoComplete}
          inputMode={inputMode}
          placeholder={label}
          value={f[key]}
          autoFocus={key === "firstName" || key === "phone"}
          onChange={(e) => setF((s) => ({ ...s, [key]: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            if (pane === 0 && pane0ok) setPane(1);
            else if (pane === 1 && pane1ok) onDone(f);
          }}
          className="h-[68px] w-full rounded-lg border-[1.5px] border-line bg-white px-[18px] text-[18px] font-semibold text-ink shadow-3d outline-none transition-colors duration-150 placeholder:font-medium placeholder:text-[#9aa39c] focus:border-2 focus:border-green-600"
        />
      </div>
    );
  };

  const cta = (label: string, ok: boolean, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      disabled={!ok}
      aria-disabled={!ok}
      className={cn(
        "mt-2 h-[66px] w-full rounded-lg text-[18px] font-bold text-white transition-[transform,background,box-shadow] duration-150",
        ok
          ? "bg-green-600 [box-shadow:0_3px_0_#0a3a2a,var(--shadow-3d)] hover:-translate-y-0.5 hover:bg-green-700 hover:[box-shadow:0_5px_0_#0a3a2a,var(--shadow-pop)] active:translate-y-px"
          : "cursor-default bg-[#cfd6cd]",
      )}
    >
      {label}
    </button>
  );

  if (pane === 0) {
    return (
      <>
        {field("firstName", "First name", "text", "given-name")}
        {field("lastName", "Last name", "text", "family-name")}
        {field("email", "Email", "email", "email", "email")}
        {cta("Next", pane0ok, () => pane0ok && setPane(1))}
      </>
    );
  }

  return (
    <>
      {/* The h1 is rendered by the Wizard; this pane adds the personalized line. */}
      <p className="-mt-1 mb-6 text-[18px] font-bold text-ink">Hi {f.firstName}! What&apos;s your phone number?</p>
      {field("phone", "Phone number", "tel", "tel", "tel")}
      {cta("Next", pane1ok, () => pane1ok && onDone(f))}
      <p className="mt-[18px] text-left text-xs leading-relaxed text-muted">{consentTcpa}</p>
    </>
  );
}
```

- [ ] **Step 2: Create `FinishStep.tsx` (two doors)**

This evolves `AccountStep`'s signed-in detection + LOS hand-off and adds the "Talk to a loan officer" door (GHL booking). Reuse `useAuth`, `APP_URL`, and the same hand-off POST.

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, CalendarDays, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth/useAuth";
import { APP_URL } from "@/lib/auth/appLink";
import type { Intent } from "@/content/flows";
import type { AnswerValue, LeadContact } from "@/lib/leads";

/**
 * Two-door finish: "Continue in the app" (signed-in → prefilled LOS hand-off +
 * deep link; signed-out → sign in / continue) and "Talk to a loan officer"
 * (GHL calendar). Account recognition happens here, never mid-funnel.
 */
export function FinishStep({
  intent,
  contact,
  fields,
  location,
  leadId,
  shortName,
  calendarHref,
}: {
  intent: Intent;
  contact: LeadContact | null;
  fields: Record<string, AnswerValue>;
  location?: string;
  leadId: string | null;
  shortName: string;
  /** GHL booking URL (empty string when unconfigured → falls back to /loan-officers). */
  calendarHref: string;
}) {
  const auth = useAuth();
  const fired = useRef(false);
  const [handoff, setHandoff] = useState<"idle" | "sending" | "done">("idle");

  // Best-effort prefilled hand-off once, when signed in (mirrors AccountStep).
  useEffect(() => {
    if (fired.current || auth.loading || !auth.configured || !auth.authenticated || !contact) return;
    fired.current = true;
    setHandoff("sending");
    const controller = new AbortController();
    fetch("/api/v1/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
      body: JSON.stringify({ intent, contact, answers: fields, location, leadId: leadId ?? undefined }),
    }).catch(() => {}).finally(() => setHandoff("done"));
    return () => controller.abort();
  }, [auth.loading, auth.configured, auth.authenticated, contact, intent, fields, location, leadId]);

  const continueHref =
    auth.configured && !auth.authenticated
      ? `/auth/login?returnTo=${encodeURIComponent(`/apply/${intent}`)}`
      : APP_URL;
  const continueLabel =
    auth.configured && !auth.authenticated ? "Sign in & continue your application" : `Continue in the ${shortName} app`;
  const bookHref = calendarHref || "/loan-officers";

  if (auth.loading) {
    return (
      <div className="flex min-h-[160px] items-center justify-center text-muted" role="status" aria-live="polite">
        <Loader2 className="size-6 animate-spin" aria-hidden /><span className="sr-only">Loading…</span>
      </div>
    );
  }

  return (
    <>
      {auth.authenticated && auth.user?.email && (
        <p className="-mt-1 mb-6 text-[16px] text-muted">
          Welcome back, <span className="font-semibold text-ink">{auth.user.email}</span> — pick up right where you left off.
        </p>
      )}

      <a
        href={continueHref}
        className="flex h-[66px] w-full items-center justify-center gap-2.5 rounded-lg bg-green-600 text-[18px] font-bold text-white [box-shadow:0_3px_0_#0a3a2a,var(--shadow-3d)] transition-[transform,background,box-shadow] duration-150 hover:-translate-y-0.5 hover:bg-green-700 hover:[box-shadow:0_5px_0_#0a3a2a,var(--shadow-pop)] active:translate-y-px"
      >
        {continueLabel}
        <ArrowRight className="size-5" strokeWidth={2.2} aria-hidden />
      </a>

      <div className="my-[18px] flex items-center gap-3.5 text-[13px] text-muted before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">
        or
      </div>

      <a
        href={bookHref}
        className="flex h-16 w-full items-center justify-center gap-2.5 rounded-lg border-[1.5px] border-line bg-white text-[16px] font-bold text-ink shadow-3d transition-colors duration-150 hover:bg-paper-2"
      >
        <CalendarDays className="size-5 text-green-600" strokeWidth={2} aria-hidden />
        Talk to a loan officer
      </a>

      <div className="mt-4 min-h-[18px] text-[13px] text-muted" aria-live="polite">
        {handoff === "sending" && "Saving your application…"}
      </div>
    </>
  );
}
```

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean (wired in Task 10).

- [ ] **Step 4: Commit**

```bash
git add src/components/apply/steps/ContactStep.tsx src/components/apply/steps/FinishStep.tsx
git commit -m "feat(apply): split contact pane + two-door finish step"
```

---

### Task 9: Wire it all into the Wizard (deepened refi goes live)

**Files:**
- Modify: `src/components/apply/Wizard.tsx`
- Modify: `src/app/apply/[intent]/page.tsx` (pass `calendarHref`)

- [ ] **Step 1: Pass the GHL calendar href from the page**

In `src/app/apply/[intent]/page.tsx`, read the calendar config and pass it. The tenant config exposes GHL calendar settings via env/`NEXT_PUBLIC_GHL_CALENDAR_*`; pass an empty string when unset. Add prop:

```tsx
      calendarHref={process.env.NEXT_PUBLIC_GHL_CALENDAR_BASE && process.env.NEXT_PUBLIC_GHL_CALENDAR_ID
        ? `${process.env.NEXT_PUBLIC_GHL_CALENDAR_BASE}/${process.env.NEXT_PUBLIC_GHL_CALENDAR_ID}`
        : ""}
```

(If the repo already centralizes this in a helper, use it instead — grep `NEXT_PUBLIC_GHL_CALENDAR` to confirm the exact composition the existing `GhlCalendar` uses, and mirror it.)

- [ ] **Step 2: Rewrite `Wizard.tsx` to widen answers, track direction, render new types, and build named fields**

Key changes (full file):

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Phone } from "lucide-react";
import { Mark } from "@/components/ui/Mark";
import { FLOW, type Intent } from "@/content/flows";
import { submitLead, type LeadContact, type AnswerValue, type StructuredAddress } from "@/lib/leads";
import { buildLeadFields } from "@/lib/applyFields";
import { DeckStage } from "./DeckStage";
import { ChoiceStep, type TestimonialDisplay } from "./steps/ChoiceStep";
import { BinaryStep } from "./steps/BinaryStep";
import { PlaceStep } from "./steps/PlaceStep";
import { ContactStep } from "./steps/ContactStep";
import { FinishStep } from "./steps/FinishStep";
import { MultiStep } from "./steps/MultiStep";
import { CurrencyStep } from "./steps/CurrencyStep";
import { AddressStep } from "./steps/AddressStep";

const AUTO_ADVANCE_MS = 260;

export function Wizard({
  intent,
  phoneHref,
  phoneDisplay,
  consentTcpa,
  assistantName,
  shortName,
  testimonial,
  calendarHref,
}: {
  intent: Intent;
  phoneHref: string;
  phoneDisplay: string;
  consentTcpa: string;
  assistantName: string;
  shortName: string;
  testimonial?: TestimonialDisplay;
  calendarHref: string;
}) {
  const router = useRouter();
  const steps = FLOW[intent];

  const [idx, setIdx] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const [answers, setAnswers] = useState<Record<number, AnswerValue>>({});
  const [contact, setContact] = useState<LeadContact | null>(null);
  const [leadId, setLeadId] = useState<string | null>(null);

  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (advanceTimer.current) clearTimeout(advanceTimer.current); }, []);

  const step = steps[idx];
  const total = steps.length;
  const pct = Math.round(((idx + 1) / (total + 1)) * 100);

  const next = useCallback(() => { setDir(1); setIdx((i) => Math.min(total - 1, i + 1)); }, [total]);
  const back = useCallback(() => {
    if (idx === 0) { router.push("/"); return; }
    setDir(-1);
    setIdx((i) => i - 1);
  }, [idx, router]);

  const pickAuto = useCallback((value: AnswerValue) => {
    setAnswers((a) => ({ ...a, [idx]: value }));
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    advanceTimer.current = setTimeout(next, AUTO_ADVANCE_MS);
  }, [idx, next]);

  const setAnswer = useCallback((value: AnswerValue) => setAnswers((a) => ({ ...a, [idx]: value })), [idx]);

  const onContactDone = useCallback((formContact: LeadContact) => {
    const placeIdx = steps.findIndex((s) => s.type === "place" || s.type === "address");
    const placeAns = placeIdx >= 0 ? answers[placeIdx] : undefined;
    const location =
      typeof placeAns === "string" ? placeAns
      : placeAns && typeof placeAns === "object" && "line1" in placeAns
        ? [(placeAns as StructuredAddress).line1, (placeAns as StructuredAddress).city, (placeAns as StructuredAddress).state, (placeAns as StructuredAddress).zip].filter(Boolean).join(", ")
        : undefined;
    setContact(formContact);
    const fields = buildLeadFields(steps, answers);
    void submitLead({ intent, contact: formContact, answers, fields, location }).then((res) => {
      if (res.leadId) setLeadId(res.leadId);
    });
    next();
  }, [answers, intent, next, steps]);

  const fields = buildLeadFields(steps, answers);
  const placeIdx = steps.findIndex((s) => s.type === "place" || s.type === "address");
  const placeAns = placeIdx >= 0 ? answers[placeIdx] : undefined;
  const location =
    typeof placeAns === "string" ? placeAns
    : placeAns && typeof placeAns === "object" && "line1" in placeAns
      ? [(placeAns as StructuredAddress).line1, (placeAns as StructuredAddress).city, (placeAns as StructuredAddress).state, (placeAns as StructuredAddress).zip].filter(Boolean).join(", ")
      : undefined;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 bg-paper">
        <div className="wrap">
          <div className="flex h-[70px] items-center gap-4">
            <button type="button" onClick={back} aria-label="Back" className="flex size-11 items-center justify-center rounded-full border border-line bg-white text-ink transition-colors duration-150 hover:bg-paper-2">
              <ChevronLeft className="size-5" strokeWidth={1.8} />
            </button>
            <a href={phoneHref} className="ml-auto flex items-center gap-2.5 text-[16px] font-bold text-ink">
              <span className="flex size-9 items-center justify-center rounded-full bg-spring-soft text-green-600">
                <Phone className="size-[18px]" strokeWidth={1.8} />
              </span>
              Call anytime {phoneDisplay}
            </a>
          </div>
          <div className="h-1 overflow-hidden rounded-[4px] bg-line" role="progressbar" aria-label="Application progress" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-[4px] bg-green-600 transition-[width] duration-[400ms] ease-[cubic-bezier(0.4,0,0.2,1)]" style={{ width: `${pct}%` }} />
          </div>
          <div className="pt-2 text-[13px] font-semibold text-muted">{pct}%</div>
        </div>
      </header>

      <div className="flex flex-1 items-start justify-center px-5 pb-[120px] pt-[7vh]">
        <DeckStage stepKey={idx} direction={dir}>
          <div className="w-full max-w-[560px] text-center">
            <h1 className="mb-2 text-pretty text-[clamp(30px,4.4vw,46px)] font-extrabold leading-[1.06] tracking-[-0.03em] [text-wrap:balance]">
              {step.q}
            </h1>

            {step.type === "choice" && (
              <ChoiceStep options={step.opts} sub={step.sub} review={step.review} testimonial={testimonial} selected={typeof answers[idx] === "string" ? (answers[idx] as string) : undefined} onPick={pickAuto} />
            )}
            {step.type === "multi" && (
              <MultiStep options={step.opts} sub={step.sub} selected={Array.isArray(answers[idx]) ? (answers[idx] as string[]) : []} onChange={setAnswer} onNext={next} />
            )}
            {step.type === "binary" && (
              <BinaryStep help={step.help} usatoday={step.usatoday} selected={typeof answers[idx] === "string" ? (answers[idx] as string) : undefined} onPick={pickAuto} />
            )}
            {step.type === "place" && (
              <PlaceStep fieldLabel={step.fieldLabel} placeholder={step.placeholder} value={typeof answers[idx] === "string" ? (answers[idx] as string) : ""} onChange={setAnswer} onNext={next} />
            )}
            {step.type === "address" && (
              <AddressStep value={(answers[idx] as StructuredAddress) ?? null} onChange={setAnswer} onNext={next} />
            )}
            {step.type === "currency" && (
              <CurrencyStep field={step.field} placeholder={step.placeholder} optional={step.optional} value={typeof answers[idx] === "number" ? (answers[idx] as number) : null} onChange={setAnswer} onNext={next} onSkip={() => { setAnswer(null); next(); }} />
            )}
            {step.type === "form" && (
              <ContactStep q={step.q} onDone={onContactDone} consentTcpa={consentTcpa} />
            )}
            {step.type === "finish" && (
              <FinishStep intent={intent} contact={contact} fields={fields} location={location} leadId={leadId} shortName={shortName} calendarHref={calendarHref} />
            )}
            {step.type === "account" && (
              <FinishStep intent={intent} contact={contact} fields={fields} location={location} leadId={leadId} shortName={shortName} calendarHref={calendarHref} />
            )}
          </div>
        </DeckStage>
      </div>

      <button type="button" aria-label={`Ask ${assistantName}`} className="fixed bottom-6 right-6 z-40 flex h-14 items-center gap-2.5 rounded-full bg-green-800 py-0 pl-2.5 pr-5 text-[15px] font-bold text-white shadow-pop transition-transform duration-150 hover:-translate-y-0.5">
        <Mark size={36} label={shortName} /> Ask AI
      </button>
    </div>
  );
}
```

(Note: the old `FormStep` and `AccountStep` files are now unused by refi; `buy`/`cash` still reference `form`/`account` types → both now route to `ContactStep`/`FinishStep`. Delete `FormStep.tsx` and `AccountStep.tsx` only after confirming no other importers: `grep -rn "FormStep\|AccountStep" src/`. If clean, remove them in this commit.)

- [ ] **Step 3: Full gate**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: all clean / pass

- [ ] **Step 4: Commit**

```bash
git add src/components/apply src/app/apply
git commit -m "feat(apply): deepened refi funnel live — new steps, deck motion, named-field hand-off"
```

---

### Task 10: Browser verification + deploy

**Files:** none (verify; fix-forward; deploy)

Use `preview_start` (msfg-web, port 3000). After each full load, wait for hydration before interacting.

- [ ] **Step 1: Resting → refi entry.** Load `/`, toggle AI mode off, click the "Refinance" intent tab → lands on `/apply/refi`. (Or load `/apply/refi` directly.)
- [ ] **Step 2: Goals multi-select.** Select two goals; the others stay selectable; Continue is disabled until ≥1 chosen; advancing animates with the deck spring (the previous card peeks/recedes).
- [ ] **Step 3: Address.** Type a partial street address → suggestions dropdown (if `GOOGLE_PLACES_API_KEY` set on the box) → choose → line1/ZIP fill; Apt/Unit editable. With no key, confirm it degrades to a typeable street + ZIP field and Next still works.
- [ ] **Step 4: Property use / type.** Both auto-advance on pick (deck motion forward).
- [ ] **Step 5: Value / balance / credit band.** Currency masks group thousands; Next disabled until a value; credit band auto-advances.
- [ ] **Step 6: Optional income.** "Skip this for now" advances with no value; typing a value also advances.
- [ ] **Step 7: Contact split.** Pane 1 (name+email) → Next → pane 2 shows "Hi {firstName}! What's your phone number?" + TCPA; submitting fires the lead (check `preview_network` for `POST /api/v1/leads` → 200 with `leadId`).
- [ ] **Step 8: Finish two doors.** "Continue in the app" (label reflects signed-in vs signed-out) and "Talk to a loan officer" (→ GHL booking or `/loan-officers` fallback) both render and link correctly.
- [ ] **Step 9: Back navigation.** Back at each step animates in reverse (deck-enter-back) and restores the prior answer.
- [ ] **Step 10: Reduced motion + mobile.** Emulate reduced motion → transitions are instant swaps. At 375px the steps, dropdown, and currency fields lay out cleanly.
- [ ] **Step 11: Console clean; capture proof screenshots (desktop + mobile).**
- [ ] **Step 12: Deploy**

```bash
git add -A && git commit -m "fix(apply): polish from refi funnel browser verification" || echo "no fixes needed"
bash scripts/deploy-ec2.sh https://staging.msfg.us staging
```

(Then optionally provision `GOOGLE_PLACES_API_KEY` on the box `~/apps/msfg.us/.env` + `pm2 restart msfg-web --update-env` to light up real autocomplete; the funnel works without it.)

---

## Self-review (done at plan time)

- **Spec coverage:** goals multi-select ✓ (T2/T5) · Google-Places address + Apt/Unit + ZIP + graceful text fallback ✓ (T6/T7) · property use/type ✓ (reused choice, T2) · value/balance ✓ (T5) · self-reported credit band, no pull ✓ (T2, choice) · optional income ✓ (T5) · split contact + "Hi {name}!" + TCPA + lead-fires-on-phone ✓ (T8/T9) · two-door finish, LOS prefill, GHL booking, signed-in recognition ✓ (T8) · returning flag (session/prior-lead/GHL precedence) ✓ (T3) · `buildLeadFields` no-migration normalizer ✓ (T1) · deck motion linear + reduced-motion ✓ (T4/T9) · generic for buy/cash ✓ (new types intent-agnostic; refi-only FLOW change) · tests ✓ (T1/T3/T6) · browser verification ✓ (T10).
- **Type consistency:** `AnswerValue`/`StructuredAddress` defined once (leads.ts), consumed everywhere; `buildLeadFields(steps, answers)` signature matches T1↔T9; step `field` keys added in T2 are read by `buildLeadFields`; `AddressProvider`/`AddressSuggestion` defined once (T6) and imported by AddressStep (T7); `FinishStep` prop list matches the Wizard call (T8↔T9); `PlaceStep` label prop renamed `field`→`fieldLabel` consistently (T2↔T9).
- **Placeholders:** none — every code step is complete. Two explicit "confirm against the repo" notes (getSession field names in T3; GHL calendar href composition in T9) are verification instructions, not missing code.
- **Sequencing:** every task leaves the app building (new renderers/types exist before `FLOW.refi` references them go live in T9; `tsc` gate first appears in T3 after T1+T2 land the types).
```
