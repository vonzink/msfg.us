# Rate Buydown Calculator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Rate buydown calculator at `/calculators/buydown` (spec step 2).

**Architecture:** A TypeScript port of the dashboard's temporary-buydown math, proven by golden cases recorded from the dashboard code, built from the shared kit and wrapped in `CalculatorPage`. One registry entry puts it in the menu, footer, sitemap, landing page and admin switches.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind v4, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-18-public-calculators-design.md`, section "Rate buydown" and "Rules for every calculator". Copy the shape of `src/calculators/mortgage/`.

## Global Constraints

- Follow `AGENTS.md` and `src/calculators/CLAUDE.md`. Build from `src/calculators/shared/`.
- Never use "qualify", "approved", "eligible" or "your rate" in calculator text. Results are labeled estimates.
- Nothing a visitor types is stored or sent.
- Example rate, its note and the disclaimer come from tenant config through the route page.
- Rates are decimals inside `math.ts`. Property tax and insurance are yearly dollars; HOA is monthly.
- Temporary buydowns only: 3-2-1, 2-1, 1-1, 1-0. No permanent (points) buydowns.
- `npm run check` passes at the end of every task. Branch `feat/calculator-buydown`.

## Review Focus

1. **Junk or empty loan amount or rate.** The page shows a short prompt, never `NaN`, `Infinity` or a negative figure. Pinned in Tasks 2 and 3.
2. **A rate lower than the buydown's reduction** (a 2% rate with a 3-2-1). The reduced rate stops at 0%, the page says so, and the cost is still right. Pinned in Task 1.
3. **A 0% rate.** The dashboard shows nothing for it; so does the page. Pinned in Task 1.
4. **Switched off in config.** `/calculators/buydown` is not found. Pinned in Task 4.
5. **The reduced payment shown without the full one.** Every view that shows a reduced payment shows the full payment as prominently. Pinned in Task 3.

---

### Task 1: Golden cases and the buydown math

**Files:**
- Create: `scripts/calculators/golden-buydown.mjs`, `src/calculators/buydown/golden.json`, `src/calculators/buydown/math.ts`, `src/calculators/buydown/math.test.ts`
- Modify: `scripts/README.md`

**Interfaces (Produces):**

```ts
export type BuydownType = "3-2-1" | "2-1" | "1-1" | "1-0";
export type BuydownInput = {
  loanAmount: number; annualRate: number; termYears: number; type: BuydownType;
  yearlyTax: number; yearlyInsurance: number; monthlyHoa: number;
};
export type BuydownPeriod = {
  /** 1, 2 or 3 for a reduced year; the first full-rate year for the last period. */
  year: number;
  reduced: boolean;
  rate: number;
  principalAndInterest: number;
  /** Principal and interest plus tax, insurance and HOA. */
  total: number;
  monthlySavings: number;
  yearlySavings: number;
};
export type BuydownResult = {
  /** The reduced years in order, then one full-rate period. */
  periods: BuydownPeriod[];
  full: BuydownPeriod;
  /** Money needed up front to fund the buydown: the sum of the reduced years' savings. */
  totalCost: number;
  /** True when a reduced rate was stopped at 0%. */
  flooredAtZero: boolean;
};
/** null for a loan amount or rate of zero or less, a rate above 25%, or a term outside 1 to 40 whole years. */
export function calculateBuydown(input: BuydownInput): BuydownResult | null;
```

**Source to port:** `getBuydownRates` and `calculateBuydownResults` in `msfg-calc/legacy/buydown-calc/buydown.js`. The dashboard works in percent and does not round; `math.ts` works in decimals, uses `monthlyPayment` from `src/lib/finance.ts`, and does not round either. Money is rounded to cents only where it is compared or displayed.

- [ ] **Step 1: Write the generator.** Same pattern as `golden-mortgage.mjs`: load `legacy/buydown-calc/buydown.js` in a `node:vm` context with a stub `document` (`addEventListener` only), call `calculateBuydownResults` with `includeTaxes` and `includeInsurance` true, and write `{ source, cases: [{ name, input, expected }] }`. `expected` holds, rounded to cents: `totalCost`, and for each shown period `year`, `ratePct`, `principalAndInterest`, `total`, `monthlySavings`, `yearlySavings`. Shown periods follow the dashboard: 3-2-1 shows years 1, 2, 3 and 4; 2-1 and 1-1 show 1, 2 and 3; 1-0 shows 1 and 2.

| name | inputs |
|---|---|
| `2-1` | loan 320000, rate 0.07, 30y |
| `3-2-1` | loan 320000, rate 0.07, 30y |
| `1-1` | loan 320000, rate 0.07, 30y |
| `1-0` | loan 320000, rate 0.07, 30y |
| `2-1-with-costs` | `2-1` plus tax 4800, insurance 1800, HOA 100 |
| `3-2-1-fifteen-year` | loan 250000, rate 0.0625, 15y |
| `3-2-1-floored` | loan 200000, rate 0.02, 30y (year 1 at 0%) |

- [ ] **Step 2: Run it** and hand-check `2-1`: full payment $2,128.97; year 1 at 5% is $1,717.83; year 2 at 6% is $1,918.56; cost is 12 × ($411.14 + $210.41) = $7,458.60, within a few cents.
- [ ] **Step 3: Write the failing tests:** one `it.each` over the golden cases comparing every expected number after `roundCents`; `flooredAtZero` is true only for `3-2-1-floored`; `totalCost` equals the sum of the reduced periods' `yearlySavings`; null for loan 0, loan -1, rate 0, rate -0.01, rate 0.26, term 0, term 12.5, and `NaN` in loan or rate; junk or negative tax, insurance and HOA count as zero.
- [ ] **Step 4: Run.** Expected: FAIL, module not found.
- [ ] **Step 5: Implement** `math.ts` with the assumptions comment block: temporary buydowns only; the loan is repaid on the full-rate schedule and the buydown fund pays the difference; the cost is the simple sum of the monthly differences, with no interest earned on the fund; tax, insurance and HOA do not change.
- [ ] **Step 6: Run.** Expected: PASS. Document the script in `scripts/README.md`. Commit: `feat(calculators): buydown math ported from the dashboard, with golden cases`.

### Task 2: Buydown fields

**Files:** Create `src/calculators/buydown/fields.ts`, `fields.test.ts`.

**Interfaces (Produces):** `FRONT_FIELDS` (ids `loanAmount`, `rate`, `termYears`, `buydownType`), `DETAIL_FIELDS` (ids `yearlyTax`, `yearlyInsurance`, `monthlyHoa`), `exampleValues(exampleRatePct): Values`, `BLANK: Values`, `toInput(values: Values): BuydownInput`.

Pinned values: example loan `320,000`, term `30`, type `2-1`, detail fields empty. `termYears` offers 10, 15, 20, 25, 30. `buydownType` offers the four types labeled `3-2-1`, `2-1`, `1-1`, `1-0`, with the hint "The numbers are how many points the rate drops in each of the first years." A rate with no digit in it is not entered (`NaN`), as in the Mortgage calculator.

- [ ] **Step 1: Failing tests:** the field ids above in order; `toInput(exampleValues(7))` gives loan 320000, rate 0.07, type `2-1`; `calculateBuydown(toInput(...))` is null for loan `"abc"`, loan `""`, rate `""`, rate `"."`, rate `"99"`, rate `"-5"`, and `BLANK`; an unknown `buydownType` falls back to `2-1`.
- [ ] **Step 2: Run** (FAIL). **Step 3: Implement.** **Step 4: Run** (PASS). **Step 5: Commit:** `feat(calculators): buydown calculator fields`.

### Task 3: Buydown calculator component

**Files:** Create `src/calculators/buydown/Results.tsx`, `BuydownCalculator.tsx`, `BuydownCalculator.markup.test.tsx`.

**Interfaces (Produces):** `BuydownResults({ result, disclaimer })` and `BuydownCalculator({ exampleRatePct, exampleRateNote, disclaimer })`.

Behaviour:
- Form: one card "The loan" with the four front fields, then `AddDetail` with the three detail fields. Field ids are prefixed `buydown-`.
- Results, in order:
  1. Headline card: eyebrow "Estimated buydown cost", the cost in whole dollars, and "Paid up front to fund the lower payments. A seller, builder or lender credit often covers it."
  2. Two `Stat` cards side by side at equal size: "Year 1 payment" and "Payment from year N", where N is the first full-rate year. The second card's sub line is "the full payment, for the rest of the loan".
  3. A table captioned "Payment by year": Period ("Year 1", "Year 2", "Year 3 onward"), Rate, Monthly payment, Full payment, Monthly savings. The full-rate row shows a dash for savings.
  4. `SeriesChart kind="bars"` titled "Monthly payment by year", two series: "With buydown" and "Full payment".
  5. When `flooredAtZero`: "A rate cannot go below 0%, so the lowest year is shown at 0%."
  6. "When the reduced period ends, the payment returns to {full total} a month." Then the disclaimer.
- No result: "Enter a loan amount and an interest rate to see what a buydown costs." with `role="status"`.

- [ ] **Step 1: Failing tests** with `renderToStaticMarkup`: the default page contains `$7,459`, `$1,718`, `$1,919` and `$2,129`, the note and the disclaimer; the "who pays" sentence and the "returns to" sentence are present; the full payment appears at least as many times as the year 1 payment; no `NaN|Infinity|undefined` and none of the banned words; every typed field has a matching `<label for>` and each choice a `<legend>`; a `3-2-1` result has four table rows and a `1-0` has two; a null result shows the prompt and no table; the floored case shows the 0% sentence.
- [ ] **Step 2: Run** (FAIL). **Step 3: Implement.** **Step 4: Run** (PASS). **Step 5: Commit:** `feat(calculators): buydown calculator component`.

### Task 4: Page, registry, content and verification

**Files:**
- Create: `src/calculators/buydown/content.ts`, `src/app/(marketing)/calculators/buydown/page.tsx`
- Modify: `src/calculators/registry.ts`, `src/calculators/registry.test.ts`, `src/app/(marketing)/calculators/routes.test.ts`, `src/content/nav.test.ts` and `src/lib/siteMap.test.ts` (known routes)

Pinned values:
- Registry entry, placed second: `{ slug: "buydown", path: "/calculators/buydown", label: "Rate buydown calculator", question: "What does a rate buydown cost?", description: "See the lower payments a temporary buydown gives in the first years, what it costs up front, and the payment after it ends.", applyHref: "/apply/buy" }`.
- `content.ts` has no intro. "How this works" must say: the rate and payment are lower for the first one to three years and then return to the full amount for the rest of the loan; the cost is paid up front into an account that makes up the difference each month; a seller, builder or lender credit often covers it; the loan itself is written at the full rate; only temporary buydowns are covered here. Three or four questions specific to buydowns. No formulas.

- [ ] **Step 1: Failing tests:** registry order is `mortgage`, `buydown`, `investment`; in `routes.test.ts` the buydown page renders by default and is not found when `disabled` contains `"buydown"`; add the route to the known-route sets.
- [ ] **Step 2: Run** (FAIL). **Step 3: Implement** the entry, `content.ts` and the route page, copied from the mortgage route.
- [ ] **Step 4: Run** `npm run check` and `npm run build`. Expected: PASS and `/calculators/buydown` in the build output.
- [ ] **Step 5: Verify on a local production build:** `/calculators/buydown` returns 200 with `$7,459`; `/calculators` shows three cards; the sitemap lists it; capture a desktop screenshot and a print PDF with headless Chrome and read both.
- [ ] **Step 6: Commit:** `feat(calculators): rate buydown page and registry entry`.
- [ ] **Step 7: Deploy to staging** with `scripts/deploy-ec2.sh` (no arguments) for Zachary's test, and repeat Step 5's URL checks there.
