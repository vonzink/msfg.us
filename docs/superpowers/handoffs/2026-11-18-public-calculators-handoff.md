# Public calculators: handoff after four of eight

Date: 2026-11-18. Written at the end of a long session so the next one can start from files, not memory.

## Read first

1. `docs/superpowers/specs/2026-11-18-public-calculators-design.md`. The binding design. It has been amended several times; the amendments are in place, in the section each one changes.
2. `src/calculators/CLAUDE.md`. Rules for anything under `src/calculators/`.
3. `AGENTS.md` and `docs/CODEBASE.md`, section "Adding a calculator".
4. The plan for the calculator most like the one you are building, in `docs/superpowers/plans/`. Refinance breakeven is the most complete example, amendments included.

## Where things stand

| Spec step | Calculator | State |
|---|---|---|
| 0 | Shared kit, registry, tenant settings | Done, on `main` |
| 1 | Mortgage, `/calculators/mortgage` | Done, on `main` |
| 2 | Rate buydown, `/calculators/buydown` | Done, on `main` |
| 3 | Blended rate, `/calculators/blended-rate` | Done, on `main` |
| 4 | Refinance breakeven, `/calculators/refinance-breakeven` | Done, on `main` |
| 5 | Rent vs buy, `/calculators/rent-vs-buy` | **Next** |
| 6 | Home budget, `/calculators/budget` | Not started |
| 7 | APR, `/calculators/apr` | Not started |
| 8 | Investment retrofit | Not started |

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
- **Where the public page differs from the dashboard, say so in `math.ts`** and in the spec. Current deliberate differences: Mortgage headline excludes extra principal; Blended rate leaves out rows with no balance and adds monthly savings and cash back; Refinance breakeven stops net savings at the end of each loan, counts debt payments only when more is borrowed, and adds the balance and net block.

## Notes for the remaining calculators

- **Rent vs buy.** Source: `msfg-calc/views/calculators/buy-vs-rent.ejs` and `public/js/calculators/buy-vs-rent.js`. Five inputs up front, eight in detail. The spec's assumptions rule is the main risk: the assumptions in use are printed under the result even when the detail section is closed. This calculator needs a two-path chart over many years, which the shared `SeriesChart` does suit.
- **Home budget.** Source: `budget.ejs`, `budget.js` (about 1,100 lines, DOM-bound; expect to drive it with a stand-in page as Blended rate's golden script does). Four results are required: front-end ratio, back-end ratio, monthly residual, monthly cash flow. Gauges use the dashboard bands with the words "Comfortable", "Stretching", "High". Reuse `blended-rate/rows.ts` as the pattern for debt rows. It has a privacy line that must stay true.
- **APR.** Source: `apr.ejs`, `apr.js` (913 lines). Conventional loan assumed; mortgage insurance ends at 78% of a home value field in detail; prepaid interest defaults to 15 days and is shown in the breakdown. The result must say the official APR is the one on the Loan Estimate.
- **Investment retrofit.** Move growth and sale, income taxes and opportunity cost behind "Add detail"; put the page on `CalculatorPage`; add the config disclaimer and example-rate note. Its markup snapshot test will need a deliberate update.

## Deferred minors, by calculator

None block anything. Zachary has seen all of them.

- **Shared kit:** `parseNumber` strips letters ("1e12" reads as 112, "300k" as 300); out-of-range entries show the "enter your numbers" prompt with no reason; Clear then Print gives a letterhead-only page; prompts that mount with their text are not announced by most screen readers; a choice field's hint is not tied to its fieldset.
- **Mortgage:** a percent down payment is not rounded to cents before the loan amount (one cent off the dashboard for about one odd price in nine); Clear resets the term and unit choices; mortgage insurance typed with 20% down is ignored without a note.
- **Rate buydown:** a rate such as 0.0000001% rounds to 0% and shows a $0 result; the payment table cannot be scrolled by keyboard at phone width.
- **Blended rate:** the fifth and sixth bar colours are close.
- **Refinance breakeven:** an example rate of 0 in tenant config opens the page on the prompt; the printout does not say when monthly savings include debt payments or mortgage insurance.

## Not verified by any session

Phone layout on a real phone. Headless Chrome cannot render narrower than 500 pixels, so every phone check so far is Zachary's.
