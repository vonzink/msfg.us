# Blended Rate Calculator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Blended rate calculator at `/calculators/blended-rate` (spec step 3).

**Architecture:** A list of debts, each a name, balance and rate, with the weighted average rate as the answer. The math is the dashboard's one formula, proven by golden cases recorded by driving the dashboard script against a stub page. Built from the shared kit and wrapped in `CalculatorPage`. It introduces the add-a-row pattern that Home budget reuses.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind v4, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-18-public-calculators-design.md`, section "Blended rate" and "Rules for every calculator". Copy the shape of `src/calculators/buydown/`.

## Global Constraints

- Follow `AGENTS.md` and `src/calculators/CLAUDE.md`. Build from `src/calculators/shared/`.
- Never use "qualify", "approved", "eligible" or "your rate" in calculator text. Results are labeled estimates.
- Nothing a visitor types is stored or sent.
- The disclaimer comes from tenant config through the route page.
- Rates are decimals inside `math.ts`.
- `npm run check` passes at the end of every task. Branch `feat/calculator-blended-rate`.

## Review Focus

1. **A row with a balance and no rate.** It counts at 0%, as on the dashboard, and the page says a rate is missing rather than quietly lowering the answer. Pinned in Tasks 1 and 3.
2. **Junk, empty or negative balances.** The row is left out. With no usable row the page shows a prompt, never `NaN`. Pinned in Tasks 1 and 2.
3. **Six rows, then removing one.** Rows keep their own values; removing a middle row does not shift another row's numbers into it. Pinned in Task 2.
4. **A comparison rate equal to the blended rate,** and a comparison rate of junk or nothing. Pinned in Task 3.
5. **Switched off in config.** `/calculators/blended-rate` is not found. Pinned in Task 4.

---

### Task 1: Golden cases and the math

**Files:** Create `scripts/calculators/golden-blended-rate.mjs`, `src/calculators/blended-rate/golden.json`, `src/calculators/blended-rate/math.ts`, `math.test.ts`. Modify `scripts/README.md`.

**Interfaces (Produces):**

```ts
export type Debt = { name: string; balance: number; rate: number; payment: number };
export type DebtShare = Debt & { /** Share of the total balance, 0 to 1. */ share: number; missingRate: boolean };
export type BlendedResult = {
  /** Weighted by balance, as a decimal. */
  blendedRate: number;
  totalBalance: number;
  /** Sum of the payments entered. Zero when none were. */
  totalPayment: number;
  /** Only debts with a balance above zero, in the order given. */
  debts: DebtShare[];
  /** Set when a comparison rate was given: that rate minus the blended rate. */
  comparison: { rate: number; difference: number } | null;
};
/** null when no debt has a balance above zero. `compareRate` is a decimal, or NaN for none. */
export function calculateBlended(debts: Debt[], compareRate: number): BlendedResult | null;
```

**Source to port:** `calcDebt` in `msfg-calc/legacy/gen-calc/blended-rate.js`. It reads five rows from the page, so the generator gives it a stub `document` whose `getElementById` returns one object per id, sets `d1_bal`, `d1_rate`, `d1_pay` and so on, calls `calcDebt()`, and reads back the text of `totalBal`, `totalPay` and `blendedRate`. Record those three strings as `expected`.

One difference to record in `math.ts`: the dashboard adds negative balances into its totals. The public model leaves out any row whose balance is not above zero. Golden cases use non-negative balances only.

- [ ] **Step 1: Write the generator** with these cases (balance, rate percent, payment):

| name | debts |
|---|---|
| `mortgage-and-heloc` | 250000 / 3.5 / 1123; 60000 / 9 / 450 |
| `single-debt` | 180000 / 6.25 / 1108 |
| `five-debts` | 300000 / 4 / 1432; 45000 / 8.5 / 390; 22000 / 6.9 / 410; 9000 / 24.99 / 270; 15000 / 5.5 / 163 |
| `missing-rate` | 200000 / 4 / 955; 50000 / (empty) / 300 |
| `no-payments` | 250000 / 3.5 / (empty); 60000 / 9 / (empty) |
| `zero-rate-debt` | 20000 / 0 / 400; 80000 / 7 / 532 |

- [ ] **Step 2: Run it** and hand-check `mortgage-and-heloc`: (250000 × 3.5 + 60000 × 9) ÷ 310000 = 4.565%.
- [ ] **Step 3: Failing tests:** `it.each` over the golden cases comparing `(blendedRate * 100).toFixed(3) + "%"` and whole-dollar `formatUSD` of both totals to the recorded strings; shares sum to 1; `missingRate` is true only for a debt whose rate is not a finite number above or equal to zero, and that debt counts at 0%; rows with balance 0, negative or `NaN` are left out; null for an empty list and for all-zero balances; `comparison` is null for a `NaN` or negative compare rate, and `difference` is 0 when the two rates are equal.
- [ ] **Step 4: Run** (FAIL). **Step 5: Implement.** **Step 6: Run** (PASS), document the script, commit: `feat(calculators): blended rate math ported from the dashboard, with golden cases`.

### Task 2: Rows

**Files:** Create `src/calculators/blended-rate/rows.ts`, `rows.test.ts`.

**Interfaces (Produces):**

```ts
/** What is typed into one debt row. `id` is stable for the life of the row. */
export type Row = { id: number; name: string; balance: string; rate: string; payment: string };
export const MAX_ROWS = 6;
export const EXAMPLE_ROWS: Row[];      // "First mortgage" 250,000 at 3.5; "Home equity line" 60,000 at 9
export function blankRows(): Row[];    // two empty rows
export function addRow(rows: Row[]): Row[];                 // no change at MAX_ROWS; new id is max id + 1
export function removeRow(rows: Row[], id: number): Row[];  // never drops below one row
export function updateRow(rows: Row[], id: number, field: keyof Omit<Row, "id">, value: string): Row[];
export function toDebts(rows: Row[]): Debt[];               // a rate with no digit in it becomes NaN
export function parseCompareRate(text: string): number;     // decimal, or NaN when there is no digit
```

- [ ] **Step 1: Failing tests:** the example gives a 4.565% blended rate through `calculateBlended(toDebts(EXAMPLE_ROWS), NaN)`; adding from two rows gives three and stops at six; removing the middle of three rows leaves the first and third with their own values and ids; removing the only row leaves one; an unnamed row's debt is named "Debt N" by its position; junk balances give a null result; `parseCompareRate("")` and `(".")` are `NaN` and `("7")` is 0.07.
- [ ] **Step 2: Run** (FAIL). **Step 3: Implement.** **Step 4: Run** (PASS). **Step 5: Commit:** `feat(calculators): blended rate debt rows`.

### Task 3: Component

**Files:** Create `src/calculators/blended-rate/Results.tsx`, `PrintSummary.tsx`, `BlendedRateCalculator.tsx`, `BlendedRateCalculator.markup.test.tsx`. Modify `src/calculators/shared/Field.tsx` (a `text` field uses the normal keyboard, not the number pad).

**Interfaces (Produces):** `BlendedResults({ result, disclaimer, breakevenHref })`, `BlendedRateCalculator({ disclaimer, breakevenHref })`. `breakevenHref` is the Refinance breakeven calculator's path, or null while that calculator is not live.

Behaviour:
- Form: one card "The debts". Each row is a fieldset with the legend "Debt 1", "Debt 2" and so on, holding a name, a balance and a rate, plus a "Remove" button when there is more than one row. Under the rows, "Add another debt", hidden at six rows. Then `AddDetail` with a monthly payment for each row, labeled with the row's name, and "A new rate to compare".
- Results, in order:
  1. Headline card: eyebrow "Blended rate", the rate to three decimals, and "across {total balance} of debt".
  2. A stacked bar of each debt's share of the balance with a list beside it: name, balance, rate and share as a whole percent. Colour is never the only signal.
  3. "Total monthly payment" as a `Stat`, only when a payment was entered.
  4. With a comparison rate: "A new rate of 7% is 2.435 percentage points above this blended rate." or "below", or "the same as this blended rate." when equal.
  5. For any debt with a missing rate: "{name} has no rate entered, so it is counted at 0%."
  6. Always: "A lower rate is not the whole decision. Moving a short-term debt into a 30-year loan can lower the rate and still raise the total interest you pay." followed by a link "Check the breakeven on a refinance" when `breakevenHref` is set. Then the disclaimer.
- No result: "Enter a balance and a rate for at least one debt to see the blended rate." with `role="status"`.
- Print: `printBelowOnly`, a `PrintSummary` titled "Blended rate estimate" (left column: one row per debt; right column: blended rate, total balance, total payment if any, comparison if any), then sentence 6 and the disclaimer.

- [ ] **Step 1: Failing tests** with `renderToStaticMarkup`: the page opens on `4.565%` and `$310,000`; two debt fieldsets with legends; every input has a label; "Add another debt" is present and one `details` panel; no `NaN|Infinity|undefined` and no banned words; results with a 7% comparison contain the "2.435 percentage points above" sentence, with 3% "below", and with 4.565 nothing odd (equal uses the "same" wording at an exact match); a missing rate shows its sentence; the caution sentence is always present and the link only with an href; total payment appears only when a payment is entered; a null result shows the prompt.
- [ ] **Step 2: Run** (FAIL). **Step 3: Implement.** **Step 4: Run** (PASS) and confirm the investment and mortgage markup snapshots and tests are unchanged. **Step 5: Commit:** `feat(calculators): blended rate calculator component`.

### Task 4: Page, registry, content and verification

**Files:** Create `src/calculators/blended-rate/content.ts`, `src/app/(marketing)/calculators/blended-rate/page.tsx`. Modify `src/calculators/registry.ts`, `registry.test.ts`, `src/app/(marketing)/calculators/routes.test.ts`, `src/content/nav.test.ts`.

Pinned values:
- Registry entry, placed third: `{ slug: "blended-rate", path: "/calculators/blended-rate", label: "Blended rate calculator", question: "What rate am I really paying across my debts?", description: "Combine a mortgage with a second loan, a credit line or other debts and see the single rate they add up to.", applyHref: "/apply/refi" }`.
- The route passes `breakevenHref` from the registry: the `refinance-breakeven` entry's path when it exists and is switched on, otherwise null.
- `content.ts` has no intro. "How this works" must say: the blended rate weights each rate by its balance, so a large low-rate mortgage pulls the figure down; it is a way to compare what you have against one new rate; a lower rate alone does not mean lower cost, because the term matters. Three or four questions. No formulas.

- [ ] **Step 1: Failing tests:** registry order `mortgage`, `buydown`, `blended-rate`, `investment`; the route renders by default and is not found when switched off; known routes updated.
- [ ] **Step 2: Run** (FAIL). **Step 3: Implement.** **Step 4:** `npm run check` and `npm run build`.
- [ ] **Step 5: Verify on a local production build:** the page returns 200 with `4.565%`; the landing page has four cards; capture a desktop screenshot and a print PDF with headless Chrome and read both.
- [ ] **Step 6: Commit:** `feat(calculators): blended rate page and registry entry`.
- [ ] **Step 7:** Final review by a fresh reviewer, one fix pass, then deploy to staging with `scripts/deploy-ec2.sh` (no arguments) for Zachary's test.

---

## Amendment 1: monthly savings (2026-11-18)

Asked for by Zachary after testing the first version on staging. The spec's "Blended rate" section is updated to match.

**Change:** "Add detail" gains a **New loan term** choice (10, 15, 20, 25, 30 years, default 30). With a comparison rate and a payment on every counted debt, the results show **Monthly savings**.

**Interfaces:**

```ts
export type Comparison = {
  rate: number; difference: number;
  termYears: number;            // anything but a whole number from 1 to 40 is read as 30
  newPayment: number;           // one new loan for the whole balance at the comparison rate
  missingPayments: number;      // counted debts with no payment entered
  monthlySavings: number | null; // today's payments minus newPayment; null while any payment is missing
};
export function calculateBlended(debts: Debt[], compareRate: number, newTermYears = 30): BlendedResult | null;
```

**Pinned values:**
- $250,000 at 3.5% paying $1,123 and $60,000 at 9% paying $450, compared with 7% over 30 years: new payment $2,062, monthly savings -$489.
- Stat label "Monthly savings"; sub line "{new} new payment against {current} now"; a negative figure is shown in the loss colour.
- Sentence: "The new payment would be higher." or "The new payment would be lower.", followed by "Assumes one new {N}-year loan for the full {balance} at {rate}, with no closing costs or cash out added."
- With some payments missing: "Enter the current payment for every debt to see the monthly savings." and no figure.
- The existing caution about term length stays on screen and in print whenever a result is shown. A new common question explains why large monthly savings are not the whole story.

**Review focus for this amendment:** a missing payment must never make the figure look better or worse than it is; the figure must never appear without its assumptions and the term-length caution.

## Amendment 2: new loan amount and cash back (2026-11-18)

Asked for by Zachary. The spec's "Blended rate" section is updated to match.

**Change:** "Add detail" gains a **New loan amount** money field. `calculateBlended` takes it as a fourth argument, `newLoanAmount = NaN`. `Comparison` gains `loanAmount` (the amount entered, or the total of the debts) and `cashBack` (`loanAmount` minus the debts; negative when the loan would not cover them). `newPayment` is priced on `loanAmount`. `monthlySavings` is null when `cashBack` is negative.

**Pinned values:**
- The example debts with payments of $1,123 and $450, a 7% rate, 30 years and a $350,000 loan: cash back $40,000, new payment $2,329, monthly savings -$756.
- A "Cash back" stat with the sub line "from a new loan of {amount}", shown with a comparison rate whether or not payments are entered.
- Assumption with cash back: "Assumes one new {N}-year loan of {loan} at {rate}: {debts} to pay off the debts and {cash} cash back, with no closing costs added."
- A loan below the debts: "A new loan of {loan} is {gap} less than the debts listed, so it would not pay them all off." and no savings figure.
- Field hint: "Leave empty to borrow just enough to pay off the debts. Enter more to take cash back."
- A new common question explains that cash back is extra borrowing and raises the new payment.

**Reading of the request:** "a loan amount field as cash back" was taken as one field for the new loan amount, with cash back worked out as the excess over the debts. The other reading, a field for the cash back amount with the loan amount worked out, gives the same numbers from the other end.

