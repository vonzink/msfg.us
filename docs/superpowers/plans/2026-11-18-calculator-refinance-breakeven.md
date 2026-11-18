# Refinance Breakeven Calculator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Refinance breakeven calculator at `/calculators/refinance-breakeven` (spec step 4).

**Architecture:** The dashboard's refinance tool has 51 inputs; this keeps six up front and six behind "Add detail". The payment, savings and breakeven math is a port of `RefiEngine.runAnalysis` with the cost-of-waiting scenario switched off, proven by golden cases. The lifetime interest comparison is not on the dashboard and is hand-checked. Built from the shared kit and wrapped in `CalculatorPage`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind v4, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-18-public-calculators-design.md`, section "Refinance breakeven" and "Rules for every calculator". Copy the shape of `src/calculators/buydown/`.

## Global Constraints

- Follow `AGENTS.md` and `src/calculators/CLAUDE.md`. Build from `src/calculators/shared/`.
- Never use "qualify", "approved", "eligible" or "your rate" in calculator text. Results are labeled estimates. Nothing may read as a recommendation to refinance.
- Nothing a visitor types is stored or sent.
- The example new rate, its note and the disclaimer come from tenant config through the route page.
- Rates are decimals inside `math.ts`; terms are months inside `math.ts`. Use `parseRate` for typed rates.
- `npm run check` passes at the end of every task. Branch `feat/calculator-refinance-breakeven`.

## Review Focus

1. **A new payment that is not lower.** No breakeven exists. The page says so in words and never shows "Infinity", a negative month count or a division by zero. Pinned in Tasks 1 and 3.
2. **A lower payment that costs more interest over the loan's life** (22 years left refinanced into 30). The lifetime interest comparison is always shown and the page states the extra interest in words. Pinned in Tasks 1 and 3.
3. **Zero closing costs.** Breakeven is immediate, shown as such, not as "0 months" with a stray chart. Pinned in Task 3.
4. **Junk or empty balance, rates or years left.** A prompt, never `NaN`. Pinned in Task 2.
5. **Switched off in config.** Not found, and the Blended rate page's link to it disappears. Pinned in Task 4.

---

### Task 1: Golden cases and the math

**Files:** Create `scripts/calculators/golden-refinance-breakeven.mjs`, `src/calculators/refinance-breakeven/golden.json`, `math.ts`, `math.test.ts`. Modify `scripts/README.md`.

**Interfaces (Produces):**

```ts
export type BreakevenInput = {
  currentBalance: number; currentRate: number; monthsLeft: number;
  newRate: number; newTermMonths: number; closingCosts: number;
  /** NaN or not above zero means "current balance plus cash out". */
  newLoanAmount: number;
  cashOut: number;
  /** Monthly payments on other debts that the cash out pays off. Added to the savings. */
  debtPaymentsPaidOff: number;
  currentMi: number; newMi: number;
  /** How long the visitor plans to keep the loan. NaN or not above zero means "not given". */
  keepMonths: number;
};
export type BreakevenResult = {
  newLoanAmount: number;
  current: { principalAndInterest: number; mi: number; payment: number; interestRemaining: number };
  next: { principalAndInterest: number; mi: number; payment: number; interestTotal: number };
  /** Current payment minus new payment, plus debt payments paid off. Can be zero or negative. */
  monthlySavings: number;
  /** Whole months until the savings cover the closing costs. null when the savings are not above zero. */
  breakevenMonths: number | null;
  closingCosts: number;
  /** New loan's total interest minus the current loan's remaining interest. Positive means the refinance costs more interest. */
  interestDifference: number;
  keep: { months: number; netSavings: number } | null;
};
/** null for a balance, rate, term or loan amount the dashboard rejects: rates must be above 0 and below 30%. */
export function calculateBreakeven(input: BreakevenInput): BreakevenResult | null;
```

**Source to port:** `calcMonthlyPayment`, `calcBreakevenNow` and the "now" half of `calcCostOfWaiting` in `msfg-calc/legacy/refi-calc/js/refi-engine.js`, reached through `RefiEngine.runAnalysis`. Follow its rounding exactly: payments are rounded to cents first, savings are the difference of rounded payments, breakeven is `ceil(closing costs / savings)`, and net savings are `round(savings x months) - closing costs`. As on the dashboard, cash out changes nothing except the default loan amount; only the debt payments it pays off enter the savings.

**Not on the dashboard, hand-checked:** `interestRemaining = payment x monthsLeft - balance`, `interestTotal = payment x term - loan amount`, using principal and interest only.

- [ ] **Step 1: Write the generator.** Load `refi-engine.js` in a `node:vm` context and read `RefiEngine` out of it. Call `runAnalysis` with `costOfWaitingEnabled: false`, the closing costs as `fees.feeUnderwriting`, the new MI as `fees.feeMonthlyMI`, the current MI as `currentMIMonthlyDollar`, and `planToStayMonths` (use 60 when the case gives none, and record no `netSavings` for it). Record `currentPayment` and `newPayment` including MI, `monthlySavings`, `breakevenMonths` (null for Infinity) and `netSavings`.

| name | inputs |
|---|---|
| `example` | balance 300000, 8% with 324 months left; new 7% for 360 months; closing 6000 |
| `shorter-term` | balance 300000, 8% with 324 left; new 6.5% for 180; closing 6000; keep 120 months |
| `no-savings` | balance 300000, 6% with 324 left; new 7% for 360; closing 6000 |
| `longer-term-more-interest` | balance 250000, 7.25% with 264 left; new 6.75% for 360; closing 5000; keep 84 |
| `cash-out-with-debts` | balance 300000, 8% with 324 left; cash out 40000, loan 340000, debt payments 900; new 7% for 360; closing 7000; keep 60 |
| `with-mi` | balance 300000, 8% with 324 left, current MI 140; new 7% for 360, new MI 95; closing 6000 |
| `zero-closing-costs` | `example` with closing 0 |

- [ ] **Step 2: Run it** and hand-check `example`: about $2,263 now, $1,995.91 new, about $267 saved, breakeven 23 months.
- [ ] **Step 3: Failing tests:** `it.each` over the golden cases; `breakevenMonths` is null and `monthlySavings` is not above zero for `no-savings`; breakeven is 0 for `zero-closing-costs`; `interestDifference` is positive for `longer-term-more-interest` and hand-checked for `example`; the default loan amount is balance plus cash out; `keep` is null without `keepMonths`; null for balance 0, a rate of 0, a rate of 0.30, `NaN` rates, months left 0, a term of 0, and a loan amount that works out to zero; junk or negative closing costs, MI and debt payments count as zero.
- [ ] **Step 4: Run** (FAIL). **Step 5: Implement.** **Step 6: Run** (PASS), document the script, commit: `feat(calculators): refinance breakeven math ported from the dashboard, with golden cases`.

### Task 2: Fields

**Files:** Create `src/calculators/refinance-breakeven/fields.ts`, `fields.test.ts`.

**Interfaces (Produces):** `FRONT_FIELDS` (ids `currentBalance`, `currentRate`, `yearsLeft`, `newRate`, `newTermYears`, `closingCosts`), `DETAIL_FIELDS` (ids `newLoanAmount`, `cashOut`, `debtPaymentsPaidOff`, `currentMi`, `newMi`, `keepYears`), `exampleValues(exampleRatePct): Values`, `BLANK`, `toInput(values): BreakevenInput`.

Pinned values: example balance `300,000`, years left `27`, closing costs `6,000`, new term `30`. The example's new rate is the tenant's example rate and its current rate is that rate plus one point, so the example always shows a rate drop. `yearsLeft` and `keepYears` accept decimals and convert to whole months. `newTermYears` offers 10, 15, 20, 25, 30.

- [ ] **Step 1: Failing tests:** field ids in order; the example at 7 gives a current rate of 0.08, a new rate of 0.07, 324 months left and a 23-month breakeven; `yearsLeft` of `"22.5"` is 270 months; null result for an empty or junk balance, either rate empty, `"."` or `"7..5"`, years left empty or 0, and `BLANK`; an empty `keepYears` gives no `keep`.
- [ ] **Step 2: Run** (FAIL). **Step 3: Implement.** **Step 4: Run** (PASS). **Step 5: Commit:** `feat(calculators): refinance breakeven fields`.

### Task 3: Component

**Files:** Create `src/calculators/refinance-breakeven/Results.tsx`, `PrintSummary.tsx`, `BreakevenCalculator.tsx`, `BreakevenCalculator.markup.test.tsx`.

**Interfaces (Produces):** `BreakevenResults({ result, disclaimer })`, `BreakevenPrintSummary({ input, result })`, `BreakevenCalculator({ exampleRatePct, exampleRateNote, disclaimer })`.

Behaviour:
- Form: a card "Your loan now" (balance, current rate, years left) and a card "The new loan" (new rate with the config note, term, closing costs), then `AddDetail` with the six detail fields. Ids are prefixed `breakeven-`.
- Results, in order:
  1. Headline card. With a breakeven: eyebrow "Estimated breakeven", "{N} months", and "to recover {closing costs} of closing costs at {savings} a month". With closing costs of zero: "Right away" and "there are no closing costs to recover". With no savings: "No breakeven" and "The new payment is not lower, so the closing costs are not recovered through the payment."
  2. Three `Stat` cards: "Payment now", "New payment", "Monthly savings" (loss colour when negative). When MI or debt payments are in play the sub lines say what is included.
  3. "Interest over the life of each loan": two figures side by side, "Left on the loan now" and "On the new loan", and one sentence: "The new loan costs {X} more in interest, even with the lower payment." or "The new loan costs {X} less in interest."
  4. With `keep`: a `Stat` "Net savings over {N} years" (savings over that time minus closing costs; loss colour when negative).
  5. With a breakeven above zero: `SeriesChart kind="lines"` titled "Savings against closing costs", series "Savings so far" and "Closing costs", by year, long enough to show the crossing (at least 5 years, at most 10).
  6. With cash out above zero: "Includes {cash} of cash out, which is added to the new loan."
  7. Always: "A lower payment is not the whole decision. A new loan restarts the clock, so check the interest over the life of each loan as well as the breakeven." Then the disclaimer.
- No result: "Enter your loan balance, both rates, the years left and the new term to see the breakeven." with `role="status"`.
- Print: `printBelowOnly`, a `PrintSummary` titled "Refinance breakeven estimate" (left "The loans", right "The estimate"), then sentence 7 and the disclaimer.

- [ ] **Step 1: Failing tests** with `renderToStaticMarkup`: the default page shows "23 months", `$2,263`, `$1,996` and `$267`, the config note and the disclaimer; no `NaN|Infinity|undefined` and no banned words, on the default page and for the no-savings and zero-cost cases; every typed field has a label and each choice a legend; one `details` panel; the three headline variants; the interest sentence in both directions; net savings only with keep years; the cash out sentence only with cash out; sentence 7 always; the prompt for a null result; the form is print-hidden and the print summary carries the key figures.
- [ ] **Step 2: Run** (FAIL). **Step 3: Implement.** **Step 4: Run** (PASS). **Step 5: Commit:** `feat(calculators): refinance breakeven calculator component`.

### Task 4: Page, registry, content and verification

**Files:** Create `src/calculators/refinance-breakeven/content.ts`, `src/app/(marketing)/calculators/refinance-breakeven/page.tsx`. Modify `src/calculators/registry.ts`, `registry.test.ts`, `src/app/(marketing)/calculators/routes.test.ts`, `src/content/nav.test.ts`.

Pinned values:
- Registry entry, placed fourth: `{ slug: "refinance-breakeven", path: "/calculators/refinance-breakeven", label: "Refinance breakeven calculator", question: "How long until a refinance pays for itself?", description: "See the new payment, how many months it takes to recover the closing costs, and the interest over the life of each loan.", applyHref: "/apply/refi" }`.
- `content.ts` has no intro. "How this works" must say: breakeven is the closing costs divided by what you save each month; it only counts if you keep the loan that long; a new loan restarts the term, so a lower payment can mean more interest in total; closing costs here are the one total you typed; the figures are principal and interest plus any mortgage insurance entered, with tax and insurance left out because a refinance does not change them. Three or four questions. No formulas, and nothing that tells the visitor to refinance.

- [ ] **Step 1: Failing tests:** registry order `mortgage`, `buydown`, `blended-rate`, `refinance-breakeven`, `investment`; the route renders by default and is not found when switched off; known routes updated.
- [ ] **Step 2: Run** (FAIL). **Step 3: Implement.** **Step 4:** `npm run check` and `npm run build`.
- [ ] **Step 5: Verify on a local production build:** the page returns 200 with "23 months"; the Blended rate page now links to it; the landing page has five cards; capture a desktop screenshot and a print PDF with headless Chrome and read both.
- [ ] **Step 6: Commit:** `feat(calculators): refinance breakeven page and registry entry`.
- [ ] **Step 7:** Final review by a fresh reviewer, one fix pass, then deploy to staging with `scripts/deploy-ec2.sh` (no arguments) for Zachary's test.

---

## Amendment 1: review fixes and the balance after the keep period (2026-11-18)

**From the final review** (ledgered, each fixed test-first): a typed loan too small for the balance plus cash out gives a warning and no figures (`loanShortfall`); "even with the lower payment" depends on the payment, not the savings; debt payments count only when the new loan is larger than the balance (`debtPaymentsIgnored`); a breakeven longer than the new loan is "No breakeven" (`breakevenBeyondTerm`); the interest block says when the new loan is a different size (`loanDifference`); net savings stop counting each payment when its loan ends.

**Asked for by Zachary after testing:** with the keep period, show the expected balance on each loan, because a refinance into a shorter term at a lower rate raises the payment and its benefit is in the balance.

```ts
export type KeepPeriod = {
  months: number; netSavings: number;
  balanceNowLoan: number; balanceNewLoan: number;
  balanceDifference: number;   // now-loan balance minus new-loan balance; positive = less owed with the new loan
  netPosition: number;         // netSavings + balanceDifference + (newLoanAmount - currentBalance)
};
// src/lib/finance.ts
export function remainingBalance(principal: number, annualRatePct: number, termMonths: number, paymentsMade: number): number;
```

**Pinned values**, all recorded from the dashboard engine in `golden.json`:
- $300,000 at 8% with 27 years left into 6.5% for 15 years, kept 10 years: net savings -$48,057.60; owed $251,914.54 on the loan now and $133,563.44 on the new one; $118,351.10 less owed; overall $70,293.50 ahead.
- $250,000 at 7.25% with 22 years left into 6.75% for 30 years, kept 7 years: net savings $18,161.32; $19,135.35 more owed; overall $974.03 behind.
- Sentences: "You would owe {X} less|more with the new loan." and "Counting the payments, the closing costs and what would still be owed, the refinance leaves you {Y} ahead|behind after {N} years."

## Amendment 2: the net after the keep period (2026-11-18)

Amendment 1 added an "overall position" that counted money borrowed on top of the balance as received at the start. Zachary tested it and called it misleading: a refinance with higher payments and more owed read as "$9,060 ahead" because of $20,000 borrowed. His formula replaces it:

**net = monthly savings over the period - closing costs + additional equity**

```ts
export type KeepPeriod = {
  months: number;
  netSavings: number;            // dashboard parity only; not shown
  balanceNowLoan: number; balanceNewLoan: number;
  paymentSavings: number;        // payments avoided minus payments made, plus debt payments paid off
  closingCostsPaid: number;      // paid at closing
  closingCostsFinanced: number;  // min(closing costs, new loan - balance - cash out), never below zero
  cashBorrowed: number;          // new loan - balance - closingCostsFinanced, never below zero
  additionalEquity: number;      // now-loan balance minus new-loan balance
  net: number;                   // paymentSavings - closingCostsPaid + additionalEquity
};
```

`netPosition` and `balanceDifference` in Amendment 1 are superseded by `net` and `additionalEquity`.

**Pinned values:** the shorter-term case is still $70,293.50 ahead (-$42,057.60 - $6,000 + $118,351.10). The cash-out case is $7,688.56 ahead ($54,048.60 - $7,000 - $39,360.04), with its $40,000 reported and not added. The page lists the three lines and the total; it never prints a single sentence that hides the parts.

