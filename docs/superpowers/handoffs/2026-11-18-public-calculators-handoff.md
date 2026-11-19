# Public calculators: handoff after all eight

Date: 2026-11-18. Written at the end of a long session so the next one can start from files, not memory.

## Read first

1. `docs/superpowers/specs/2026-11-18-public-calculators-design.md`. The binding design. It has been amended several times; the amendments are in place, in the section each one changes.
2. `src/calculators/CLAUDE.md`. Rules for anything under `src/calculators/`.
3. `AGENTS.md` and `docs/CODEBASE.md`, section "Adding a calculator".
4. The plan for the calculator most like the one you are building, in `docs/superpowers/plans/`. Refinance breakeven and Rent vs buy are the most complete examples, amendments included.

## Where things stand

| Spec step | Calculator | State |
|---|---|---|
| 0 | Shared kit, registry, tenant settings | Done, on `main` |
| 1 | Mortgage, `/calculators/mortgage` | Done, on `main` |
| 2 | Rate buydown, `/calculators/buydown` | Done, on `main` |
| 3 | Blended rate, `/calculators/blended-rate` | Done, on `main` |
| 4 | Refinance breakeven, `/calculators/refinance-breakeven` | Done, on `main` |
| 5 | Rent vs buy, `/calculators/rent-vs-buy` | Done, on `main` |
| 6 | Home budget, `/calculators/budget` | Done, on `main` |
| 7 | APR, `/calculators/apr` | Done, on `main` |
| 8 | Investment retrofit | Done, on `main` |
| 9 | Mortgage: Purchase / Refinance / Payment modes and any term to 30 years (added by Zachary) | Done, on `main`. Plan `2026-11-18-calculator-mortgage-modes.md` |

`main`, GitHub and staging (https://staging.msfg.us) hold the same code. Production (`msfg.us`) is still the old site and is not touched by any of this.

## The process that has worked

One calculator at a time, each on its own branch from `main`:

1. Read the dashboard source in `/Users/zacharyzink/MSFG/WebProjects/msfg-calc` (read-only; never change that repo).
2. Write a plan in `docs/superpowers/plans/` and add it to `docs/superpowers/README.md`.
3. Build test-first. Start with a golden-case script in `scripts/calculators/` that runs the dashboard's own code and records what it shows; `math.test.ts` must reproduce it to the cent.
4. Before the review, build, run the standalone server locally, and read a desktop screenshot and a print PDF made with headless Chrome. Markup tests do not catch layout or print faults.
5. One fresh reviewer on the whole branch. Tell it to read as a compliance reviewer for a mortgage lender and name the input combinations you are least sure of.
6. One fix pass, each fix with a test that failed first. Re-grade the reviewer's "minor" findings by their effect on a visitor.
7. Deploy to staging with `scripts/deploy-ec2.sh` (no arguments). Zachary tests there.
8. Merge to `main` only when Zachary says so.

## Standing rules from Zachary

- Staging only. Run `scripts/deploy-ec2.sh` with no arguments. Never production.
- Do not edit any `.env` file. Do not run anything on the server beyond what the deploy script does without asking.
- Do not change AWS security groups without asking.
- Label commands LOCAL or SERVER with the full path when reporting them.
- Mask credentials; never print a connection string.
- Do not push or merge to `main` until he says to.
- He is the compliance sign-off. Compliance review of all pages happens once, before production cutover.
- The build needs the local Postgres: `npm run db:up` (container `msfg-web-pg`).
- `curl` and inline HTTP in Bash are blocked by a hook in his setup. Use the context-mode `ctx_execute` tool with JavaScript `fetch` for HTTP checks.

## Decisions that are easy to get wrong

- **Simple by default with "Add detail"** on every calculator. A few inputs up front, the rest in the expander.
- **No "qualify", "approved", "eligible" or "your rate"** anywhere. Results are estimates. Nothing reads as a recommendation.
- **Settings come from tenant config:** `calculators.exampleRatePct`, `legal.exampleRateNote`, `legal.calculatorDisclaimer`. Never a constant. New config keys need Zod defaults, because the published config predates them.
- **An unreadable rate is "not entered", never 0%.** Use `parseRate` from `src/calculators/shared/fields.ts`.
- **The Mortgage payment slider stays.** The first design removed it and Zachary reversed that.
- **Borrowed money is never a gain** (Refinance breakeven). Net after the keep period is monthly savings, minus closing costs, plus additional equity, shown line by line. Zachary rejected a version that added cash out to the result.
- **Do not add a combined figure Zachary did not ask for** without putting the accounting choice in front of him first. That is how the rejected version shipped.
- **A shared component has limits.** The year-by-year `SeriesChart` starts at year 1; it was wrong for a breakeven in months and was replaced by `refinance-breakeven/BreakevenChart.tsx`.
- **Print is a laid-out page:** `CalculatorShell printBelowOnly`, a `PrintSummary` from the shared kit, then the calculator's table or caution, then the disclaimer. The letterhead comes from `CalculatorPage`.
- **No silent $0 for a cost that leans the answer** (Rent vs buy). After Clear, closing costs, property tax, insurance and maintenance must be entered before a comparison shows; a typed 0 counts. The first build counted empty as $0 and made buying look $81,000 better. The shared money box empties a typed 0 on blur; Rent vs buy works round that in `keepTypedZero`.
- **Zachary removed the on-screen assumptions box from Rent vs buy** after testing it. Do not put it back. The printout keeps the list.
- **A prompt names the field at fault and its range** (`promptText` in `rent-vs-buy/Results.tsx`), with limits exported from `math.ts`.
- **An empty box shows a grey "0", and Zachary reads that as zero** (Home budget). There, an empty tax rate, debts or living costs box counts as 0 and the page calculates; only income and housing are required. Decide per calculator which empty boxes may count as 0, and never do it where it leans the answer (Rent vs buy keeps its rule). Junk text is never 0.
- **Zachary cut explanatory text and extras on Home budget:** the band ranges sentence under the gauges and the "Where the income goes" bar. He asked for the dashboard's residual and cash flow cards as speedometers with tables. Expect him to prefer the dashboard's cards over new summaries.
- **Shared kit options added for Home budget, all opt-in:** `keepZero` and `readOnly` on `Field`, `mirror`, `edgeLabels`, `twoZone` and `centerLabel` on `GaugeDial`, `ctaTitle` on `CalculatorPage`.
- **APR wording:** never "official". The line is "This is an estimate. The APR for your loan is the one on your Loan Estimate." Lender fees include the lender's title insurance, as the dashboard's catalog counts it.
- **Comparing APR with the dashboard:** the dashboard pre-fills about twenty catalog fees. Clear them there first, or the two will not match.
- **Investment wording Zachary set:** the verdict starts "On these assumptions,"; the gauges read Higher / Middle / Lower, never Good / Fair / Poor; the tips do not say what lenders want. A line under the closed "Add detail" panel repeats the summaries of the panels inside it.
- **Mortgage modes:** the switch has no visible label. Payment mode's typed payment is principal and interest; tax, insurance, HOA and mortgage insurance are added on top and never change the loan amount; there is no home value box in Payment mode (he had it removed) (Zachary chose "add them on top" over "take them off the payment"). The page must keep the sentence "This is arithmetic on the payment entered. It is not the amount a lender would lend." The loan term is any whole year from 1 to 30 on this page only.
- **The call to action is "Want to go through your numbers with someone?" on every calculator.** It is the shared default; do not bring back "Like these numbers?".
- **Where the public page differs from the dashboard, say so in `math.ts`** and in the spec. Current deliberate differences: Mortgage headline excludes extra principal; Blended rate leaves out rows with no balance and adds monthly savings and cash back; Refinance breakeven stops net savings at the end of each loan, counts debt payments only when more is borrowed, and adds the balance and net block; Rent vs buy stops mortgage payments at the end of the loan, fixes cost inflation at 3%, and adds closing costs, mortgage insurance, HOA dues, the full monthly payment and an optional interest deduction; Home budget uses one income figure for everything and decides bands on the share rounded to a hundredth of a percent; APR takes one fee total, shows the rate itself when nothing is counted, needs a home value for mortgage insurance, solves from 0 and takes loans of $1,000 and up.

## Notes for the remaining calculators

All eight are built, and the Mortgage modes are in. What remains is the open items below and the production cutover with its compliance review.

## Deferred minors, by calculator

None block anything. Zachary has seen all of them.

- **Shared kit:** `parseNumber` strips letters ("1e12" reads as 112, "300k" as 300); out-of-range entries show the "enter your numbers" prompt with no reason; Clear then Print gives a letterhead-only page; prompts that mount with their text are not announced by most screen readers; a choice field's hint is not tied to its fieldset.
- **Mortgage:** a percent down payment is not rounded to cents before the loan amount (one cent off the dashboard for about one odd price in nine); Clear resets the term and unit choices; mortgage insurance typed with 20% down is ignored without a note.
- **Rate buydown:** a rate such as 0.0000001% rounds to 0% and shows a $0 result; the payment table cannot be scrolled by keyboard at phone width.
- **Blended rate:** the fifth and sixth bar colours are close.
- **Refinance breakeven:** an example rate of 0 in tenant config opens the page on the prompt; the printout does not say when monthly savings include debt payments or mortgage insurance.
- **Rent vs buy:** the chart's two lines differ only by colour and a stay over 12 years has no keyboard route to the yearly figures; rent and price read "2.400" as $2.40; the mortgage insurance cutoff uses the unrounded balance and could differ from the Mortgage calculator by one payment; the call to action reads "Like these numbers?" under a result where renting is ahead (shared band, every calculator).
- **Home budget:** the first result may not be announced by screen readers; an unreadable balance mid-typing hides the reserves card without a message; the band edges reach a screen reader only through "How this works".
- **Investment:** with the panels open the printout runs to seven pages and breaks awkwardly; if a browser does not fire its print event the three moved panels print as the words "Add detail"; the page's own caution and the tenant disclaimer overlap; a screen reader still hears "Rating: Higher".
- **Mortgage modes:** the call to action's button goes to the purchase application in every mode; carrying a rounded payment between modes can show a loan $1 off; chart labels may overlap at some terms.

## Open with Zachary

- **The word "Comfortable"** on Home budget can sit beside a month that falls short (income 5,000, tax 22%, housing 1,600, debts 750, living 1,700). A line under the gauges says so. Neutral words were offered; he has not chosen.
- **The chat widget and the privacy line.** The root layout loads the LeadConnector chat widget on every page when `NEXT_PUBLIC_GHL_CHAT_WIDGET_ID` is set. Staging does not load it; the current production site does. Home budget says nothing typed is saved or sent. Settle this before production cutover.

## Not verified by any session

Phone layout on a real phone. Headless Chrome cannot render narrower than 500 pixels, so every phone check so far is Zachary's.
