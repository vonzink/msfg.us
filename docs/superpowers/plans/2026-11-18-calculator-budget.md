# Home Budget Calculator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Home budget calculator at `/calculators/budget` (spec step 6).

**Architecture:** A port of `calculate()` in `msfg-calc/public/js/calculators/budget.js`, proven by golden cases recorded by driving that file with a stand-in page. The dashboard tool is a loan-file worksheet (borrower, loan, MISMO import, income rows, liability rows with omit and payoff flags). The public page answers one question, "after my house payment and bills, what is left each month?", with five inputs up front and the itemized lines behind "Add detail". Built from the shared kit and wrapped in `CalculatorPage`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind v4, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-18-public-calculators-design.md`, sections "Home budget" and "Rules for every calculator". Copy the shape of `src/calculators/rent-vs-buy/` (the most recent, with its review lessons) and `src/calculators/blended-rate/rows.ts` for debt rows.

## Global Constraints

- Follow `AGENTS.md` and `src/calculators/CLAUDE.md`. Build from `src/calculators/shared/`. Never import from another calculator's folder; copy a pattern or move it to `shared/`.
- This is not an affordability or qualification tool. Never use "qualify", "approved", "eligible", "your rate", "should", "DTI limit" or "guideline" in page text. The ratios are described as shares of income, with the words "Comfortable", "Stretching", "High". Nothing reads as a loan decision.
- **The privacy line must be true:** nothing typed is stored or sent. No `fetch`, storage, cookies or analytics calls in this folder; a test asserts it.
- The disclaimer comes from tenant config through the route page. This calculator has no interest rate field, so there is no example-rate note.
- Percent fields use `parseRate`. An unreadable or empty percent is "not entered", never 0%; a typed 0 is a real 0.
- **No silent $0** (lesson from Rent vs buy): no result until all five front inputs are entered; a typed 0 counts for tax rate, debts and living costs. Money boxes that must accept a typed 0 need the `keepTypedZero` treatment; since two calculators now need it, move that fix into `shared/Field.tsx` or `shared/fields.ts` and use it from both.
- **Prompts name the field at fault and its range** (a `promptText` function, limits exported from `math.ts`).
- Never print "-$0". A negative amount keeps a label that is true for it.
- Never change anything in `/Users/zacharyzink/MSFG/WebProjects/msfg-calc`.
- `npm run check` passes at the end of every task. Branch `feat/calculator-budget`. Do not push. Do not merge.

## Decisions made by the builder, to raise with Zachary on staging

1. **One income figure.** The dashboard splits "qualifying" income (employment rows) from other household income and uses only the first for the ratios. The public page has one gross monthly household income and uses it everywhere. Golden cases put the whole income in an employment row with no additional income, where the two agree.
2. **Band edges follow the dashboard code:** a ratio of exactly 32% (or 47% back-end) is "Comfortable"; exactly 47% (55%) is "Stretching".
3. **Itemizing replaces the total.** Each of housing, debts and living costs has a "One total / Itemize" switch in "Add detail". When itemized, the front box is read-only and shows the sum of the lines.
4. **Debt rows** are name and monthly payment only, starting with two, up to eight. The dashboard's balance, months left, omit and payoff flags are left out.
5. **Balances** are the dashboard's five (checking, savings, retirement, investments, other). Months of reserves is `floor(total / housing)` as on the dashboard, shown only when a balance is entered and housing is above zero.
6. **A share-of-income bar** ("Where the income goes": tax, savings, housing, debts, living costs, left over) is added under the cards. It is the same figures, not a new combined one. Omitted when cash flow is negative; a sentence says by how much the month falls short.
7. **Housing lines** are principal and interest, property tax, homeowners insurance, mortgage insurance and HOA dues, all monthly. Flood and "other housing" are removed per the spec.

## Review Focus

1. **Nothing reads as a loan decision.** The gauges are bands of income share, the words are the three allowed, and a line says lenders look at more than these ratios.
2. **After Clear and partial entry:** no figure rests on an empty box counted as $0 or 0%.
3. **Total against itemized:** switching either way never double counts, never loses what was typed, and the front box always equals what the math used.
4. **Income of zero, expenses above income, 100% tax plus savings:** no `NaN`, `Infinity` or "-$0"; negative cash flow and residual are worded truthfully.
5. **Privacy line is true.**
6. **Switched off in config:** not found, absent from menu, sitemap and landing page; the "Work this out" link disappears when the Mortgage calculator is switched off.

---

### Task 1: Golden cases and the math

**Files:** Create `scripts/calculators/golden-budget.mjs`, `src/calculators/budget/golden.json`, `math.ts`, `math.test.ts`. Modify `scripts/README.md`.

**Interfaces (Produces):**

```ts
export const FRONT_BANDS = { comfortable: 0.32, stretching: 0.47 } as const; // at or under
export const BACK_BANDS = { comfortable: 0.47, stretching: 0.55 } as const;
export type Band = "comfortable" | "stretching" | "high";
export type BudgetInput = {
  grossIncome: number;
  /** Decimals. NaN means not entered. */
  taxRate: number; savingsRate: number;
  housing: number; debts: number; living: number;
  /** Total of account balances. NaN or 0 means none entered. */
  balances: number;
};
export type BudgetResult = {
  frontRatio: number; frontBand: Band;
  backRatio: number; backBand: Band;
  /** Gross income minus housing minus debts. */
  residual: number;
  taxAmount: number; savingsAmount: number;
  /** Income after tax and savings. */
  spendable: number;
  totalExpenses: number;
  /** spendable minus totalExpenses. */
  cashFlow: number;
  /** Whole months of housing the balances cover; null when no balances or no housing. */
  reserveMonths: number | null;
};
/** null when income is not above zero, or tax rate, housing, debts or living is NaN or negative, or a rate is outside 0 to 100%. An empty savings rate is 0. */
export function calculateBudget(input: BudgetInput): BudgetResult | null;
export function bandFor(ratio: number, bands: { comfortable: number; stretching: number }): Band;
```

**Source to port:** `calculate()` in `budget.js`: `frontDTI`, `backDTI`, `residualAfterDTI`, `taxAmount`, `savingsAmount`, `spendableIncome`, `grandTotalExpenses`, `netCashFlow`, `reserveMonths`, and the band tests in `setStatus`. Ratios are decimals here and percents there. State decision 1 and what is left out in the comment block at the top of `math.ts`.

- [ ] **Step 1: Write the generator**, following `golden-rent-vs-buy.mjs`: load `public/js/shared/utils.js` and `budget.js` in a `node:vm` stand-in page, add one employment income row through the file's own row code (read how `incomeRows` is filled; do not re-implement `calculate`), set the housing, living, reserve and adjustment inputs, add liability rows, run the calculation and read the displayed text. Record `frontRatioPct`, `backRatioPct`, the two status texts, `residual`, `spendable`, `totalExpenses`, `cashFlow`, `reserveMonths`.

| name | inputs (monthly) |
|---|---|
| `example` | income 9000; tax 22%; savings 0; housing 2700; debts 600; living 2500 |
| `stretching` | income 6000; tax 18%; housing 2400; debts 700; living 1800 |
| `high` | income 5000; tax 15%; housing 2600; debts 900; living 1500 |
| `band-edges` | income 10000; tax 0; housing 3200; debts 1500; living 0 (front exactly 32%, back exactly 47%) |
| `with-savings-and-balances` | `example` with savings 10% and balances 25000 |
| `no-debts-no-living` | income 7000; tax 0; housing 2000; debts 0; living 0 |
| `expenses-over-income` | income 4000; tax 20%; housing 2500; debts 1200; living 1500 |
| `itemized` | housing lines 1900 + 400 + 150 + 120 + 130; three debts 350, 180, 70; eight living lines; income 9000; tax 22% |

- [ ] **Step 2: Run it** and hand-check `example`: front 30.00%, back 36.67%, residual $5,700, cash flow $1,220.
- [ ] **Step 3: Failing tests:** `it.each` over the golden cases to the cent and to two decimals of a percent; bands for each case, the edges included; `reserveMonths` null without balances or housing; each null case in the doc comment; an empty savings rate is 0; tax plus savings of 100% gives spendable 0 and no `NaN`.
- [ ] **Step 4: Run** (FAIL). **Step 5: Implement.** **Step 6: Run** (PASS), document the script, commit: `feat(calculators): home budget math ported from the dashboard, with golden cases`.

### Task 2: Fields, itemized lines and rows

**Files:** Create `src/calculators/budget/fields.ts`, `fields.test.ts`, `rows.ts`, `rows.test.ts`. Modify `shared/` for the typed-zero fix and its tests, and `rent-vs-buy` to use it.

**Interfaces (Produces):** `FRONT_FIELDS` (ids `grossIncome`, `taxRate`, `housing`, `debts`, `living`), `HOUSING_LINES` (ids `housingPi`, `housingTax`, `housingInsurance`, `housingMi`, `housingHoa`), `LIVING_LINES` (the dashboard's eight categories, ids `living` + name, labels in plain words taken from `budget.ejs`), `BALANCE_FIELDS` (five), `savingsRate` field, the three mode ids `housingMode`, `debtsMode`, `livingMode` (`"total" | "itemized"`), debt rows `{ id, name, payment }` with `addRow`, `removeRow`, `MAX_ROWS = 8`, `exampleValues()`, `BLANK`, `toInput(values, debtRows): BudgetInput`, `groupTotal(values, debtRows, group)`.

Pinned values: income `9,000`; tax rate `22`; housing `2,700`; debts `600`; living `2,500`; modes `total`; lines and balances empty; savings rate empty. Labels: "Gross monthly household income" (hint "Before tax."), "Estimated tax rate" (hint "Federal, state and payroll taxes together, as a share of gross income."), "Monthly housing payment", "Monthly debt payments" (hint "Car loans, student loans, credit card minimums and the like."), "Monthly living costs" (hint "Utilities, groceries, transport, insurance, childcare and the rest.").

- [ ] **Step 1: Failing tests:** the example gives the Task 1 `example` input; the `itemized` golden case reached through lines and rows gives its golden result; switching a group to itemized uses the sum of its lines and ignores the stale total, and switching back uses the total; an itemized group with every line empty is "not entered"; `BLANK` gives null; each front box emptied in turn gives null; a typed 0 in tax rate, debts and living gives a result; junk percents are NaN; row add, remove and the cap of eight.
- [ ] **Step 2: Run** (FAIL). **Step 3: Implement.** **Step 4: Run** (PASS), `npm run check`. **Step 5: Commit:** `feat(calculators): home budget fields, itemized lines and debt rows`.

### Task 3: Component

**Files:** Create `src/calculators/budget/Results.tsx`, `PrintSummary.tsx`, `BudgetCalculator.tsx`, `BudgetCalculator.markup.test.tsx`, and a jsdom test for Clear and the mode switches.

**Interfaces (Produces):** `BudgetResults({ input, result, disclaimer })`, `promptText(...)`, `BudgetPrintSummary(...)`, `BudgetCalculator({ disclaimer, mortgageHref })` where `mortgageHref` is null when the Mortgage calculator is switched off.

Behaviour:
- Form: a card "Income" (gross income, tax rate), a card "Each month" (housing with the link "Work this out" to `mortgageHref`, debts, living), then `AddDetail` with four parts: "Housing, line by line", "Debts, one by one", "Living costs, by category" (each opened by its "One total / Itemize" switch; when itemized the front box is disabled with the hint "Total of the lines under Add detail"), and "Savings" (percent of income set aside, then the five balances). Ids are prefixed `budget-`. Under the form: "Your numbers stay in this browser. They are not saved or sent anywhere."
- Results, in order:
  1. Headline card. Eyebrow "Estimated monthly cash flow". "{X} left each month" or "{X} short each month". Sub line: "after tax, savings, housing, debts and living costs".
  2. Two gauge cards from the shared `Gauge`: "Housing as a share of income" (secondary label "front-end ratio") and "Housing and debts as a share of income" ("back-end ratio"), each with the percent to one decimal, the band word and the band ranges in words.
  3. `Stat` "Left after housing and debts" (secondary label "monthly residual"), loss colour when negative, and with balances a `Stat` "Savings cover" "{N} months of housing".
  4. "Where the income goes" bar (decision 6), or the shortfall sentence.
  5. Always: "These ratios are a way to see how much of your income is spoken for. A lender looks at more than these, and this page is not a loan decision." Then the disclaimer.
- No result: the named prompts, `role="status"`.
- Print: `printBelowOnly`, a `PrintSummary` titled "Home budget estimate" (left "The month": income, tax rate, housing, debts, living, savings rate; right "The estimate": the four results and reserves), then the itemized lines when used, sentence 5, the privacy line and the disclaimer.
- Phone: the pinned bar, "Left each month" over the figure.

- [ ] **Step 1: Failing tests:** the default page shows "$1,220 left each month", "30.0%", "36.7%", "$5,700", "Comfortable" twice, the privacy line and the disclaimer; no `NaN|Infinity|undefined|-\$0` and no banned words in the default, stretching, high and expenses-over-income states; each band word appears for its golden case; negative cash flow reads "short each month"; reserves only with balances; the bar is absent with negative cash flow; every typed field has a label and each switch a legend; one top-level `details`; the prompts; the "Work this out" link present with a href and absent with null; no `fetch(`, `localStorage`, `sessionStorage`, `document.cookie`, `sendBeacon` or `XMLHttpRequest` in any file of `src/calculators/budget/`; Clear then the five example numbers restores the example result; a typed 0 survives blur; the mode switches behave as in Task 2.
- [ ] **Step 2: Run** (FAIL). **Step 3: Implement.** **Step 4: Run** (PASS), `npm run check`. **Step 5: Commit:** `feat(calculators): home budget calculator component`.

### Task 4: Page, registry, content and verification

**Files:** Create `src/calculators/budget/content.ts`, `content.test.ts`, `src/app/(marketing)/calculators/budget/page.tsx`. Modify `src/calculators/registry.ts`, `registry.test.ts`, `src/app/(marketing)/calculators/routes.test.ts`, `src/content/nav.test.ts`.

Pinned values:
- Registry entry, placed sixth, before `investment`: `{ slug: "budget", path: "/calculators/budget", label: "Home budget calculator", question: "What is left each month after my house payment and bills?", description: "See how much of your income goes to housing and debts, and what is left each month after your bills.", applyHref: "/apply/buy" }`.
- Page metadata title "Home Budget Calculator". The route passes `mortgageHref` only when `isCalculatorEnabled("mortgage", ...)`.
- `content.ts`: intro of one sentence saying what the page is for and that it is not a loan decision. "How this works" in plain language with no formulas: the two ratios are shares of gross income; "left after housing and debts" is before tax and living costs; cash flow is after tax, savings and everything entered; the bands are a general way to read the share and where they sit; a total or its lines, never both; nothing typed leaves the browser. Three or four questions (gross or take-home; what counts as a debt payment; what if the ratios are high; how many months of savings).

- [ ] **Step 1: Failing tests:** registry order `mortgage`, `buydown`, `blended-rate`, `refinance-breakeven`, `rent-vs-buy`, `budget`, `investment`; the route renders by default and is not found when switched off; known routes and nav updated; `content.ts` has no banned words, dashes or formula characters.
- [ ] **Step 2: Run** (FAIL). **Step 3: Implement.** **Step 4:** `npm run check` and `npm run build` (needs `npm run db:up`).
- [ ] **Step 5: Verify on a local production build:** the page returns 200 with the headline; the landing page has seven cards; desktop screenshot and print PDF with headless Chrome, both read. HTTP checks use `ctx_execute` with `fetch`, not `curl`.
- [ ] **Step 6: Commit:** `feat(calculators): home budget page and registry entry`.
- [ ] **Step 7:** Final review by a fresh reviewer, one fix pass, then deploy to staging with `scripts/deploy-ec2.sh` (no arguments) for Zachary's test.

---

## Amendment 1: review fixes (2026-11-18)

From the final review, each fixed test-first (commit `e1471a0`):

- **Band and figure always agree.** Bands compare the share rounded to a hundredth of a percent (`roundShare`), and the page shows two decimals. Decision 2's difference from the dashboard is now: a share within a hundredth of a percent of an edge reads as the lower band.
- **When the month is short**, a line under the gauges says the shares are of income before tax and the month still falls short. The three band words are unchanged; whether "Comfortable" is the right word at 47% of gross income is with Zachary.
- **The dials run left to right**, Comfortable to High, with the band edges written on them (`mirror` and `edgeLabels`, opt-in on the shared `GaugeDial`).
- **The itemized total is read-only, not disabled** (`readOnly` on the shared `Field`).
- **Negative or unreadable itemized lines, debt payments and balances** get a prompt naming the box (`entryFaults`).
- **Reserves:** balances are "what would be left after your down payment and closing costs", and the page says a lender counts reserves in its own way.
- **Call to action** on this page reads "Want to go through your numbers with someone?" (`ctaTitle` on the shared `CalculatorPage`; other calculators unchanged).
- The income bar never shows "-0.0%" and says figures are rounded. The privacy line is on screen only, not on the printout.

**Open, for Zachary before production cutover:** the root layout loads the LeadConnector chat widget on every page when `NEXT_PUBLIC_GHL_CHAT_WIDGET_ID` is set. It is not loaded on staging; the current production site does load it. The privacy line is only true if that widget stays off calculator pages or is shown not to read form fields.

**Deferred minors:** money boxes read "9.000" as $9 and "1e4" as $14 (shared `parseNumber`); the first result may not be announced by screen readers; Clear then Print gives a letterhead-only page; an unreadable balance mid-typing hides the reserves card without a message; the bar's swatch colours match the band dots.
