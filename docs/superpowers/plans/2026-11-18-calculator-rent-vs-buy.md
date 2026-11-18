# Rent vs Buy Calculator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Rent vs buy calculator at `/calculators/rent-vs-buy` (spec step 5).

**Architecture:** A port of `calculate()` in `msfg-calc/public/js/calculators/buy-vs-rent.js`, proven by golden cases. The dashboard gives one answer at the end of the analysis period. The public page also needs the path year by year and the year buying pulls ahead, so the model runs the same formula for every year from 1 to the stay and the golden script records the dashboard's answer for each of those years. Five inputs up front, eight behind "Add detail", and the assumptions in use printed under the result whether or not the detail section is open. Built from the shared kit and wrapped in `CalculatorPage`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind v4, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-18-public-calculators-design.md`, sections "Rent vs buy" and "Rules for every calculator". Copy the shape of `src/calculators/refinance-breakeven/`.

## Global Constraints

- Follow `AGENTS.md` and `src/calculators/CLAUDE.md`. Build from `src/calculators/shared/`. Never import from another calculator's folder.
- Never use "qualify", "approved", "eligible" or "your rate" in calculator text. Results are labeled estimates. Nothing may read as a recommendation to buy or to rent: the page says which path "comes out ahead on these numbers", never what the visitor should do.
- Nothing a visitor types is stored or sent.
- The example interest rate, its note and the disclaimer come from tenant config through the route page.
- Rates are decimals inside `math.ts`; the loan term is months inside `math.ts`. Use `parseRate` for every typed rate. An unreadable or empty rate is "not entered" and gives no result; a typed 0 is a real 0%.
- Use `monthlyPayment` and `remainingBalance` from `src/lib/finance.ts` (both take the rate as a percent and do not round). Do not write a second payment formula. Sums stay unrounded and are rounded to cents only for comparison and display, as on the dashboard.
- Never change anything in `/Users/zacharyzink/MSFG/WebProjects/msfg-calc`.
- `npm run check` passes at the end of every task. Branch `feat/calculator-rent-vs-buy`. Do not push. Do not merge.

## Decisions made by the builder, to raise with Zachary on staging

1. **Fixed cost inflation is 3% a year**, applied to insurance and maintenance and stated on the page. The spec says to start from the dashboard default, but the dashboard field has always defaulted to 0. `COST_INFLATION` is one constant in `math.ts`.
2. **Mortgage payments stop when the loan ends.** The dashboard charges `payment x 12` for every year of the analysis even past the loan term (a 15-year loan over 20 years is charged 20 years of payments). The public model counts at most `termMonths` payments. The two agree whenever the stay is no longer than the term. Recorded in `math.ts`.
3. **The year-by-year path** is the dashboard formula run for each year: "if you sold and stopped at the end of year N". No new accounting.
4. **Clear** empties the typed amounts but puts the four rate assumptions (appreciation, rent increase, selling costs, investment return) back to their starting values, because a comparison at 0% across the board is nobody's intent. Property tax, insurance and maintenance clear to empty, count as $0, and the assumptions list says so.
5. **Not modelled, and said so on the page:** mortgage insurance, closing costs on the purchase, HOA dues, renters insurance, income tax effects, and investing any monthly difference between the two paths. As on the dashboard, the renter's side grows only the down payment. With less than 20% down the page adds a line that mortgage insurance is not included.
6. **A tie** (difference of zero to the cent) reads "The two come out even"; the dashboard words it as renting ahead.

## Review Focus

1. **Assumptions rule.** Every assumption in use is under the result with "Add detail" closed, and on the printout, and it is the value the math used, including after Clear and when a cost is left empty.
2. **Stay longer than the loan term** (15-year loan, 20-year stay). Payments stop, balance is zero, nothing negative. Pinned in Task 1.
3. **Low or zero down payment, and a down payment equal to the price.** Zero down works; under 20% shows the mortgage insurance line; a down payment above the price gives a prompt. Pinned in Tasks 1 to 3.
4. **Headline never reads as advice** and never contradicts the pull-ahead sentence: renting ahead, even, buying ahead from year 1, buying ahead only after the stay, never within 40 years, and ahead early then behind again. Pinned in Task 3.
5. **Junk or empty rates, including the four assumption rates.** A prompt, never `NaN` and never a silent 0%. Pinned in Task 2.
6. **Switched off in config.** Not found, and absent from menu, sitemap and landing page. Pinned in Task 4.

---

### Task 1: Golden cases and the math

**Files:** Create `scripts/calculators/golden-rent-vs-buy.mjs`, `src/calculators/rent-vs-buy/golden.json`, `math.ts`, `math.test.ts`. Modify `scripts/README.md`.

**Interfaces (Produces):**

```ts
/** Insurance and maintenance rise by this much a year. A fixed assumption, stated on the page. */
export const COST_INFLATION = 0.03;
/** The longest stay, and how far ahead the model looks for the year buying pulls ahead. */
export const MAX_YEARS = 40;

export type RentVsBuyInput = {
  monthlyRent: number; homePrice: number;
  /** Dollars. */
  downPayment: number;
  rate: number;
  /** Whole years, 1 to MAX_YEARS. */
  stayYears: number;
  termMonths: number;
  yearlyTax: number; yearlyInsurance: number; yearlyMaintenance: number;
  appreciation: number; rentIncrease: number; sellingCosts: number; investmentReturn: number;
};
export type YearPoint = {
  year: number; netCostBuying: number; netCostRenting: number;
  /** Renting's net cost minus buying's. Positive means buying is ahead. */
  difference: number;
};
export type RentVsBuyResult = {
  loanAmount: number; monthlyPayment: number;
  buying: {
    downPayment: number; mortgagePayments: number; propertyTax: number; insurance: number; maintenance: number;
    /** The five lines above added up. */
    totalPaid: number;
    homeValue: number; loanBalance: number; sellingCosts: number;
    /** Home value minus loan balance minus selling costs. Can be negative. */
    equity: number;
    /** totalPaid minus equity. */
    netCost: number;
  };
  renting: {
    rentPaid: number;
    /** Monthly rent in the last year of the stay. */
    lastMonthlyRent: number;
    downPaymentGrowth: number;
    /** rentPaid minus downPaymentGrowth. */
    netCost: number;
  };
  /** At the end of the stay: renting's net cost minus buying's, rounded to cents. */
  difference: number;
  ahead: "buying" | "renting" | "even";
  /** Years 1 to stayYears. */
  years: YearPoint[];
  /** First year, 1 to MAX_YEARS, in which buying is ahead. null when it never is. */
  pullAheadYear: number | null;
};
/**
 * null when there is nothing to compare: rent or price not above zero; down payment negative or
 * above the price; rate NaN, negative or 30% and above; stay not a whole number from 1 to MAX_YEARS;
 * term not above zero; any of the four assumption rates NaN; appreciation, rent increase or
 * investment return outside -20% to 30%; selling costs outside 0 to 20%.
 * Negative or junk tax, insurance and maintenance count as zero.
 */
export function calculateRentVsBuy(input: RentVsBuyInput): RentVsBuyResult | null;
```

**Source to port:** `calculate()` in `msfg-calc/public/js/calculators/buy-vs-rent.js`. Property tax in year y (from 0) is `yearlyTax x (1 + appreciation)^y`; insurance and maintenance are multiplied by `(1 + COST_INFLATION)^y`; rent paid is twelve months at each year's rent, rising after each year; equity is `sale price - balance - sale price x selling costs`; the renter's side is `down x (1 + return)^years - down`. The one deliberate difference is decision 2 above: count `min(year x 12, termMonths)` payments. State both in the comment block at the top of `math.ts`, with what is not modelled (decision 5).

- [ ] **Step 1: Write the generator**, following `golden-blended-rate.mjs`. The dashboard function reads the page and writes to it, so give it a stand-in page in a `node:vm` context: load `public/js/shared/utils.js` for the real `MSFG.parseNum` and `MSFG.formatCurrency`, then `buy-vs-rent.js`; capture the `DOMContentLoaded` handler and run it; set `downToggle` and `taxToggle` to `dataset.mode = "dollar"`; set the input values (rates as percents, `costInflation` as 3, `termBuy` in years); fire the captured `input` listener; read back the displayed text. For each case run every `period` from 1 to the stay. Record, as numbers parsed from the displayed currency: at the stay, `monthlyPayment`, `downPayment`, `mortgagePayments`, `propertyTax`, `insurance`, `maintenance`, `totalPaid`, `equity`, `netCostBuying`, `rentPaid`, `downPaymentGrowth`, `netCostRenting`; and `differenceByYear`, signed from the recommendation text (positive when it reads "Buying saves you").

| name | inputs |
|---|---|
| `example` | rent 2400; price 400000; down 80000; 7%; stay 7; term 360; tax 4800; insurance 1800; maintenance 4000; appreciation 3%; rent increase 3%; selling 6%; return 5% |
| `zero-rate` | `example` at 0% |
| `zero-down` | `example` with down 0 |
| `empty-optionals` | `example` with tax, insurance, maintenance 0 and all four assumption rates 0 |
| `renting-ahead` | `example` with rent 1600, stay 3 |
| `fifteen-year-full-term` | `example` with term 180, stay 15 |
| `thirty-years` | `example` with stay 30 |

- [ ] **Step 2: Run it** and hand-check `example`: payment $2,128.97; after 7 years buying ahead by about $18,816; year 1 renting ahead by about $20,817; the sign turns in year 5.
- [ ] **Step 3: Failing tests:** `it.each` over the golden cases, every recorded figure to the cent and `years[i].difference` against `differenceByYear`; `ahead` and `pullAheadYear` (5) for `example`; `pullAheadYear` is past the stay for `renting-ahead` and `ahead` is "renting"; a 15-year loan over a 20-year stay has `mortgagePayments` of exactly `payment x 180` and `loanBalance` 0 (hand-checked, decision 2); down payment equal to the price gives a payment of 0 and a result; null for each rejection in the doc comment; junk or negative tax, insurance and maintenance count as zero; a tie is "even".
- [ ] **Step 4: Run** (FAIL). **Step 5: Implement.** **Step 6: Run** (PASS), document the script in `scripts/README.md`, commit: `feat(calculators): rent vs buy math ported from the dashboard, with golden cases`.

### Task 2: Shared down payment switch, and fields

**Files:** Modify `src/calculators/shared/fields.ts`, `shared/fields.test.ts`, `src/calculators/mortgage/fields.ts` and its importers. Create `src/calculators/rent-vs-buy/fields.ts`, `fields.test.ts`.

`downPaymentField(unit)` and `switchDownUnit(values, unit)` live in `mortgage/fields.ts` and this calculator needs both. Move them to `shared/fields.ts` unchanged (they read `homePrice`, `downPayment`, `downUnit`), move their tests, and import them in Mortgage from there. The Mortgage page must behave exactly as before.

**Interfaces (Produces):** `FRONT_FIELDS` (ids `monthlyRent`, `homePrice`, `downPayment`, `downUnit`, `rate`, `stayYears`), `DETAIL_FIELDS` (ids `termYears`, `yearlyTax`, `yearlyInsurance`, `yearlyMaintenance`, `appreciation`, `rentIncrease`, `sellingCosts`, `investmentReturn`), `exampleValues(exampleRatePct): Values`, `BLANK`, `toInput(values): RentVsBuyInput`.

Pinned values: rent `2,400` ("Per month."); price `400,000`; down `20` percent; stay `7` (`num`, suffix `yr`); term choice 10, 15, 20, 25, 30, default 30; tax `4,800`, insurance `1,800`, maintenance `4,000` (all "Per year."; maintenance adds "About 1% of the home price is a common rule of thumb."); appreciation `3`, rent increase `3`, selling costs `6`, investment return `5`. Labels: "Monthly rent", "Home price", "Down payment", "Down payment as", "Interest rate", "Years you plan to stay", "Loan term", "Property tax", "Homeowners insurance", "Maintenance", "Home value rises", "Rent rises", "Selling costs", "Return if the down payment were invested". Rate-type hints say "Per year." and selling costs "Of the sale price."

`BLANK`: money and number fields empty, choices at their default, the four assumption rates at their example values (decision 4). `stayYears` rounds to a whole year; empty or junk is NaN.

- [ ] **Step 1: Failing tests:** shared switch tests pass from the new location; field ids in order; the example at 7 gives the Task 1 `example` input exactly and `pullAheadYear` 5; down payment in dollars and in percent give the same input; null result for `BLANK`, for an empty or junk rent, price or stay, for a rate of `""`, `"."` or `"7..5"`, and for each assumption rate emptied in turn; a typed `0` in an assumption rate gives a result; `BLANK` keeps the four assumption rates.
- [ ] **Step 2: Run** (FAIL). **Step 3: Implement.** **Step 4: Run** (PASS), `npm run check`. **Step 5: Commit:** `feat(calculators): rent vs buy fields, down payment switch moved to the shared kit`.

### Task 3: Component

**Files:** Create `src/calculators/rent-vs-buy/Results.tsx`, `PrintSummary.tsx`, `RentVsBuyCalculator.tsx`, `RentVsBuyCalculator.markup.test.tsx`.

**Interfaces (Produces):** `RentVsBuyResults({ input, result, disclaimer })`, `assumptionLines(input): string[]`, `headlineText(result)`, `pullAheadSentence(result, stayYears)`, `RentVsBuyPrintSummary({ input, result })`, `RentVsBuyCalculator({ exampleRatePct, exampleRateNote, disclaimer })`.

Behaviour:
- Form: a card "Renting" (monthly rent), a card "Buying" (price, down payment with its unit switch as on the Mortgage calculator, interest rate with the config note), a card "How long" (years you plan to stay), then `AddDetail` with the eight detail fields under the line "These are the assumptions behind the estimate. Change any that do not fit." Ids are prefixed `rentbuy-`.
- Results, in order:
  1. Headline card. Eyebrow "Estimated difference after {N} years". "Buying comes out ahead by {X}" or "Renting comes out ahead by {X}" or "The two come out even". Sub line: "on these numbers, counting what is paid and what is left at the end".
  2. The pull-ahead sentence, one of: "Buying pulls ahead in year {k}." / "Buying is ahead from the first year." / "Buying would pull ahead in year {k}, after the {N} years you plan to stay." / "Buying does not pull ahead within 40 years on these numbers." / when buying was ahead in year k at or before the stay but renting is ahead at the end: "Buying is ahead in year {k} but is behind again by year {N}."
  3. Three `Stat` cards: "Monthly rent now", "Mortgage payment" (sub: "principal and interest"), "Rent in year {N}" (omit when the stay is 1 year).
  4. With a stay of 2 years or more: `SeriesChart kind="lines"` titled "Net cost of each path", series "Buying" and "Renting", one point per year of the stay, with the line under it "What each path has cost if you stopped at the end of that year. Lower is better."
  5. Side by side, two columns that stack on a phone. "Buying": down payment, mortgage payments, property tax, homeowners insurance, maintenance, "Total paid", then "Equity after selling" subtracted, then "Net cost of buying". "Renting": rent paid, then "Growth on the down payment, invested" subtracted, then "Net cost of renting".
  6. "What the buyer ends up owning": home value, loan balance, selling costs, equity after selling. When equity is negative, the sentence "On these numbers the sale would not cover the loan and the selling costs."
  7. "Assumptions in this estimate": a list from `assumptionLines`, always rendered outside the `details` panel: loan term; property tax per year "rising with the home's value"; homeowners insurance and maintenance per year "rising 3% a year" (from `COST_INFLATION`); home value rises {x}% a year; rent rises {x}% a year; selling costs {x}% of the sale price; the down payment would earn {x}% a year if invested instead; "Not included: mortgage insurance, closing costs on the purchase, HOA dues, renters insurance and income taxes." A cost of zero reads "{label}: none entered". Then "Change these under Add detail."
  8. With a down payment under 20% of the price: "With less than 20% down, most loans add mortgage insurance. It is not included here and would raise the cost of buying."
  9. Always: "A comparison like this turns on its assumptions. Home values and rents do not rise at a steady rate, and small changes above can move the result." Then the disclaimer.
- No result: "Enter the rent, the home price, the down payment, the interest rate and how long you plan to stay to see the comparison." with `role="status"`. When a down payment above the price is the reason: "The down payment is more than the home price."
- Print: `printBelowOnly`, a `PrintSummary` titled "Rent vs buy estimate" (left "The numbers": the five front inputs and the payment; right "The estimate": headline, pull-ahead year, the two net costs, equity after selling), then the assumptions list, sentence 9 and the disclaimer.
- Phone: the pinned bar as on the other calculators, "After {N} years" over the headline text, linking to `#rentbuy-results`.

- [ ] **Step 1: Failing tests** with `renderToStaticMarkup`: the default page shows "Buying comes out ahead by", the example's whole-dollar difference from `golden.json`, "Buying pulls ahead in year 5.", `$2,129`, the config note and the disclaimer; no `NaN|Infinity|undefined` and no banned words ("qualify", "approved", "eligible", "your rate", "should") on the default page and in the renting-ahead, zero-down and empty-costs states; every typed field has a label and each choice a legend; exactly one `details` panel and the assumptions heading and every assumption line are outside it; `assumptionLines` reflects changed values and "none entered" for an empty cost; all five pull-ahead sentences and all three headlines (drive `headlineText` and `pullAheadSentence` directly where a form state is hard to reach); the mortgage insurance line only under 20% down; the negative-equity sentence only with negative equity; no chart with a 1-year stay; the two prompts; the form is print-hidden and the printed part carries the headline, the assumptions and the disclaimer.
- [ ] **Step 2: Run** (FAIL). **Step 3: Implement.** **Step 4: Run** (PASS), `npm run check`. **Step 5: Commit:** `feat(calculators): rent vs buy calculator component`.

### Task 4: Page, registry, content and verification

**Files:** Create `src/calculators/rent-vs-buy/content.ts`, `src/app/(marketing)/calculators/rent-vs-buy/page.tsx`. Modify `src/calculators/registry.ts`, `registry.test.ts`, `src/app/(marketing)/calculators/routes.test.ts`, `src/content/nav.test.ts`, and any other test that counts calculators.

Pinned values:
- Registry entry, placed fifth, before `investment`: `{ slug: "rent-vs-buy", path: "/calculators/rent-vs-buy", label: "Rent vs buy calculator", question: "Does renting or buying cost less over time?", description: "Compare the cost of renting with the cost of buying over the years you plan to stay, and see when buying pulls ahead.", applyHref: "/apply/buy" }`.
- Page metadata title "Rent vs Buy Calculator".
- `content.ts`: a one or two sentence intro is optional; leave it out unless the page reads bare. "How this works" must say, in plain language with no formulas: each path is added up over the years you plan to stay; buying counts the down payment, the mortgage payments, property tax, insurance and maintenance, then takes off what you would walk away with after selling; renting counts the rent, then takes off what the down payment could have earned if invested; the path with the lower net cost is ahead; buying usually starts behind because of selling costs and catches up as the loan is paid down and the home's value changes; what is not included (decision 5); the loan is a fixed-rate loan. Three or four questions, for example why the early years favor renting, what to put for home value growth, why the result moves so much with the years, and what mortgage insurance would change. Nothing that tells the visitor to buy or to rent, and no forecast of home prices.

- [ ] **Step 1: Failing tests:** registry order `mortgage`, `buydown`, `blended-rate`, `refinance-breakeven`, `rent-vs-buy`, `investment`; the route renders by default and is not found when switched off; known routes and nav updated; `content.ts` has no banned words.
- [ ] **Step 2: Run** (FAIL). **Step 3: Implement.** **Step 4:** `npm run check` and `npm run build` (needs `npm run db:up`).
- [ ] **Step 5: Verify on a local production build:** the page returns 200 with the headline; the landing page has six cards; capture a desktop screenshot and a print PDF with headless Chrome and read both. HTTP checks use the context-mode `ctx_execute` tool with `fetch`, not `curl`.
- [ ] **Step 6: Commit:** `feat(calculators): rent vs buy page and registry entry`.
- [ ] **Step 7:** Final review by a fresh reviewer, one fix pass, then deploy to staging with `scripts/deploy-ec2.sh` (no arguments) for Zachary's test.
