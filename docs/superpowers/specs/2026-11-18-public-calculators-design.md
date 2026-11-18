# Public calculators: seven simplified calculators plus a shared kit

Date: 2026-11-18. Status: awaiting approval. Reviewed once by an independent builder check; its three questions are answered in the text. Decisions below were made by Zachary Zink in a question-by-question review; items marked **(builder's call)** were proposed by Claude and not individually discussed.

## Intent

MSFG's loan officers use a set of calculators at dashboard.msfgco.com/calc (the `msfg-calc` repo, local path `/Users/zacharyzink/MSFG/WebProjects/msfg-calc`). They are built for people who work loan files. The public site (this repo, staging.msfg.us) has one calculator today, the investment calculator.

The goal is to bring seven of those calculators to the public site, restyled to match it and simplified so a borrower gets an answer without help, and to bring the investment calculator into the same shape. The detailed versions stay on the dashboard for loan officers.

## Goals

- Seven new calculators in `src/calculators/<name>/`, each a React rebuild following `src/calculators/investment/`.
- Every calculator is "simple by default": a short set of inputs up front and an **Add detail** expander for the rest.
- A borrower and a loan officer who enter the same numbers on the public site and the dashboard see the same results.
- All eight calculators look and behave as one set.

## Non-goals

- Affordability and Cash-out calculators. They are removed from the menu and are not part of this work.
- Permanent (points) buydowns.
- Saving or sharing a calculation by link. Print is the only export.
- Emailing results or collecting any contact details on a calculator page.
- Carrying numbers from one calculator into another, or into the apply wizard.
- Changing anything in `msfg-calc`.
- Restyling or changing `src/calculators/mbs/`. It is generated and stays out of the registry.

## Anti-goals

- A result that reads as a loan decision. Never use "qualify", "approved", "eligible" or "your rate".
- A displayed rate that reads as an offer or pulls from live rates data.
- A page that hides the assumptions driving its answer.
- Storing or transmitting what a visitor types. Calculators run entirely in the browser.

## Constraints

- Follow `AGENTS.md`, `docs/CODEBASE.md` section "Adding a calculator", and `src/calculators/CLAUDE.md`. Read the Next.js docs in `node_modules/next/dist/docs/` before writing routes.
- Multi-tenant rule: copy and settings come from tenant config, never module-level constants. New config keys must have defaults, because the config published in the database predates them.
- `math.ts` is pure functions with rates as decimals. Shared money helpers are in `src/lib/finance.ts`.
- Design tokens only, no hardcoded hex. Breakpoint is 980px. WCAG AA.
- `npm run check` must pass. The local build needs the local Postgres (`npm run db:up`).

## Approaches

**How simplified.** (A) one screen, about six inputs, nothing else; (B) the same short front with an "Add detail" expander. A is less to build and test. B keeps useful depth without showing it on arrival. **Chosen: B, for all calculators.**

**How the math gets here.** (A) port each formula to TypeScript in this repo and prove it with golden cases recorded from the dashboard code; (B) one shared math package used by both repos; (C) sync the dashboard scripts in as generated files, as the MBS page does. B is the cleanest but only amortization has separated math in `msfg-calc`, so it means refactoring the dashboard first. C brings untyped, untestable code into `src/`. **Chosen: A.** The cost is two copies of each formula; the golden cases keep them honest.

**Build order.** (A) shared kit first, then smallest to hardest; (B) by visitor demand. B gets popular pages live sooner but builds the largest calculators on a kit used once. **Chosen: A.**

## The set

| Calculator | Menu label | URL and folder | Source in `msfg-calc` |
|---|---|---|---|
| Mortgage | Mortgage calculator | `/calculators/mortgage` | `views/calculators/amortization.ejs`, `public/js/calculators/amortization.js`, `public/js/shared/amortization-math.js` (tested in `test/amortization.test.js`) |
| Rate buydown | Rate buydown calculator | `/calculators/buydown` | `legacy/buydown-calc/` |
| Blended rate | Blended rate calculator | `/calculators/blended-rate` | `legacy/gen-calc/blended_rate_calculator.html`, `blended-rate.js` |
| Refinance breakeven | Refinance breakeven calculator | `/calculators/refinance-breakeven` | `legacy/refi-calc/` |
| Rent vs buy | Rent vs buy calculator | `/calculators/rent-vs-buy` | `views/calculators/buy-vs-rent.ejs`, `public/js/calculators/buy-vs-rent.js` |
| Home budget | Home budget calculator | `/calculators/budget` | `views/calculators/budget.ejs`, `public/js/calculators/budget.js` |
| APR | APR calculator | `/calculators/apr` | `views/calculators/apr.ejs`, `public/js/calculators/apr.js` |
| Investment | Investment calculator | `/calculators/investment` (unchanged) | already ported |

## Rules for every calculator

- **Opens with a worked example**, as the investment calculator does, so a result is visible on load.
- **Example interest rate** comes from tenant config, default 7%, with a note on the field that it is an example and not an offer.
- **Totals or itemized, never both.** Where the front has one total (closing costs, housing, debts, living costs) and the detail section has the itemized lines, opening the lines replaces the total with their sum.
- **Results are labeled estimates.** Disclaimer wording comes from tenant config.
- **Page structure:** heading phrased as the visitor's question, an optional one or two sentence intro (Mortgage has none), the calculator, a short "How this works" in plain language with no formulas, three or four common questions specific to that calculator, then the call to action. Claude drafts the text; Zachary approves it on staging.
- **Call to action** under the results using the existing `CtaBand`: a link to the matching apply path plus a plain link to `/loan-officers`. On calculator pages the second button must not open the booking calendar pop-up that `CtaBand` uses elsewhere (`ScheduleCallButton`); add a variant for this and leave other pages as they are. Mortgage, Rent vs buy, Rate buydown, APR, Home budget and Investment link to `/apply/buy`. Refinance breakeven and Blended rate link to `/apply/refi`.
- **Buttons:** Load example, Clear, Print, as on the investment calculator.

## Per-calculator splits

### Mortgage

- **Up front:** home price; down payment (dollars or percent); interest rate; loan term; property tax; homeowners insurance.
- **Add detail:** HOA dues; mortgage insurance (typed in monthly); extra principal (amount and frequency); loan start month.
- **Loan type assumed:** conventional, stated in "How this works". Mortgage insurance follows the dashboard rule in `amortization-math.js`: it applies only when the down payment is under 20% and ends when the scheduled balance reaches 78% of the home price.
- **Removed:** purchase/refinance toggle; loan program selector; VA use, VA refinance type, funding fee exemption; cash-out and appraised value.
- **Results:** monthly payment headline; the payment slider (below); total interest; payoff date; interest saved and time saved when extra principal is entered; balance-over-time chart; then, under the calculator at page width, the amortization schedule by year, where each year opens to its payments.
- **The payment slider stays.** "Where each payment goes" has a slider from the first payment to the last. A ring splits that payment into principal, interest, tax, insurance, HOA, mortgage insurance and extra principal, and a line gives principal against interest as percentages, as the dashboard does. An earlier draft of this document listed the slider under "Removed". Zachary reversed that on 2026-11-18 after the first staging review: **keep the slider. Do not remove it or replace it with a static chart.**

### Rate buydown

- **Up front:** loan amount; interest rate; loan term; buydown type (3-2-1, 2-1, 1-1, 1-0; default 2-1).
- **Add detail:** property tax; homeowners insurance; HOA dues.
- **Removed:** the four-step "Show calculation steps" walkthrough.
- **Results:** total buydown cost as the headline, labeled as the amount paid up front to fund it; a year-by-year table of the reduced payment beside the full payment; monthly savings per reduced year.
- **Required wording:** the cost is often covered by a seller, builder or lender credit; the payment returns to the full amount when the reduced period ends, and the full payment is shown as prominently as the reduced ones.

### Blended rate

- **Up front:** debt rows of name, balance and rate. Starts with two rows; "Add another debt" up to six.
- **Add detail:** the current monthly payment on each debt; one new rate to compare against; the term of the new loan (10 to 30 years, default 30).
- **Removed:** the "Detailed calculations" walkthrough.
- **Results:** blended rate headline with total balance; a bar showing each debt's share of the total; total monthly payment when payments are entered; with a comparison rate, one line saying whether it is above or below the blended rate and by how much.
- **Monthly savings** (added by Zachary on 2026-11-18 after testing on staging). When the visitor has entered a payment for every debt and a comparison rate, the page prices one new loan for the whole balance at that rate over the chosen term and shows "Monthly savings": today's payments minus the new payment, positive or negative. It shows both payments beside the figure, states its assumptions (one new loan for the full balance, no closing costs or cash out), and says in words whether the new payment would be higher or lower. If any debt has no payment entered, it asks for the missing payments and shows no figure. The dashboard has no version of this; it uses the shared payment formula.
- **Required wording:** a lower blended rate is not the whole decision, because moving short-term debt into a 30-year loan can lower the rate and raise total interest. Links to Refinance breakeven.

### Refinance breakeven

- **Up front:** current loan balance; current interest rate; years left; new interest rate; new loan term; closing costs as one total.
- **Add detail:** new loan amount; cash-out amount; monthly debt payments being paid off; current monthly mortgage insurance; new monthly mortgage insurance; how long you plan to keep the loan.
- **New loan amount** defaults to the current balance plus any cash-out, and the visitor can raise it when closing costs are rolled in. This is the value passed as `refiLoanAmount` to the dashboard engine for golden cases. As on the dashboard, debt payments being paid off are added to the monthly savings.
- **Removed:** itemized fee worksheet; cost-of-waiting scenario; "refinance now, then again" analysis; loan type selectors and upfront fee logic; manual payment overrides; escrow and property value.
- **Results:** months to break even headline; payment now, payment after, the difference; total interest over the life of each loan side by side (always shown); with "how long you plan to keep the loan", net savings minus closing costs over that period.

### Rent vs buy

- **Up front:** current monthly rent; home price; down payment; interest rate; how long you plan to stay.
- **Add detail:** loan term; property tax; homeowners insurance; yearly maintenance; home appreciation rate; yearly rent increase; selling costs; return if the down payment were invested.
- **Removed:** annual cost inflation as an input, replaced by a fixed assumption that is stated on the page.
- **Results:** a plain headline saying which path is ahead after the chosen years and by how much; the year buying pulls ahead, if it does; a chart of the two paths; a side-by-side of costs and what the buyer ends up owning.
- **Assumptions rule:** the assumptions in use are printed under the result even when the detail section is closed.

### Home budget

Purpose: "After my house payment and bills, what is left each month?" Not an affordability or qualification tool.

- **Up front:** gross monthly household income; estimated tax rate; monthly housing payment (one number, with a "Work this out" link to the Mortgage calculator); monthly debt payments (one total); monthly living costs (one total).
- **Add detail:** housing split into principal and interest, tax, insurance, mortgage insurance, HOA; debts listed one by one; living costs in the dashboard's eight categories; percent of income set aside for savings; savings and account balances.
- **Removed:** borrower names, file number, date; loan purpose, product, amount, rate, term; property value; credit score; number of borrowers; MISMO import; flood and "other housing" as separate lines.
- **Results, all four required:**
  - Front-end ratio = housing ÷ gross income. Gauge bands: under 32% / 32 to 47% / above 47%.
  - Back-end ratio = (housing + debts) ÷ gross income. Gauge bands: under 47% / 47 to 55% / above 55%.
  - Monthly residual = gross income − housing − debts. Card label "Left after housing and debts", with "monthly residual" as the secondary label.
  - Monthly cash flow = income after tax and savings − all expenses.
  - Months of reserves, only when balances are entered.
- **Band wording:** "Comfortable", "Stretching", "High". Bands are the dashboard's and live in code.
- **Privacy line:** a statement that the numbers stay in the browser and are not saved or sent. It must be true.

### APR

- **Up front:** loan amount; interest rate; loan term; lender fees as one dollar total.
- **Add detail:** discount points (percent); lender credit; monthly mortgage insurance (typed in) with a home value field beside it; prepaid interest.
- **Removed:** the fee-by-fee catalog; the mortgage insurance matrix; credit score; VA usage; seller credit.
- **Loan type assumed:** conventional, stated in "How this works". Mortgage insurance ends when the scheduled balance reaches 78% of the home value, as in the dashboard's `apr.js`.
- **Prepaid interest** defaults to the dashboard's automatic 15 days. The amount is shown in the result's fee breakdown so it is never a hidden assumption.
- **Results:** APR headline beside the note rate, with the gap stated in words; the dollar amount of fees the APR accounts for; a short explanation of what APR is.
- **Required wording:** the result is an estimate and the official APR is the one on the borrower's Loan Estimate.

### Investment (retrofit only)

The deal and the rent stay up front. Growth and sale, income taxes and opportunity cost move behind "Add detail". No change to math or results.

## Architecture

- **Shared kit** in `src/calculators/shared/`, extracted from the investment calculator: the gauge, input fields, result cards, the "Add detail" expander, the page layout, and chart pieces that more than one calculator uses.
- **Registry** at `src/calculators/registry.ts`: one entry per calculator with name, URL, description and apply path. `src/content/nav.ts`, `src/app/sitemap.ts` and the landing page read from it. The MBS page is not in it.
- **Landing page** at `/calculators`: a grid of cards for the calculators that are live and switched on. The "Mortgage Calculators" menu heading links to it.
- **Tenant config:** a new `calculators` section in the schema in `src/content/site.ts`, all keys with defaults: which calculators are switched on; the example interest rate. Disclaimer wording goes in the existing legal section. Route pages read config on the server with `getTenantConfig()` and pass values to the client component. A switched-off calculator is absent from the menu, sitemap and landing page, and its URL returns not found.
- **In code, not config:** formulas; which inputs are up front; budget rating bands; names and URLs.
- **Golden cases:** for each calculator, at least five scenarios run through the dashboard code, with inputs and outputs committed here as test fixtures. `math.ts` must reproduce them to the cent. Include a 0% rate, zero down payment and empty optional fields. How the fixtures are generated from `msfg-calc` is **(builder's call)**; the method must be repeatable and documented beside the fixtures.

## Order

| Step | What |
|---|---|
| 0 | Shared kit extracted from the investment calculator, registry, tenant config section. The investment page must look and calculate exactly as before. |
| 1 | Mortgage, plus the `/calculators` landing page and the menu change (Affordability and Cash-out removed) |
| 2 | Rate buydown |
| 3 | Blended rate |
| 4 | Refinance breakeven |
| 5 | Rent vs buy |
| 6 | Home budget |
| 7 | APR |
| 8 | Investment retrofit |

Each step is its own branch and its own staging deploy. A calculator appears in the menu only when it is live.

## Done, per calculator

- Golden cases match the dashboard to the cent.
- `npm run check` passes.
- Usable at phone width; results reachable without hunting.
- Every input has a real label; the expander works from the keyboard.
- Prints cleanly.
- Wording rule holds: no "qualify", "approved", "eligible", "your rate"; results labeled estimates.
- Zachary reviews on staging: two scenarios of his choosing against the dashboard, plus the page text.

Zachary is the compliance sign-off. Compliance review of the disclaimers and all eight pages happens once, before production cutover, not per calculator.

## Left to the builder

- Component names and the exact shape of the shared kit and registry.
- Example values each calculator opens with, apart from the rate.
- The fixed cost-inflation assumption in Rent vs buy (start from the dashboard default).
- Property tax and insurance input units (yearly dollars or percent), consistent across calculators.
- Chart types and layout details, following the investment calculator.
- Whether a dashboard formula that is wrong or undefined at an edge case is reproduced or fixed. If fixed, the difference is recorded beside the golden cases and raised with Zachary.

## Changes after the first staging review (2026-11-18)

Decided by Zachary after testing the Mortgage calculator on staging. Where these differ from the text above, these win.

- **Mortgage has no intro sentence.** The intro under the heading is optional per calculator.
- **The payment slider is kept.** It was listed under "Removed" in the approved design and Zachary reversed that. The Mortgage section above now says so directly.
- **The amortization schedule is a full-width section under the calculator**, always visible. Each year row opens to its payments, to the cent, and "Show every payment" opens them all.
- **Print is a laid-out page:** a company letterhead with the licensing line, a two-column summary of the loan and the estimate, then the schedule as it is on screen, then the disclaimer. The form, charts, site header and footer do not print. Later calculators built on `CalculatorPage` get the letterhead and can supply their own printed summary.
