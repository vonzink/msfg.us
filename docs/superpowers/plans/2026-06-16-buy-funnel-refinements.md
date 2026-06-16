# Buy Funnel Refinements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Six purchase-funnel refinements on `/apply/buy`: wire the two dead help links to open Ask-AI with the answer, add a TBD address link, add an "Other" property type, add a Percent/Amount toggle to down payment, and add the loan-officer step.

**Architecture:** A `seedQuestion` prop on `ApplyChatPanel` (auto-sends on open) + an `onAskAi` callback threaded from the Wizard into `AddressStep`/`BinaryStep` powers the help links. The down-payment toggle stores a `CurrencyAmount {value,unit}` answer that `buildLeadFields` formats to a labeled string. The officer step is config-only (the Wizard already renders `type:"officer"`).

**Tech Stack:** Next.js 16 / React 19 client components, TypeScript, Tailwind v4 tokens, vitest. Apply wizard: `src/content/flows.ts`, `src/components/apply/Wizard.tsx`, `src/components/apply/steps/*`, `src/lib/{leads,applyFields}.ts`, `src/components/apply/ask-ai/ApplyChatPanel.tsx`.

**Spec:** `docs/superpowers/specs/2026-06-16-buy-funnel-refinements-design.md`

---

## File Structure

**Modified**
- `src/lib/leads.ts` — add `CurrencyAmount` type; widen `AnswerValue`.
- `src/lib/applyFields.ts` — `isCurrencyAmount` guard; `buildLeadFields` formats a `CurrencyAmount` to a labeled string; `isEmpty` treats a null-value amount as empty. Test: `applyFields.test.ts`.
- `src/content/flows.ts` — `CurrencyStep.toggle?`, `AddressStep.askPrompt?`, `BinaryStep.askPrompt?` type fields; FLOW.buy: "Other" property type, address `askPrompt`, down-payment `field`→`downPayment` + `toggle`, insert officer step. Test: `flows.test.ts` (create).
- `src/components/apply/ask-ai/ApplyChatPanel.tsx` — `seedQuestion?` prop + auto-send effect.
- `src/components/apply/steps/AddressStep.tsx` — `help?`/`onAskAi?`/`onTbd?` props; `TBD_ADDRESS` export; wire the "why" link + add the TBD link.
- `src/components/apply/steps/BinaryStep.tsx` — `onAskAi?` prop; wire the help link.
- `src/components/apply/steps/CurrencyStep.tsx` — `toggle?` + `onUnitChange?` props; segmented %/$ control.
- `src/components/apply/Wizard.tsx` — `seedQuestion` state + `openAskAi`; wire `onAskAi`/`onTbd`; split the currency renderer for the toggle answer; pass `seedQuestion` to the panel.

---

## Task 1: CurrencyAmount answer type + buildLeadFields formatting

**Files:**
- Modify: `src/lib/leads.ts`
- Modify: `src/lib/applyFields.ts`
- Test: `src/lib/applyFields.test.ts`

- [ ] **Step 1: Add the type to `leads.ts`**

After the `StructuredAddress` type, add:
```ts
/** A currency answer that records the entered value AND the unit the applicant
 *  chose (e.g. down payment as 20% or $85,000). */
export type CurrencyAmount = { value: number | null; unit: "$" | "%" };
```
Widen `AnswerValue`:
```ts
export type AnswerValue = string | string[] | number | StructuredAddress | CurrencyAmount | null;
```

- [ ] **Step 2: Write the failing test** (append to `src/lib/applyFields.test.ts`; create the file if absent with the imports)

```ts
import { describe, it, expect } from "vitest";
import { buildLeadFields, isCurrencyAmount } from "./applyFields";
import type { Step } from "@/content/flows";
import type { AnswerValue } from "@/lib/leads";

describe("CurrencyAmount in buildLeadFields", () => {
  const steps = [
    { type: "currency", q: "Down?", field: "downPayment", toggle: true, unit: "%" },
  ] as unknown as Step[];

  it("formats a percent amount as a labeled string", () => {
    const out = buildLeadFields(steps, { 0: { value: 20, unit: "%" } as AnswerValue });
    expect(out.downPayment).toBe("20%");
  });
  it("formats a dollar amount with thousands + $", () => {
    const out = buildLeadFields(steps, { 0: { value: 85000, unit: "$" } as AnswerValue });
    expect(out.downPayment).toBe("$85,000");
  });
  it("skips an amount whose value is null", () => {
    const out = buildLeadFields(steps, { 0: { value: null, unit: "%" } as AnswerValue });
    expect(out.downPayment).toBeUndefined();
  });
  it("isCurrencyAmount distinguishes shapes", () => {
    expect(isCurrencyAmount({ value: 1, unit: "%" })).toBe(true);
    expect(isCurrencyAmount(20)).toBe(false);
    expect(isCurrencyAmount({ line1: "x", city: "", state: "", zip: "" })).toBe(false);
  });
});
```

- [ ] **Step 3: Run it (fails — isCurrencyAmount/formatting not present).** `npx vitest run src/lib/applyFields.test.ts`

- [ ] **Step 4: Implement in `applyFields.ts`**

Add the import + guard + formatter, and use them in `buildLeadFields` + `isEmpty`:
```ts
import type { AnswerValue, CurrencyAmount } from "@/lib/leads";

/** True when an answer is the {value,unit} currency shape (toggle steps). */
export function isCurrencyAmount(v: AnswerValue | undefined): v is CurrencyAmount {
  return !!v && typeof v === "object" && "unit" in v && "value" in v;
}

/** Format a CurrencyAmount as a labeled string for the LO/LOS, e.g. "20%" / "$85,000". */
function formatCurrencyAmount(a: CurrencyAmount): string {
  return a.unit === "%" ? `${a.value}%` : `$${(a.value ?? 0).toLocaleString("en-US")}`;
}
```
Update `isEmpty` to also treat a null-value amount as empty:
```ts
function isEmpty(v: AnswerValue | undefined): boolean {
  if (isCurrencyAmount(v)) return v.value == null;
  return v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
}
```
In `buildLeadFields`, format currency amounts before writing:
```ts
    const v = answers[i];
    if (isEmpty(v)) return;
    out[field] = isCurrencyAmount(v) ? formatCurrencyAmount(v) : (v as AnswerValue);
```
(Replace the existing `out[field] = v as AnswerValue;` line.)

- [ ] **Step 5: Run the test (passes).** `npx vitest run src/lib/applyFields.test.ts` → PASS

- [ ] **Step 6: Commit**

```bash
npx tsc --noEmit
git add src/lib/leads.ts src/lib/applyFields.ts src/lib/applyFields.test.ts
git commit -m "feat(apply): CurrencyAmount answer + labeled lead-field formatting"
```

---

## Task 2: flows.ts — type fields + FLOW.buy changes

**Files:**
- Modify: `src/content/flows.ts`
- Test: `src/content/flows.test.ts` (create)

- [ ] **Step 1: Add the new optional fields to the step types**

In `src/content/flows.ts`:
- `CurrencyStep` type — add `toggle?: boolean;` (doc: "When true, render a Percent/Amount unit toggle; the answer becomes a CurrencyAmount {value,unit}.").
- `AddressStep` type — add `askPrompt?: string;` (doc: "Question sent to Ask-AI when the help link is clicked; falls back to `help`.").
- `BinaryStep` type — add `askPrompt?: string;` (same doc).

- [ ] **Step 2: Edit FLOW.buy**

(a) Property type — add "Other" (matching refi's `icon: "help"`):
```ts
      opts: [
        { label: "Single Family", icon: "house" },
        { label: "Condo", icon: "condo" },
        { label: "Co-op", icon: "coop" },
        { label: "2 to 4 units", icon: "units" },
        { label: "Manufactured home", icon: "manuf" },
        { label: "Other", icon: "help" },
      ],
```
(b) Address step — add `askPrompt`:
```ts
    {
      type: "address",
      q: "What's the address of the new property?",
      field: "address",
      help: "Why do we need this?",
      askPrompt: "Why does this application ask for the property address, and how is it used?",
    },
```
(c) Down-payment step — rename `field` to `downPayment` and add `toggle`:
```ts
    {
      type: "currency",
      q: "How much are you putting down?",
      field: "downPayment",
      unit: "%",
      toggle: true,
      placeholder: "e.g. 20",
    },
```
(d) Insert the officer step after the income step and before the `form` step (mirroring refi):
```ts
    {
      type: "currency",
      q: "What's your household income?",
      field: "income",
      placeholder: "e.g. 120,000",
      optional: true,
    },
    {
      type: "officer",
      q: "Who would you like to work with?",
      field: "loanOfficer",
      sub: "Pick a loan officer, or let us match you with the right fit.",
    },
    { type: "form", q: "Let's start personalizing your offer!" },
    { type: "finish", q: "You're all set — what's next?" },
```

- [ ] **Step 3: Create `src/content/flows.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { FLOW } from "./flows";

describe("FLOW.buy refinements", () => {
  const buy = FLOW.buy;
  it("offers an 'Other' property type", () => {
    const pt = buy.find((s) => s.type === "choice" && s.field === "propertyType");
    expect(pt && "opts" in pt && pt.opts.some((o) => o.label === "Other")).toBe(true);
  });
  it("down payment is a toggle currency field named downPayment", () => {
    const dp = buy.find((s) => s.type === "currency" && "field" in s && s.field === "downPayment");
    expect(dp && "toggle" in dp && dp.toggle).toBe(true);
  });
  it("the address step carries an askPrompt", () => {
    const addr = buy.find((s) => s.type === "address");
    expect(addr && "askPrompt" in addr && Boolean(addr.askPrompt)).toBe(true);
  });
  it("includes a loan-officer step", () => {
    expect(buy.some((s) => s.type === "officer")).toBe(true);
  });
});
```

- [ ] **Step 4: Run + fix any stale reference** — `npx vitest run src/content/flows.test.ts` (PASS) and `npx vitest run` (grep for any test using the old `downPaymentPct` field name and update it to `downPayment`). `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit**

```bash
git add src/content/flows.ts src/content/flows.test.ts
git commit -m "feat(apply): buy flow — Other type, down-payment toggle, officer step, address askPrompt"
```

---

## Task 3: ApplyChatPanel seedQuestion (auto-send on open)

**Files:**
- Modify: `src/components/apply/ask-ai/ApplyChatPanel.tsx`

- [ ] **Step 1: Add the prop**

Add `seedQuestion?: string;` to the props destructure and type (after `stepQuestion`).

- [ ] **Step 2: Add the auto-send effect**

After the existing focus `useEffect` (the one ending `}, [open, returnFocusRef]);`), add:
```tsx
  // Auto-send a seed question when the panel opens from a help link (empty thread only).
  const sentSeed = useRef(false);
  useEffect(() => {
    if (!open) {
      sentSeed.current = false;
      return;
    }
    if (seedQuestion && !sentSeed.current && chat.thread.msgs.length === 0) {
      sentSeed.current = true;
      chat.send(seedQuestion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire on open/seed change; chat.send is stable, the empty-thread + sentSeed guards prevent re-sends
  }, [open, seedQuestion]);
```

- [ ] **Step 3: Verify** — `npx tsc --noEmit && npx vitest run && npx eslint src/components/apply/ask-ai` → clean (hero + apply chat tests still pass).

- [ ] **Step 4: Commit**

```bash
git add src/components/apply/ask-ai/ApplyChatPanel.tsx
git commit -m "feat(apply): ApplyChatPanel seedQuestion auto-sends on open"
```

---

## Task 4: AddressStep + BinaryStep help links + TBD

**Files:**
- Modify: `src/components/apply/steps/BinaryStep.tsx`
- Modify: `src/components/apply/steps/AddressStep.tsx`

- [ ] **Step 1: BinaryStep — add `onAskAi` and wire the help link**

Add `onAskAi?: () => void;` to the props type + destructure. Replace the help `<a>` (the `{help && (<a href="#" …>{help}</a>)}` block) with:
```tsx
      {help && onAskAi && (
        <button
          type="button"
          onClick={onAskAi}
          className="-mt-1 mb-[26px] inline-block text-[15px] text-ink underline underline-offset-[3px]"
        >
          {help}
        </button>
      )}
```

- [ ] **Step 2: AddressStep — add props + the TBD constant**

Add the import-adjacent export near the top (after the imports):
```tsx
/** Marker stored when the buyer doesn't have a property address yet. */
export const TBD_ADDRESS: StructuredAddress = {
  line1: "Address to be determined",
  city: "",
  state: "",
  zip: "",
};
```
Add to the props type + destructure: `help?: string;`, `onAskAi?: () => void;`, `onTbd?: () => void;`.

- [ ] **Step 3: AddressStep — wire the "why" link + add the TBD link**

Replace the current hardcoded "why" anchor (the `<a href="#" onClick={(e) => e.preventDefault()} …>Why do we need this?</a>`) with a config-driven button:
```tsx
      {help && onAskAi && (
        <button
          type="button"
          onClick={onAskAi}
          className="mb-3 inline-block text-[15px] font-bold text-green-600 underline"
        >
          {help}
        </button>
      )}
```
Add a TBD link directly **after the Next button** (after the closing `</button>` of the Next control), gated on `onTbd`:
```tsx
      {onTbd && (
        <button
          type="button"
          onClick={onTbd}
          className="mt-3.5 inline-block text-[15px] font-bold text-green-600 hover:underline"
        >
          I don&rsquo;t have an address yet
        </button>
      )}
```

- [ ] **Step 4: Verify** — `npx tsc --noEmit && npx eslint src/components/apply/steps` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/apply/steps/BinaryStep.tsx src/components/apply/steps/AddressStep.tsx
git commit -m "feat(apply): wire help links to Ask-AI + address TBD link"
```

---

## Task 5: CurrencyStep — Percent/Amount toggle

**Files:**
- Modify: `src/components/apply/steps/CurrencyStep.tsx`

- [ ] **Step 1: Add `toggle` + `onUnitChange` props**

Add to the props type + destructure: `toggle?: boolean;` and `onUnitChange?: (u: "$" | "%") => void;`.

- [ ] **Step 2: Render the segmented control when `toggle`**

Immediately inside the returned fragment (before the `<div className="relative mb-3.5 text-left">` input wrapper), add:
```tsx
      {toggle && (
        <div className="mb-3.5 flex gap-2" role="group" aria-label="Down payment unit">
          {(["%", "$"] as const).map((u) => (
            <button
              key={u}
              type="button"
              aria-pressed={unit === u}
              onClick={() => onUnitChange?.(u)}
              className={cn(
                "h-11 flex-1 rounded-lg border-[1.5px] text-[15px] font-bold transition-colors duration-150",
                unit === u
                  ? "border-green-600 bg-green-600 text-white"
                  : "border-line bg-white text-ink hover:border-green-600",
              )}
            >
              {u === "%" ? "Percent" : "Amount"}
            </button>
          ))}
        </div>
      )}
```
(The existing input already adapts its affix + parser to the `unit` prop, so switching units re-renders correctly. The Wizard clears the value on unit change — see Task 6.)

- [ ] **Step 3: Verify** — `npx tsc --noEmit` clean. (Non-toggle callers are unaffected — `toggle`/`onUnitChange` are optional.)

- [ ] **Step 4: Commit**

```bash
git add src/components/apply/steps/CurrencyStep.tsx
git commit -m "feat(apply): CurrencyStep Percent/Amount toggle"
```

---

## Task 6: Wizard wiring (Ask-AI seed, TBD, currency toggle answer, officer already handled)

**Files:**
- Modify: `src/components/apply/Wizard.tsx`

- [ ] **Step 1: Imports + state**

Add to imports:
```tsx
import { AddressStep, TBD_ADDRESS } from "./steps/AddressStep";
import { isCurrencyAmount } from "@/lib/applyFields";
import type { CurrencyAmount } from "@/lib/leads";
```
(Replace the existing `import { AddressStep } from "./steps/AddressStep";` line.)

Add state + helper near the other `useState`/`useCallback` (after `const [chatOpen, setChatOpen] = useState(false);`):
```tsx
  const [seedQuestion, setSeedQuestion] = useState<string | undefined>(undefined);
  const openAskAi = useCallback((question?: string) => {
    setSeedQuestion(question);
    setChatOpen(true);
  }, []);
```

- [ ] **Step 2: Derive the current currency-toggle answer**

Near the other derived values (after `const step = steps[idx];`), add:
```tsx
  const currencyAns = isCurrencyAmount(answers[idx]) ? (answers[idx] as CurrencyAmount) : null;
  const currencyUnit = (s: { unit?: "$" | "%" }) => currencyAns?.unit ?? s.unit ?? "%";
```

- [ ] **Step 3: Wire the binary + address renderers**

Replace the `binary` renderer:
```tsx
            {step.type === "binary" && (
              <BinaryStep
                help={step.help}
                usatoday={step.usatoday}
                selected={typeof answers[idx] === "string" ? (answers[idx] as string) : undefined}
                onPick={pickAuto}
                onAskAi={step.help ? () => openAskAi(step.askPrompt ?? step.help) : undefined}
              />
            )}
```
Replace the `address` renderer:
```tsx
            {step.type === "address" && (
              <AddressStep
                value={(answers[idx] as StructuredAddress) ?? null}
                onChange={setAnswer}
                onNext={next}
                help={step.help}
                onAskAi={step.help ? () => openAskAi(step.askPrompt ?? step.help) : undefined}
                onTbd={() => { setAnswer(TBD_ADDRESS); next(); }}
              />
            )}
```

- [ ] **Step 4: Split the currency renderer for the toggle answer**

Replace the single `currency` renderer with a toggle/non-toggle split:
```tsx
            {step.type === "currency" && step.toggle && (
              <CurrencyStep
                field={step.field}
                placeholder={step.placeholder}
                optional={step.optional}
                unit={currencyUnit(step)}
                toggle
                value={currencyAns?.value ?? null}
                onChange={(n) => setAnswer({ value: n, unit: currencyUnit(step) })}
                onUnitChange={(u) => setAnswer({ value: null, unit: u })}
                onNext={next}
                onSkip={() => { setAnswer(null); next(); }}
              />
            )}
            {step.type === "currency" && !step.toggle && (
              <CurrencyStep
                field={step.field}
                placeholder={step.placeholder}
                optional={step.optional}
                unit={step.unit}
                value={typeof answers[idx] === "number" ? (answers[idx] as number) : null}
                onChange={setAnswer}
                onNext={next}
                onSkip={() => { setAnswer(null); next(); }}
              />
            )}
```

- [ ] **Step 5: Pass seedQuestion to the panel + clear on close**

Update the `<ApplyChatPanel>` props:
```tsx
      <ApplyChatPanel
        open={chatOpen}
        onClose={() => { setChatOpen(false); setSeedQuestion(undefined); }}
        starters={APPLY_CHAT_STARTERS[intent]}
        assistantName={assistantName}
        shortName={shortName}
        iconSrc={iconSrc}
        stepQuestion={step.q}
        seedQuestion={seedQuestion}
        returnFocusRef={askBtnRef}
      />
```
And the FAB button's `onClick` becomes `() => openAskAi()` (no seed → normal starter-chip empty state):
```tsx
        onClick={() => openAskAi()}
```

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npx vitest run && npx eslint src/components/apply`
Expected: clean; all tests pass. (The officer step needs no Wizard change — the existing `type === "officer"` renderer + `officerIdx`/`chosenOfficer` logic handle the buy flow automatically.)

- [ ] **Step 7: Commit**

```bash
git add src/components/apply/Wizard.tsx
git commit -m "feat(apply): wire Ask-AI seed + TBD + down-payment toggle answer in the Wizard"
```

---

## Task 7: Full verification + deploy (controller)

**Files:** none (verification). Requires the local Docker DB up (`npm run db:up`).

- [ ] **Step 1: Gates** — `npx tsc --noEmit && npx vitest run && npx eslint src && npx next build`. Expected: green; `/apply/[intent]` still SSG.

- [ ] **Step 2: Browser pass (preview) on `/apply/buy`:**
  - "Why do we need this?" (address) and "What is a first-time home buyer?" (owned-property) each open the Ask-AI panel and the answer streams in.
  - "I don't have an address yet" advances; the contact/finish step submits (LOS `address` = "Address to be determined").
  - Property type shows "Other".
  - Down payment: toggle Percent ↔ Amount; switching clears the field; entering a value advances; the funnel reaches the officer step.
  - Officer step renders (state-filtered roster + "No preference"); choosing one carries to the finish step.
  - Regression: refi flow + the floating Ask-AI FAB (opens to starter chips, no seed) still work.

- [ ] **Step 3: Deploy** — `bash scripts/deploy-ec2.sh https://staging.msfg.us staging`; smoke `/apply/buy` returns 200.

---

## Done criteria

- `tsc` + `eslint` clean; `vitest` green (new applyFields + flows tests); `next build` succeeds.
- Both buy help links open Ask-AI and auto-send their question; the address TBD link advances with a TBD marker; "Other" property type present; down payment toggles %/$ and the LO/LOS sees a labeled value; the officer step is in the buy flow.
- Refi + the hero/apply Ask-AI FAB are unaffected.

## Follow-ups (not blocking)

- A second help-link click while the panel is already open won't re-seed (empty-thread guard) — acceptable for v1.
- TBD address isn't re-prompted later; the loan officer completes it.
