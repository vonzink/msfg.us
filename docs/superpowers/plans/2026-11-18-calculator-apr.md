# APR Calculator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the APR calculator at `/calculators/apr` (spec step 7).

**Architecture:** A port of the APR math in `msfg-calc/public/js/calculators/apr.js` (`buildPaymentStream`, `monthsToLtvThreshold`, `pvStream`, `solveApr`, the prepaid-interest default and the amount-financed sum in `calculate()`), proven by golden cases recorded by driving that file with a stand-in page. The dashboard classifies some sixty itemized fees through a catalog, for conventional, FHA and VA loans. The public page assumes a conventional loan and takes lender fees as one total, with points, a lender credit, mortgage insurance and prepaid interest behind "Add detail". Built from the shared kit and wrapped in `CalculatorPage`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind v4, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-18-public-calculators-design.md`, sections "APR" and "Rules for every calculator". Copy the shape of `src/calculators/budget/` and `src/calculators/rent-vs-buy/` (the two most recent, with their review lessons). Read the handoff note's "Decisions that are easy to get wrong" first.

## Global Constraints

- Follow `AGENTS.md` and `src/calculators/CLAUDE.md`. Build from `src/calculators/shared/`. Never import from another calculator's folder.
- Never use "qualify", "approved", "eligible", "your rate", "your APR" or "should" in page text. The APR shown is an estimate worked out from numbers the visitor typed; it is never presented as an offer or a quote. **Required wording:** the result is an estimate and the official APR is the one on the Loan Estimate.
- Nothing a visitor types is stored or sent.
- The example interest rate, its note and the disclaimer come from tenant config through the route page.
- Rates are decimals inside `math.ts`; the term is months. Use `parseRate` for typed percents. An unreadable percent is "not entered", never 0%.
- **Which empty boxes count as zero** (lesson from Home budget: an empty box shows a grey "0" and Zachary reads it as zero): the loan amount and the interest rate must be entered. Empty lender fees, points, lender credit and mortgage insurance count as 0 and the page calculates. Empty prepaid interest means the automatic 15 days. Junk text is never 0 and gets a prompt naming the box and its range (`promptText`, limits exported from `math.ts`). Money boxes where a typed 0 is an answer use `keepZero`.
- The fee breakdown is always visible beside the APR, so a $0 line is seen, never hidden.
- Use `monthlyPayment` from `src/lib/finance.ts`. Never print "-$0". Percents are shown to three decimals, as on the dashboard.
- Never change anything in `/Users/zacharyzink/MSFG/WebProjects/msfg-calc`.
- `npm run check` passes at the end of every task. Branch `feat/calculator-apr`. Do not push. Do not merge.

## Decisions made by the builder, to raise with Zachary on staging

1. **Lender fees are all counted in the APR.** The dashboard decides fee by fee; the public page has one total, described as "fees charged by the lender to make the loan, such as origination, underwriting and processing". Third-party costs that are not finance charges (appraisal, title, recording) are named in the hint as left out.
2. **A lender credit comes off the lender fees and prepaid interest, never below zero, and does not come off points**, as on the dashboard.
3. **Mortgage insurance needs a home value.** The dashboard charges it for the whole loan when no value is given. The public page shows no result and asks for the home value when mortgage insurance is entered without one.
4. **No finance charge means an APR equal to the interest rate.** With no fees the dashboard's solver can stop a hair off the rate; the public page shows the rate itself when the fees counted are zero and there is no mortgage insurance. Recorded in `math.ts`.
5. **Results follow the dashboard's cards:** APR beside the interest rate and the gap, monthly principal and interest, amount financed, finance charge, and the fees the APR counts as a table.
6. **Seller credit, FHA and VA rules, the fee catalog and the mortgage insurance matrix are left out**, per the spec.

## Review Focus

1. **The APR never reads as an offer**, and the Loan Estimate sentence is beside the result and on the printout.
2. **The fees the APR counts are always shown line by line**, prepaid interest included, and add up to the figure used.
3. **Mortgage insurance:** ends at 78% of the home value; a loan already at or under 78% pays none; no home value gives a prompt.
4. **Edges:** 0% rate; no fees; a credit larger than the fees; points of 0 and of several percent; fees larger than the loan; junk in every box. No `NaN`, `Infinity`, "-$0" or an APR below the interest rate.
5. **Switched off in config:** not found, absent from menu, sitemap and landing page.

---

### Task 1: Golden cases and the math

**Files:** Create `scripts/calculators/golden-apr.mjs`, `src/calculators/apr/golden.json`, `math.ts`, `math.test.ts`. Modify `scripts/README.md`.

**Interfaces (Produces):**

```ts
export const PREPAID_INTEREST_DAYS = 15;
export const MI_END_LTV = 0.78;
export const RATE_LIMIT = { low: 0, high: 0.3 } as const;      // rate must be from 0 to under 30%
export const POINTS_LIMIT = { low: 0, high: 0.1 } as const;    // points from 0 to 10% of the loan
export type AprInput = {
  loanAmount: number; rate: number; termMonths: number;
  lenderFees: number; points: number; lenderCredit: number;
  monthlyMi: number; homeValue: number;
  /** NaN means "use the automatic 15 days". */
  prepaidInterest: number;
};
export type AprResult = {
  apr: number;
  /** apr minus rate. */
  spread: number;
  principalAndInterest: number;
  fees: {
    lenderFees: number; pointsAmount: number; prepaidInterest: number; prepaidInterestIsAutomatic: boolean;
    /** The part of the credit that was used, as a positive number. */
    lenderCreditApplied: number;
    /** pointsAmount + max(0, lenderFees + prepaidInterest - lenderCredit). */
    total: number;
  };
  amountFinanced: number; financeCharge: number; totalOfPayments: number;
  /** Payments that carry mortgage insurance; 0 when none. */
  miMonths: number;
};
/** null when the loan amount is not above zero, the rate or term is unusable, a figure is negative or NaN where a number is required, mortgage insurance is entered without a home value, or the fees leave nothing financed. */
export function calculateApr(input: AprInput): AprResult | null;
```

**Source to port:** in `apr.js`, `autoCalcPrepaidInterest` (loan x rate x 15 / 365, to cents), `monthsToLtvThreshold`, `buildPaymentStream`, `pvStream`, `solveApr` (bisection between 0.01% and 100%, 100 rounds) and the sums in `calculate()` and `classifyFees()` for a conventional loan. Follow its order of operations. State decisions 1 to 4 and 6 in the comment block at the top of `math.ts`.

- [ ] **Step 1: Write the generator**, following `golden-budget.mjs`: load `utils.js`, `apr-fee-catalog.js`, `apr-mi-matrix.js` and `apr.js` in a `node:vm` stand-in page, run the file's own setup, keep the loan type conventional, and enter each case through the listeners the page binds: the loan fields, one catalog fee that the catalog counts in the APR for a conventional loan (read the catalog and name the fee you used in the header comment), `prepaid_interest` when the case overrides it, `monthly_borrower_paid_pmi` with the property value, points and lender credit. Make sure the dashboard's automatic mortgage insurance from its matrix does not add an amount the case did not ask for. Record what the page displays: APR and note rate (three decimals), spread, monthly payment, amount financed, finance charges, total upfront costs.

| name | inputs |
|---|---|
| `example` | loan 320000; 7%; 360 months; lender fees 4000 |
| `no-fees` | `example` with lender fees 0 and prepaid interest 0 |
| `points` | `example` with points 1% |
| `credit-smaller` | `example` with lender credit 1500 |
| `credit-larger` | `example` with lender credit 9000 |
| `with-mi` | loan 380000; home value 400000; 6.75%; 360; lender fees 3500; mortgage insurance 160 |
| `mi-not-needed` | loan 300000; home value 400000; 6.75%; 360; lender fees 3500; mortgage insurance 160 |
| `fifteen-year` | loan 250000; 6.25%; 180; lender fees 3000; points 0.5% |
| `prepaid-typed` | `example` with prepaid interest 1800 |
| `zero-rate` | loan 200000; 0%; 360; lender fees 2000 |

- [ ] **Step 2: Run it** and hand-check `example`: principal and interest $2,128.97; prepaid interest $920.55; fees counted $4,920.55; amount financed $315,079.45; APR between 7.14% and 7.17%.
- [ ] **Step 3: Failing tests:** `it.each` over the golden cases: APR and spread to three decimals of a percent, dollar figures to the cent; `miMonths` for the two mortgage insurance cases (hand-checked with a month-by-month script); the fee breakdown adds up; decision 4; each null case; a credit never makes the fees negative; the APR is never below the rate.
- [ ] **Step 4: Run** (FAIL). **Step 5: Implement.** **Step 6: Run** (PASS), document the script, commit: `feat(calculators): APR math ported from the dashboard, with golden cases`.

### Task 2: Fields

**Files:** Create `src/calculators/apr/fields.ts`, `fields.test.ts`.

**Interfaces (Produces):** `FRONT_FIELDS` (ids `loanAmount`, `rate`, `termYears`, `lenderFees`), `DETAIL_FIELDS` (ids `points`, `lenderCredit`, `monthlyMi`, `homeValue`, `prepaidInterest`), `exampleValues(exampleRatePct)`, `BLANK`, `toInput(values)`, `entryFaults(values)` for junk and negative boxes.

Pinned values: loan `320,000`; rate from config; term choice 10, 15, 20, 25, 30, default 30; lender fees `4,000`; detail fields empty. Labels: "Loan amount", "Interest rate", "Loan term", "Lender fees" (hint "Fees charged by the lender to make the loan, such as origination, underwriting and processing, as one total. Leave out the appraisal, title and recording costs."), "Discount points" (pct, hint "As a percent of the loan amount."), "Lender credit", "Mortgage insurance" (hint "Per month."), "Home value" (hint "Needed to work out when mortgage insurance ends."), "Prepaid interest" (hint "Leave empty to use 15 days of interest.").

- [ ] **Step 1: Failing tests:** field ids in order; the example at 7 gives the Task 1 `example` input and its golden APR; `BLANK` and an empty loan amount or rate give null; empty lender fees, points, credit and mortgage insurance count as 0; empty prepaid interest is automatic and a typed 0 is 0; junk in each box is reported by `entryFaults` and is never 0; mortgage insurance without a home value gives null.
- [ ] **Step 2: Run** (FAIL). **Step 3: Implement.** **Step 4: Run** (PASS), `npm run check`. **Step 5: Commit:** `feat(calculators): APR fields`.

### Task 3: Component

**Files:** Create `src/calculators/apr/Results.tsx`, `PrintSummary.tsx`, `AprCalculator.tsx`, `AprCalculator.markup.test.tsx`, and a jsdom test for Clear and typed zeros.

**Interfaces (Produces):** `AprResults({ input, result, disclaimer })`, `promptText(...)`, `gapSentence(result)`, `AprPrintSummary(...)`, `AprCalculator({ exampleRatePct, exampleRateNote, disclaimer })`.

Behaviour:
- Form: a card "The loan" (loan amount, interest rate with the config note, loan term), a card "Fees" (lender fees), then `AddDetail` with the five detail fields. Ids are prefixed `apr-`.
- Results, in order:
  1. Headline card. Eyebrow "Estimated APR". The APR to three decimals. Sub line: "Interest rate {rate}".
  2. The gap sentence: "The APR is {x} percentage points above the interest rate, because it counts {fees} in fees." With mortgage insurance: "...in fees and {N} months of mortgage insurance." With nothing counted: "With no fees counted, the APR is the same as the interest rate."
  3. A card "Fees the APR counts", a table: Lender fees; Discount points ({p}% of the loan), when above zero; Prepaid interest (15 days) or Prepaid interest; Lender credit, subtracted, when used; total row "Fees counted". When the credit is larger than the fees it comes off: "{unused} of the lender credit is not used here. A credit lowers these fees to zero at most."
  4. A card "The loan in numbers", a table: Interest rate; Estimated APR; Monthly principal and interest; Mortgage insurance ("{amount} a month for {N} months"), when entered; Amount financed; Finance charge over the loan.
  5. "What APR is": "APR is the yearly cost of a loan with certain fees counted in, not only the interest. It lets you compare loans that have different rates and fees. It does not change the monthly payment."
  6. Always, in semibold: "This is an estimate. The official APR is the one on your Loan Estimate." Then the disclaimer.
- No result: the named prompts, `role="status"`. Missing loan amount or rate: "Enter the loan amount and the interest rate to see the estimated APR."
- Print: `printBelowOnly`, a `PrintSummary` titled "APR estimate" (left "The loan": the inputs in use; right "The estimate": APR, interest rate, gap, payment, amount financed, finance charge), then the fees table, sentence 6 and the disclaimer.
- Phone: the pinned bar, "Estimated APR" over the figure.

- [ ] **Step 1: Failing tests:** the default page shows the golden APR, "7.000%", `$2,129`, `$920.55` or its whole-dollar form in the fees table, the fees total, the Loan Estimate sentence, the config note and the disclaimer; no `NaN|Infinity|undefined|-\$0` and no banned words in the default, no-fees, credit-larger, with-mi and zero-rate states; the three gap sentences; the fee rows appear only as specified and add up to the total shown; the unused-credit sentence; the prompts, including mortgage insurance without a home value; every typed field has a label and the choice a legend; one `details` panel; Clear then loan amount and rate alone gives a result; a typed 0 in prepaid interest survives blur and counts; the printed part carries the APR, the fees table and the Loan Estimate sentence.
- [ ] **Step 2: Run** (FAIL). **Step 3: Implement.** **Step 4: Run** (PASS), `npm run check`. **Step 5: Commit:** `feat(calculators): APR calculator component`.

### Task 4: Page, registry, content and verification

**Files:** Create `src/calculators/apr/content.ts`, `content.test.ts`, `src/app/(marketing)/calculators/apr/page.tsx`. Modify `src/calculators/registry.ts`, `registry.test.ts`, `src/app/(marketing)/calculators/routes.test.ts`, `src/content/nav.test.ts`.

Pinned values:
- Registry entry, placed seventh, before `investment`: `{ slug: "apr", path: "/calculators/apr", label: "APR calculator", question: "What is the APR on a loan once fees are counted?", description: "See how lender fees, points and mortgage insurance turn an interest rate into an APR.", applyHref: "/apply/buy" }`.
- Page metadata title "APR Calculator".
- `content.ts`: no intro unless the page reads bare. "How this works" in plain language with no formulas: the interest rate sets the payment; the APR spreads certain up-front costs over the loan as if they were interest; which costs are counted here and which are not; the loan is assumed to be a conventional fixed-rate loan; mortgage insurance is counted until the balance reaches 78% of the home value; prepaid interest defaults to 15 days and is shown; a lender credit lowers the fees counted, never below zero; the official figure is on the Loan Estimate. Three or four questions (why the APR is higher than the rate; whether a lower APR is always the better loan, answered without advice; what a Loan Estimate is; why the APR here can differ from a lender's).

- [ ] **Step 1: Failing tests:** registry order `mortgage`, `buydown`, `blended-rate`, `refinance-breakeven`, `rent-vs-buy`, `budget`, `apr`, `investment`; the route renders by default and is not found when switched off; known routes and nav updated; `content.ts` has no banned words, dashes or formula characters and names the Loan Estimate.
- [ ] **Step 2: Run** (FAIL). **Step 3: Implement.** **Step 4:** `npm run check` and `npm run build` (needs `npm run db:up`).
- [ ] **Step 5: Verify on a local production build:** the page returns 200 with the headline; the landing page has eight cards; desktop screenshot and print PDF with headless Chrome, both read. HTTP checks use `ctx_execute` with `fetch`, not `curl`.
- [ ] **Step 6: Commit:** `feat(calculators): APR page and registry entry`.
- [ ] **Step 7:** Final review by a fresh reviewer, one fix pass, then deploy to staging with `scripts/deploy-ec2.sh` (no arguments) for Zachary's test.

---

## Amendment 1: review fixes (2026-11-18)

From the final review, each fixed test-first (commit `5f96136`). The reviewer's own solver agreed with `calculateApr` to the third decimal on about a million cases for loans of $5,000 and up.

- The fees table adds up to the cent as shown: every row is rounded to cents and the total is built from the rounded rows.
- The lender fees hint now covers a mortgage broker's fees, administration, rate lock and similar fees.
- With the lender fees box empty the page says "No lender fees are entered." beside the result, in the phone bar and in print.
- The call to action reads "Want to go through your numbers with someone?" on this page.
- The unused-credit sentence says the credit does not come off discount points.
- "What APR is" spells out annual percentage rate; "How this works" says what the amount financed and the finance charge are.
- The solver starts from 0, so a 0% loan with small fees shows its true APR; the smallest loan taken is $1,000; a note shows when the loan is larger than the home value; the printout says a conventional fixed-rate loan is assumed.

**Open with Zachary:** whether lender's title insurance (and the courier and technology fees) belong in the lender fees, as the dashboard's catalog counts them for a conventional loan; and the required sentence "The official APR is the one on your Loan Estimate", given that the Loan Estimate's APR is an estimate and the Closing Disclosure carries the final figure.

**Deferred minors:** the shared money box turns "4k" into "4" on blur; the switch between prompt and result may not be announced; the opening example is not marked as an example beyond the rate note.

## Amendment 2: Zachary's decisions (2026-11-18)

- **Lender's title insurance is counted** in the lender fees, with technology and courier fees, following the dashboard's catalog (commit `fabee17`). The hint was checked line by line against `apr-fee-catalog.js`. Three lender charges the catalog leaves out (MERS registration, AUS and verification of employment fees) are covered by the hint's "everything the lender charges"; a small difference in the visitor's favour of a higher APR.
- **"Official" is removed** everywhere. The result line reads "This is an estimate. The APR for your loan is the one on your Loan Estimate." The word is in the calculator's banned-word scan.
