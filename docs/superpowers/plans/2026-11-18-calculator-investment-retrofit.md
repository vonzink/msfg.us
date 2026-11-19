# Investment Calculator Retrofit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the Investment calculator at `/calculators/investment` into the same shape as the other seven (spec step 8). No change to its math or its results.

**Architecture:** The page already runs on the shared `CalculatorShell`. Three things change: the "Growth and sale", "Income taxes" and "Opportunity cost" panels move behind one "Add detail" expander; the route moves onto the shared `CalculatorPage` (letterhead on print, "How this works", common questions, call to action); and the example-rate note and the disclaimer come from tenant config.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind v4, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-18-public-calculators-design.md`, sections "Investment (retrofit only)" and "Rules for every calculator". Read the handoff note's "Decisions that are easy to get wrong" first.

## Global Constraints

- Follow `AGENTS.md` and `src/calculators/CLAUDE.md`. `investment/math.ts` is ported from msfg-calc `legacy/calc-reo/reo-math.js` and **must not change**; `math.test.ts` must pass untouched.
- Every figure the page shows for the worked example is the same before and after. Prove it with a test that compares the results column's text before and after, not only with the snapshot.
- Never use "qualify", "approved", "eligible" or "your rate" in page text. The field label "Your tax bracket" is the visitor's own tax bracket and stays. Results are estimates; nothing reads as investment or tax advice.
- The example interest rate, its note and the disclaimer come from tenant config through the route page.
- Zachary has been removing explanatory text from the other calculators. Add only what this plan lists.
- `npm run check` passes at the end of every task. Branch `feat/calculator-investment-retrofit`. Do not push. Do not merge.

## Decisions made by the builder, to raise with Zachary on staging

1. **Up front:** "The deal", "Closing and renovation" and "Monthly expenses" stay as they are. **Behind "Add detail":** "Growth and sale", "Income taxes" and "Opportunity cost", each still its own titled panel with its summary, inside the one expander. Their example values still apply while the expander is closed, as now.
2. **The page's own caution stays, and the tenant disclaimer is added under it.** The existing sentence says the estimate is not tax, legal or investment advice and not a guarantee of return; the tenant's calculator disclaimer does not say that. Both show.
3. **The intro sentence under the heading is kept** ("Enter the deal and your cash flow, tax effect, equity and five-year return update as you type.").
4. **The opening example is unchanged**, including "All cash" as the loan type. The example-rate note shows under the interest rate field; while "All cash" is picked the field's existing "Not used when paying all cash." hint takes its place, as now.
5. **Print is unchanged apart from the letterhead** that `CalculatorPage` adds. This calculator prints its results as on screen; it does not move to `printBelowOnly`.
6. **The call to action keeps the default wording** on this page.

## Review Focus

1. **No figure moved.** The worked example's results, the gauges, the rent breakdown, the projection table and the verdict sentence are identical.
2. **The three moved panels still work inside "Add detail":** keyboard, the summaries beside their titles, and print (closed panels open for the printout).
3. **Switched off in config:** not found, as before.

---

### Task 1: "Add detail" and tenant settings in the component

**Files:** Modify `src/calculators/investment/fields.ts`, `fields.test.ts`, `InvestmentCalculator.tsx`, `InvestmentCalculator.markup.test.tsx` and its snapshot.

**Interfaces (Produces):** `GroupDef.detail?: boolean` set on `growth`, `taxes` and `compare`; `InvestmentCalculator({ exampleRatePct, exampleRateNote, disclaimer })`.

- [ ] **Step 1: Failing tests** in the markup test, written before the snapshot is touched: the three detail groups render inside one `details` panel whose summary reads "Add detail", and the other groups render outside it, in the original order; the example-rate note is under the interest rate field when a loan type that uses a rate is picked, and the "all cash" hint shows otherwise; the tenant disclaimer text appears once, after the page's own caution; the results column's text for the worked example equals a fixture captured from the current code before any change (capture it first, commit it with the test); no `NaN|Infinity|undefined`; no banned words.
- [ ] **Step 2: Run** (FAIL). **Step 3: Implement.** **Step 4:** update the snapshot deliberately (`vitest -u` for this file only), read the diff and confirm it shows only the regrouping, the note and the disclaimer. **Step 5:** `npm run check`. **Step 6: Commit:** `feat(calculators): investment calculator moves growth, taxes and opportunity cost behind Add detail`.

### Task 2: Page on `CalculatorPage`, with content

**Files:** Create `src/calculators/investment/content.ts`, `content.test.ts`. Modify `src/app/(marketing)/calculators/investment/page.tsx`, `src/app/(marketing)/calculators/routes.test.ts`.

Pinned values:
- The route follows `src/app/(marketing)/calculators/rent-vs-buy/page.tsx`: `CalculatorPage` with the registry entry, `intro` (decision 3), `howItWorks` and `questions`, passing `exampleRatePct`, `exampleRateNote` and `disclaimer`. Metadata is unchanged. Keep `PageJsonLd` if `CalculatorPage` does not already render it, and keep the breadcrumb label the other pages use.
- `content.ts`, plain language, no formulas, four or five short paragraphs: what the page adds up (rent against the costs of owning and running the property, the loan if there is one); what the five-year return counts (cash flow, tax effect, equity from paying down the loan and from the change in value, less selling costs); that growth, income tax and the comparison with another investment are assumptions under "Add detail"; that the figures are estimates and not tax or investment advice. Three questions (what cash-on-cash and cap rate mean; why year 1 can look worse than later years; what "hold the losses" means), each answered without advice and without tax claims beyond what the page's own hints already say.

- [ ] **Step 1: Failing tests:** the route renders "How this works", the questions, the heading and the calculator, and is not found when switched off; `content.ts` has no banned words, dashes or formula characters.
- [ ] **Step 2: Run** (FAIL). **Step 3: Implement.** **Step 4:** `npm run check` and `npm run build` (needs `npm run db:up`).
- [ ] **Step 5: Verify on a local production build:** the page returns 200; desktop screenshot and print PDF with headless Chrome, both read and compared with the page on `main`.
- [ ] **Step 6: Commit:** `feat(calculators): investment calculator page on the shared calculator page`.
- [ ] **Step 7:** Final review by a fresh reviewer, one fix pass, then deploy to staging with `scripts/deploy-ec2.sh` (no arguments) for Zachary's test.

---

## Amendment 1: review fixes and Zachary's decisions (2026-11-18)

**From the final review** (commit `f64845c`). The reviewer rendered the page from `main` and from the branch for 61 input sets; every figure was identical.

- A muted line under the closed "Add detail" panel repeats the three moved panels' summaries ("3% appreciation, 24% bracket, vs 4% a year"), which used to show beside their titles. Hidden in print, where the panels open.
- The printout has a title, "Investment property estimate". `CalculatorPage` hides the heading on paper, so decision 5 was not quite true.
- "How this works" says the five-year return also takes off tax on the sale and is measured against the cash put in; cash-on-cash is before income tax; the third question names the control as it reads on the page.

**Decided by Zachary** (commit `5ce9dc8`). These change text that predates the retrofit; no figure changes.

- The verdict sentence starts "On these assumptions, ".
- The gauges read Higher / Middle / Lower in place of Good / Fair / Poor (`RATING_LABEL` in `shared/gaugeScale.ts`; this calculator is its only user). The tips drop "what most lenders want" and "less than a savings account might pay".
- The call to action reads "Want to go through your numbers with someone?".

**Deferred minors:** with the panels open the printout runs to seven pages and breaks awkwardly (the shared `AddDetail` has `print:break-inside-avoid` around three panels that each have it); if a browser does not fire its print event the three panels print as the words "Add detail"; the page's own caution and the tenant disclaimer overlap in wording; the summary line repeats the inner summaries while "Add detail" is open; a screen reader still hears "Rating: Higher"; after Clear the page shows "$0 ahead of the same cash earning 4% a year".
