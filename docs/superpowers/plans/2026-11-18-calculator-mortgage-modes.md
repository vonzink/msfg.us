# Mortgage Calculator Modes and Any Term Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Purchase / Refinance / Payment switch to the Mortgage calculator at `/calculators/mortgage`, and let the loan term be any whole number of years from 1 to 30. Asked for by Zachary on 2026-11-18 after testing on staging.

**Architecture:** The amortization model in `mortgage/math.ts` already takes a home price and a down payment and works for any whole term. Refinance and Payment are two more ways of filling in the same model at the field boundary, plus one new pure function that backs a payment into a loan amount. Purchase is unchanged. The schedule, the payment slider, the totals and the printout run on whichever loan the mode produces.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind v4, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-18-public-calculators-design.md`, section "Mortgage" (amended with this plan) and "Rules for every calculator". First plan for this page: `2026-11-18-calculators-shared-kit-and-mortgage.md`. Read the handoff note's "Decisions that are easy to get wrong" first.

## Global Constraints

- Follow `AGENTS.md` and `src/calculators/CLAUDE.md`. Build from `src/calculators/shared/`. Never import from another calculator's folder.
- **Purchase mode must not change:** every existing Mortgage test passes untouched apart from the term field's definition, and the purchase golden cases still match to the cent.
- **The payment slider stays** in every mode. Do not remove it or replace it with a static chart.
- Never use "qualify", "approved", "eligible", "your rate", "afford" or "should" in page text. **Payment mode is not an affordability tool:** the page says the loan amount is arithmetic on the payment typed in, not the amount a lender would lend.
- The example interest rate, its note and the disclaimer come from tenant config.
- Rates are decimals inside `math.ts`. Use `parseRate`; an unreadable rate is "not entered". Use `monthlyPayment` from `src/lib/finance.ts`; do not write a second payment formula.
- Prompts name the box at fault and its range. Never print "-$0".
- Add only the text this plan lists. Zachary has been removing explanatory text from the other calculators.
- Never change anything in `/Users/zacharyzink/MSFG/WebProjects/msfg-calc`.
- `npm run check` passes at the end of every task. Branch `feat/mortgage-modes`, stacked on `feat/calculator-investment-retrofit` so staging can hold both. Do not push. Do not merge.

## Decisions made by the builder, confirmed in outline by Zachary

1. **Refinance** replaces "Home price" and "Down payment" with "Loan amount" and "Home value". Home value is only used for mortgage insurance (charged above 80% of the value, ending at 78%, as now) and may be left empty; mortgage insurance typed without a home value is not counted and the field says so. There is no cash-out field: the visitor types the full new loan amount. In the dashboard's terms this is `refiLoanAmount` with `cashOut` 0 and `appraisedValue`.
2. **Payment** takes a monthly principal and interest payment, the rate and the term, and gives the loan amount that payment pays off, to the cent, rounded down so the typed payment always covers it. Property tax, homeowners insurance, HOA dues and mortgage insurance are hidden in this mode; extra principal and the start month stay. The schedule, slider and totals run on the resulting loan.
3. **Loan term** is a number box with a slider, whole years 1 to 30, in all three modes. The model accepts up to 40 and is not changed; the field stops at 30. Other calculators keep their five buttons.
4. **Switching modes keeps what carries over:** rate, term, tax, insurance and the detail fields. Purchase to Refinance fills the loan amount with price minus down payment and the home value with the price, as the dashboard does on first switch. Entering Payment fills the payment with the current loan's principal and interest. Clear and Load example stay in the current mode.
5. **The example in each mode:** Purchase as now ($400,000, 20% down); Refinance $320,000 loan on a $400,000 home; Payment $2,128.97 at the same rate and term, which gives back $320,000.

## Review Focus

1. **Purchase is unchanged**, on screen and in print.
2. **Payment mode never reads as an affordability or lending answer.**
3. **The loan amount from a payment reproduces that payment** to the cent across rates and terms, including 0% and a 1-year term, and never exceeds what the payment covers.
4. **Odd terms** (1, 7, 13, 29 years): schedule, payoff date, mortgage insurance midpoint, slider and year table.
5. **Mode switches** never lose or double count a number, and never show one mode's figure under another mode's label.
6. **Refinance without a home value**, with a value below the loan, and with mortgage insurance typed in each case.

---

### Task 1: Golden cases for a refinance and odd terms; payment back into an amount

**Files:** Modify `scripts/calculators/golden-mortgage.mjs`, `src/calculators/mortgage/golden.json`, `math.ts`, `math.test.ts`.

**Interfaces (Produces):**

```ts
/** The largest loan, to the cent, that a monthly principal and interest payment pays off. null when the payment, rate or term is unusable. */
export function loanAmountForPayment(payment: number, annualRate: number, termYears: number): number | null;
```

- [ ] **Step 1: Extend the generator** with refinance cases run through the dashboard's refinance mode (`mode: "refinance"`, `refiLoanAmount`, `cashOut: 0`, `appraisedValue`, conventional) and purchase cases at odd terms. Existing cases must come out byte for byte the same.

| name | inputs |
|---|---|
| `refi-80` | refinance; loan 320000; value 400000; 7%; 30 years; tax 4800; insurance 1800 |
| `refi-with-mi` | refinance; loan 360000; value 400000; 6.5%; 30 years; mortgage insurance 150 |
| `refi-15-year` | refinance; loan 250000; value 500000; 6%; 15 years |
| `term-7` | purchase; price 300000; down 60000; 6.75%; 7 years |
| `term-13-with-mi` | purchase; price 300000; down 15000; 6.75%; 13 years; mortgage insurance 120 |
| `term-29` | purchase; price 400000; down 80000; 7%; 29 years |
| `term-1` | purchase; price 120000; down 60000; 5%; 1 year |

- [ ] **Step 2: Failing tests:** the new golden cases through `calculateMortgage` (a refinance is `homePrice` = value, `downPayment` = value minus loan); `loanAmountForPayment(2128.97, 0.07, 30)` is hand-checked against a separate calculation and its `monthlyPayment`, rounded to cents, is 2128.97; a grid of rates 0 to 15% and terms 1 to 30 where the amount's payment never exceeds the typed payment and one cent more of loan would; 0% rate; null for a payment of 0, a negative or NaN rate, a rate above the model's limit, and a term that is not a whole number from 1 to 40.
- [ ] **Step 3: Run** (FAIL). **Step 4: Implement** and update the comment block at the top of `math.ts`. **Step 5: Run** (PASS), `npm run check`. **Step 6: Commit:** `feat(calculators): mortgage golden cases for refinance and odd terms; loan amount from a payment`.

### Task 2: Fields for the three modes and any term

**Files:** Modify `src/calculators/mortgage/fields.ts`, `fields.test.ts`.

**Interfaces (Produces):** a `mode` choice field (`"purchase" | "refinance" | "payment"`, labels "Purchase", "Refinance", "Payment", legend "I want to work out"); `frontFields(mode)` and `detailFields(mode)`; new fields `loanAmount`, `homeValue`, `payment` ("Monthly payment", hint "Principal and interest only."); `termYears` as `num`, suffix `yr`, slider 1 to 30 step 1, example `30`; `switchMode(values, mode, exampleRatePct)`; `exampleValues(exampleRatePct, mode)`; `blank(mode)`; `toInput(values, start)` returning the model input or null with a reason the prompt can name.

- [ ] **Step 1: Failing tests:** purchase fields and `toInput` behave exactly as before except the term definition; a term of 1, 7 and 30 is accepted, 0, 31, 7.5 and junk are rejected with the term named; refinance maps loan and value to the model and gives the `refi-80` golden input; refinance with an empty home value gives a result with no mortgage insurance; payment mode gives a model input whose loan is `loanAmountForPayment` and hides tax, insurance, HOA and mortgage insurance; each `switchMode` rule in decision 4; the example in each mode (decision 5); `blank(mode)` keeps the mode.
- [ ] **Step 2: Run** (FAIL). **Step 3: Implement.** **Step 4: Run** (PASS), `npm run check`. **Step 5: Commit:** `feat(calculators): mortgage fields for purchase, refinance and payment, and any term to 30 years`.

### Task 3: Component, results, print and content

**Files:** Modify `src/calculators/mortgage/MortgageCalculator.tsx`, `Results.tsx`, `PrintSummary.tsx`, `content.ts`, their tests; add a jsdom test for mode switching.

Behaviour:
- The mode switch is the first thing in the form, above the first card.
- **Purchase:** as now.
- **Refinance:** the first card holds loan amount, home value, interest rate and loan term; tax and insurance as now. Headline and everything under it as in Purchase. The print summary says "Loan amount" and "Home value" in place of price and down payment.
- **Payment:** the first card holds monthly payment, interest rate and loan term. Headline card: eyebrow "Estimated loan amount", the amount, sub line "paid off by {payment} a month over {N} years at {rate}". Directly under it: "This is arithmetic on the payment you typed. It is not the amount a lender would lend." Then total interest, payoff date, the payment slider, the balance chart and the schedule, all for that loan. The print summary leads with the payment and the loan amount.
- Prompts per mode name what is missing or out of range ("Enter a loan term from 1 to 30 years.").
- `content.ts`: one added paragraph in "How this works" saying what the three modes do, in two or three plain sentences. Nothing else.

- [ ] **Step 1: Failing tests:** the default (purchase) page markup is the same as before except the term field and the new switch; refinance and payment pages show their fields and headline; payment mode shows the not-a-lending-amount sentence and no tax or insurance fields; no `NaN|Infinity|undefined|-\$0` and no banned words in the three modes; a 7-year and a 29-year term render a schedule with 7 and 29 year rows and the slider's last payment is the last row; switching modes in jsdom follows decision 4, and Clear and Load example stay in the mode; every field has a label and the switch a legend; print carries the right labels per mode.
- [ ] **Step 2: Run** (FAIL). **Step 3: Implement.** **Step 4: Run** (PASS), `npm run check`, `npm run build`. **Step 5: Commit:** `feat(calculators): purchase, refinance and payment modes on the mortgage calculator`.
- [ ] **Step 6: Verify on a local production build:** desktop screenshot of each mode and a print PDF, all read.
- [ ] **Step 7:** Final review by a fresh reviewer, one fix pass, then deploy to staging with `scripts/deploy-ec2.sh` (no arguments) for Zachary's test.
