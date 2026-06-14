# Purchase (Buy) Funnel Deepening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deepen the `buy` apply funnel to Better-grade parity, reusing the refi engine and adding only buy-specific content plus a `%` unit on the currency step.

**Architecture:** The engine (`multi`/`address`/`currency`/`finish` step types, `DeckStage`, `buildLeadFields`, `returning` flag, `ContactStep`, `FinishStep`, `AddressProvider`) is already on `main`. Extend the `currency` step with an optional `unit: "$" | "%"`, add a few option icons, and rewrite `FLOW.buy`. No DB migration; named answers ride `Lead.answers`.

**Tech Stack:** Next.js 16, React 19, TS strict, Tailwind v4, vitest (node env), lucide-react.

**Spec:** `docs/superpowers/specs/2026-06-13-buy-funnel-deepening-design.md`
**Branch:** `buy-funnel-deepening` (already created off `main`; the spec commit `dbba552` is on it).

**Conventions (every task):** no hardcoded hex beyond the established apply palette (`#0a3a2a`, `#cfd6cd`, `#9aa39c`); `@/*` → `src/*`. Run `npx tsc --noEmit && npm run lint` before each commit; end commit messages with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. `FLOW.refi` and `FLOW.cash` are NOT touched.

---

## File map

| File | Action | Responsibility |
| --- | --- | --- |
| `src/lib/applyFields.ts` | Modify | Add pure `parsePercent` (strip → clamp 0–100) |
| `src/lib/applyFields.test.ts` | Modify | Tests for `parsePercent` |
| `src/components/apply/steps/CurrencyStep.tsx` | Modify | `unit: "$" \| "%"` — `$` prefix / `%` suffix; `%` parses+clamps via `parsePercent` |
| `src/content/flows.ts` | Modify | `unit?` on the `currency` step; new `StepIconKey`s; rewritten `FLOW.buy` |
| `src/components/apply/steps/icons.tsx` | Modify | Map the new icon keys to lucide glyphs |
| `src/components/apply/Wizard.tsx` | Modify | Pass `unit={step.unit}` to `CurrencyStep` |

---

### Task 1: `%` unit on the currency step (TDD for the clamp)

**Files:**
- Modify: `src/lib/applyFields.ts`, `src/components/apply/steps/CurrencyStep.tsx`, `src/content/flows.ts`, `src/components/apply/Wizard.tsx`
- Test: `src/lib/applyFields.test.ts`

- [ ] **Step 1: Add the failing test** — append to `src/lib/applyFields.test.ts`:

```ts
import { parsePercent } from "./applyFields";

describe("parsePercent", () => {
  it("strips non-digits to a number", () => {
    expect(parsePercent("20%")).toBe(20);
    expect(parsePercent("5")).toBe(5);
  });
  it("clamps to 0–100", () => {
    expect(parsePercent("150")).toBe(100);
    expect(parsePercent("0")).toBe(0);
  });
  it("returns null for empty/garbage", () => {
    expect(parsePercent("")).toBeNull();
    expect(parsePercent("abc")).toBeNull();
  });
});
```

(Add the `parsePercent` name to the existing top `import { ... } from "./applyFields";` line rather than a second import if your linter prefers — either compiles.)

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run src/lib/applyFields.test.ts`
Expected: FAIL — `parsePercent is not a function` / not exported.

- [ ] **Step 3: Implement `parsePercent`** — add to `src/lib/applyFields.ts` (next to `parseCurrency`):

```ts
/** Parse a user-typed percentage to a 0–100 whole number, or null. */
export function parsePercent(input: string): number | null {
  const digits = input.replace(/[^0-9]/g, "");
  if (!digits) return null;
  return Math.min(100, Number(digits));
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/applyFields.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Add `unit?` to the `currency` step type** — in `src/content/flows.ts`, change the `CurrencyStep` type to:

```ts
/** Currency input. Stores number | null. `optional` adds a Skip control.
 *  `unit` selects the affix + parser: "$" (default, thousands-formatted) or
 *  "%" (0–100, trailing % suffix). */
type CurrencyStep = {
  type: "currency";
  q: string;
  field: string;
  placeholder?: string;
  optional?: boolean;
  help?: string;
  unit?: "$" | "%";
};
```

- [ ] **Step 6: Replace `CurrencyStep.tsx`** with the unit-aware version:

```tsx
"use client";

import { useId } from "react";
import { cn } from "@/lib/cn";
import { formatCurrency, parseCurrency, parsePercent } from "@/lib/applyFields";

/** Numeric input. `unit` "$" (default) → leading $, thousands-formatted; "%" →
 *  trailing %, 0–100. Stores number | null. `optional` shows a Skip link. */
export function CurrencyStep({
  field,
  placeholder,
  optional,
  unit = "$",
  value,
  onChange,
  onNext,
  onSkip,
}: {
  field: string;
  placeholder?: string;
  optional?: boolean;
  unit?: "$" | "%";
  value: number | null;
  onChange: (n: number | null) => void;
  onNext: () => void;
  onSkip: () => void;
}) {
  const id = useId();
  const isPct = unit === "%";
  const display = isPct ? (value == null ? "" : String(value)) : formatCurrency(value);
  const parse = isPct ? parsePercent : parseCurrency;

  return (
    <>
      <div className="relative mb-3.5 text-left">
        <label htmlFor={id} className="sr-only">{field}</label>
        {!isPct && (
          <span className="pointer-events-none absolute left-[18px] top-1/2 -translate-y-1/2 text-[18px] font-semibold text-muted">$</span>
        )}
        {isPct && (
          <span className="pointer-events-none absolute right-[18px] top-1/2 -translate-y-1/2 text-[18px] font-semibold text-muted">%</span>
        )}
        <input
          id={id}
          autoFocus
          inputMode="numeric"
          value={display}
          placeholder={placeholder}
          onChange={(e) => onChange(parse(e.target.value))}
          onKeyDown={(e) => { if (e.key === "Enter") onNext(); }}
          className={cn(
            "h-[68px] w-full rounded-lg border-[1.5px] border-line bg-white text-[18px] font-semibold text-ink shadow-3d outline-none transition-colors duration-150 placeholder:font-medium placeholder:text-[#9aa39c] focus:border-2 focus:border-green-600",
            isPct ? "pl-[18px] pr-[34px]" : "pl-[34px] pr-[18px]",
          )}
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

- [ ] **Step 7: Pass `unit` from the Wizard** — in `src/components/apply/Wizard.tsx`, find the `currency` render branch and add `unit={step.unit}`:

```tsx
            {step.type === "currency" && (
              <CurrencyStep field={step.field} placeholder={step.placeholder} optional={step.optional} unit={step.unit} value={typeof answers[idx] === "number" ? (answers[idx] as number) : null} onChange={setAnswer} onNext={next} onSkip={() => { setAnswer(null); next(); }} />
            )}
```

(Match the existing branch's exact formatting; only `unit={step.unit}` is added.)

- [ ] **Step 8: Gate + commit**

Run: `npx tsc --noEmit && npm run lint && npx vitest run src/lib/applyFields.test.ts`
Expected: clean / PASS.

```bash
git add src/lib/applyFields.ts src/lib/applyFields.test.ts src/components/apply/steps/CurrencyStep.tsx src/content/flows.ts src/components/apply/Wizard.tsx
git commit -m "feat(apply): currency step gains a %/\$ unit (parsePercent, clamped 0-100)"
```

---

### Task 2: Buy-specific option icons

**Files:**
- Modify: `src/content/flows.ts` (extend `StepIconKey`), `src/components/apply/steps/icons.tsx`

- [ ] **Step 1: Extend `StepIconKey`** — in `src/content/flows.ts`, change the union to add five keys:

```ts
export type StepIconKey =
  | "cal"
  | "help"
  | "mailbox"
  | "palm"
  | "invest"
  | "house"
  | "condo"
  | "coop"
  | "manuf"
  | "doc"
  | "offer"
  | "dooropen"
  | "search"
  | "units";
```

- [ ] **Step 2: Map them in `icons.tsx`** — update the lucide import and add switch cases. Change the import block to:

```ts
import {
  Building,
  Building2,
  Castle,
  DoorOpen,
  FileSignature,
  Handshake,
  HelpCircle,
  Home,
  Inbox,
  LineChart,
  Mailbox,
  Palmtree,
  Search,
  Warehouse,
} from "lucide-react";
```

Then add these cases to the `switch (icon)` (before `default`):

```ts
    case "doc":
      return <FileSignature className="size-6" strokeWidth={1.8} />;
    case "offer":
      return <Handshake className="size-6" strokeWidth={1.8} />;
    case "dooropen":
      return <DoorOpen className="size-6" strokeWidth={1.8} />;
    case "search":
      return <Search className="size-6" strokeWidth={1.8} />;
    case "units":
      return <Building className="size-6" strokeWidth={1.8} />;
```

- [ ] **Step 3: Gate + commit**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean. (All five lucide names — `Building`, `DoorOpen`, `FileSignature`, `Handshake`, `Search` — exist in lucide-react; if any import errors, substitute the nearest existing icon and note it.)

```bash
git add src/content/flows.ts src/components/apply/steps/icons.tsx
git commit -m "feat(apply): icons for buy-stage + 2-4 units options"
```

---

### Task 3: Rewrite `FLOW.buy` (buy funnel goes live)

**Files:**
- Modify: `src/content/flows.ts`

- [ ] **Step 1: Replace the `buy: [ ... ]` array** in `FLOW` with the deepened sequence:

```ts
  buy: [
    {
      type: "choice",
      q: "Where are you in the home buying process?",
      field: "buyStage",
      opts: [
        { label: "Signed a purchase agreement", icon: "doc" },
        { label: "Making offers", icon: "offer" },
        { label: "Going to open houses", icon: "dooropen" },
        { label: "Just researching", icon: "search" },
      ],
    },
    {
      type: "address",
      q: "What's the address of the new property?",
      field: "address",
      help: "Why do we need this?",
    },
    {
      type: "choice",
      q: "How will you use this home?",
      field: "propertyUse",
      opts: [
        { label: "Primary residence", icon: "mailbox" },
        { label: "Second home", icon: "palm" },
        { label: "Investment property", icon: "invest" },
      ],
      sub: "Our fast, digital process has helped thousands of buyers save time and money. You're next!",
    },
    {
      type: "choice",
      q: "What type of home?",
      field: "propertyType",
      opts: [
        { label: "Single Family", icon: "house" },
        { label: "Condo", icon: "condo" },
        { label: "Co-op", icon: "coop" },
        { label: "2 to 4 units", icon: "units" },
        { label: "Manufactured home", icon: "manuf" },
      ],
      review: true,
    },
    {
      type: "binary",
      q: "Have you owned any property in the last three years?",
      field: "ownedLast3yr",
      help: "What is a first-time home buyer?",
    },
    {
      type: "currency",
      q: "What's the purchase price?",
      field: "purchasePrice",
      placeholder: "e.g. 425,000",
    },
    {
      type: "currency",
      q: "How much are you putting down?",
      field: "downPaymentPct",
      unit: "%",
      placeholder: "e.g. 20",
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

Leave `refi` and `cash` untouched. Update the doc comment above `FLOW` if it still says "buy: 7 steps" → "buy: 11 steps".

- [ ] **Step 2: Full gate + commit**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: all clean / pass (192 tests; `buildLeadFields` already covers number/string/array values — the buy `%` value is a number, the binary is a string).

```bash
git add src/content/flows.ts
git commit -m "feat(apply): deepened buy funnel live — Better-parity steps + named hand-off"
```

---

### Task 4: Browser verification + deploy

**Files:** none (verify; fix-forward; deploy)

Use `preview_start` (msfg-web; `autoPort` handles the LOS-on-3000 conflict). Wait for hydration after each load before interacting. The headless viewport occasionally collapses to 0×0 — if a read returns `vh:0`, `preview_resize` to a real size and re-screenshot.

- [ ] **Step 1: Buy entry + stage.** Load `/apply/buy`. Verify the buy-stage step ("Where are you in the home buying process?") with the four options + new icons; picking one auto-advances (deck motion forward).
- [ ] **Step 2: Address.** Type a partial street address → suggestions if `GOOGLE_PLACES_API_KEY` is set on the box, else the validated free-text fallback (Apt/Unit + ZIP); Next enables on street + ZIP.
- [ ] **Step 3: Property use / type.** Property use shows the social-proof sub; property type shows all five options (Single Family / Condo / Co-op / 2 to 4 units / Manufactured) with icons; both auto-advance.
- [ ] **Step 4: First-time buyer.** Yes/No binary with the "What is a first-time home buyer?" help link; auto-advances.
- [ ] **Step 5: Purchase price ($) + down payment (%).** Price shows the `$` prefix + thousands formatting; down payment shows the trailing `%` suffix and clamps at 100 (type 150 → 100); Next disabled until a value.
- [ ] **Step 6: Credit band + optional income.** Credit band auto-advances; income shows "Skip this for now" and skipping advances.
- [ ] **Step 7: Contact + lead.** Split contact (name+email → phone+TCPA, "Hi {name}!"); submitting fires `POST /api/v1/leads` (check `preview_network` → 200 with `leadId`).
- [ ] **Step 8: Finish.** Two doors render (continue in the app / talk to a loan officer).
- [ ] **Step 9: Back + mobile + reduced motion.** Back animates reverse and restores answers; at 375px the steps + the `%`/`$` affixes lay out cleanly; reduced motion → instant step swaps.
- [ ] **Step 10: Console clean; capture desktop + mobile screenshots.**
- [ ] **Step 11: Deploy**

```bash
git add -A && git commit -m "fix(apply): polish from buy funnel browser verification" || echo "no fixes needed"
bash scripts/deploy-ec2.sh https://staging.msfg.us staging
```

---

## Self-review (done at plan time)

- **Spec coverage:** buy-stage step ✓ (T3) · address (reused) ✓ (T3) · property use + sub ✓ (T3) · property type 5-opt incl. 2–4 units ✓ (T2/T3) · first-time-buyer binary, usatoday dropped ✓ (T3) · purchase price ($) ✓ (T3) · down payment (%) ✓ (T1 unit + T3) · credit band (self-reported, no pull) ✓ (T3) · optional income ✓ (T3) · ContactStep + FinishStep + returning + deck motion + buildLeadFields (all reused, no change) ✓ · `%` clamp 0–100 ✓ (T1, TDD) · no migration ✓ · `FLOW.refi`/`FLOW.cash` untouched ✓ · browser verify ✓ (T4).
- **Type consistency:** `unit?: "$" | "%"` defined once on the `currency` step (T1) and consumed by `CurrencyStep` + the Wizard branch; `parsePercent` exported from `applyFields` (T1) and imported by `CurrencyStep`; the five new `StepIconKey`s (T2) are exactly the icons used in `FLOW.buy` (`doc`/`offer`/`dooropen`/`search`/`units`) (T3); `field` keys (`buyStage`/`address`/`propertyUse`/`propertyType`/`ownedLast3yr`/`purchasePrice`/`downPaymentPct`/`creditBand`/`income`) flow through `buildLeadFields` unchanged.
- **Placeholders:** none — every code step is complete. The social-proof `sub` is intentionally static (spec defers the state-dynamic version).
- **Sequencing:** T1 (unit) and T2 (icons) both land before T3 references them; the app stays green at every commit (FLOW.buy only switches to the new types/icons in T3, after both exist).
