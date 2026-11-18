# Calculators: Shared Kit and Mortgage Calculator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared calculator kit, registry and tenant settings (spec step 0), then ship the Mortgage calculator with the `/calculators` landing page and the menu change (spec step 1).

**Architecture:** Reusable UI moves out of `src/calculators/investment/` into `src/calculators/shared/` with no change to the investment page. A registry file becomes the single list that the menu, sitemap and landing page read. The Mortgage calculator is a TypeScript port of the dashboard's amortization math, proven by golden cases recorded from the dashboard code.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind v4, Zod v4, Vitest (node environment; `react-dom/server` for markup tests).

**Spec:** `docs/superpowers/specs/2026-11-18-public-calculators-design.md`. Read it first. This plan covers its steps 0 and 1 only. Steps 2 to 8 each get their own plan.

## Global Constraints

- Follow `AGENTS.md`, `src/calculators/CLAUDE.md` and `docs/CODEBASE.md`. Read the relevant guide in `node_modules/next/dist/docs/` before writing a route.
- Never use "qualify", "approved", "eligible" or "your rate" in any calculator text. Results are labeled estimates.
- Nothing a visitor types is stored or sent. No `localStorage`, no network calls from a calculator.
- Settings and copy come from tenant config via `getTenantConfig()`, never a module constant. Every new config key has a Zod default.
- `math.ts` is pure: no React, DOM, `Date.now()` or `new Date()`. Rates are decimals inside the math.
- No `new Date()` at module or render scope in any page or component (static generation). Dates are read in a mount effect only.
- Design tokens only, no hex. Breakpoint `max-[980px]:`. Real `<label>`s. Visible focus rings.
- Do not change anything in the `msfg-calc` repo or in `src/calculators/mbs/`.
- `npm run check` passes at the end of every task. The build needs the local database: `npm run db:up`.
- Two branches: `feat/calculators-shared-kit` (Tasks 1 to 4) and `feat/calculator-mortgage` (Tasks 5 to 9), each branched from `main`. Do not push, merge or deploy without asking Zachary.

## Review Focus

1. **A config saved before these settings existed.** The published config in the database has no `calculators` section and no calculator disclaimers. It must load with the defaults. Pinned in Task 1.
2. **Junk in a number field.** `"abc"`, `"-5"`, `"1e12"`, a 99% rate, an empty field. The page shows a short prompt in place of results and never prints `NaN`, `Infinity` or `$-`. Pinned in Tasks 6 and 7.
3. **Down payment at or above the price,** including a percent over 100. Same prompt, no crash. Pinned in Task 6.
4. **A switched-off calculator.** Its URL returns not found and it is absent from the menu, sitemap and landing page together. Pinned in Tasks 2 and 8.
5. **An extra payment larger than the balance.** The schedule ends at a zero balance with no negative row and no payment after payoff. Pinned in Task 5 (golden case `one-time-huge`).

---

## Step 0: branch `feat/calculators-shared-kit`

### Task 1: Tenant settings for calculators

**Files:**
- Modify: `src/content/site.ts` (schemas near lines 114 to 212, `DEFAULT_TENANT_CONFIG`)
- Modify: `src/app/admin/config/ConfigEditor.tsx`
- Test: `src/content/site.calculators.test.ts` (new)

**Interfaces:**
- Produces: `TenantConfig["calculators"]: { disabled: string[]; exampleRatePct: number }` and `TenantConfig["legal"]["calculatorDisclaimer" | "exampleRateNote"]: string`.

The spec says the config holds "which calculators are switched on". Store the opposite, a `disabled` list. A saved "enabled" list would silently hide every calculator added after it was saved.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_TENANT_CONFIG, TenantConfigSchema } from "./site";

describe("calculator settings", () => {
  it("fills defaults for a config saved before the settings existed", () => {
    const { calculators: _c, ...old } = DEFAULT_TENANT_CONFIG;
    const { calculatorDisclaimer: _d, exampleRateNote: _n, ...oldLegal } = old.legal;
    const parsed = TenantConfigSchema.parse({ ...old, legal: oldLegal });
    expect(parsed.calculators).toEqual({ disabled: [], exampleRatePct: 7 });
    expect(parsed.legal.exampleRateNote).toBe("Example rate for illustration, not an offer.");
    expect(parsed.legal.calculatorDisclaimer).toMatch(/^This is an estimate/);
  });
  it("rejects an example rate outside 0 to 25", () => {
    const bad = { ...DEFAULT_TENANT_CONFIG, calculators: { disabled: [], exampleRatePct: 40 } };
    expect(TenantConfigSchema.safeParse(bad).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run it.** `npx vitest run src/content/site.calculators.test.ts`. Expected: FAIL, `calculators` does not exist.

- [ ] **Step 3: Add the schema.** In `site.ts`:
  - `CalculatorsSchema = z.object({ disabled: z.array(z.string()).default([]), exampleRatePct: z.number().min(0).max(25).default(7) })`.
  - On `TenantConfigSchema`: `calculators: CalculatorsSchema.default(() => CalculatorsSchema.parse({}))`, the same lazy-default pattern `theme` uses.
  - On `LegalSchema`, two strings with these defaults, also set explicitly in `DEFAULT_TENANT_CONFIG`:
    - `calculatorDisclaimer`: `"This is an estimate based on the numbers you entered. It is not a loan offer, a rate quote or a commitment to lend. Talk with a loan officer for figures specific to you."`
    - `exampleRateNote`: `"Example rate for illustration, not an offer."`

- [ ] **Step 4: Add admin controls** in `ConfigEditor.tsx`, following the existing controls in that file: a number input for the example rate, a text area for each of the two legal strings, and one checkbox per entry in `CALCULATORS` (Task 2) that adds or removes its slug from `disabled`. Until Task 2 lands, render the checkbox list from an empty array.

- [ ] **Step 5: Run** `npm run check`. Expected: PASS.

- [ ] **Step 6: Commit.** `git commit -m "feat(calculators): tenant settings for example rate, disclaimers and switched-off calculators"`

### Task 2: Registry

**Files:**
- Create: `src/calculators/registry.ts`, `src/calculators/registry.test.ts`
- Modify: `src/app/sitemap.ts`, `src/lib/siteMap.ts`, `src/app/(marketing)/calculators/investment/page.tsx`, `src/app/admin/config/ConfigEditor.tsx`

**Interfaces:**
- Consumes: `TenantConfig["calculators"]` from Task 1.
- Produces:

```ts
export type CalculatorEntry = {
  slug: string;                          // folder name and last URL segment
  path: `/calculators/${string}`;
  label: string;                         // menu label
  question: string;                      // the visitor's question, used as the card title
  description: string;                   // one sentence for the landing card
  applyHref: "/apply/buy" | "/apply/refi";
};
export const CALCULATORS: CalculatorEntry[];
export function enabledCalculators(settings: { disabled: string[] }): CalculatorEntry[];
export function isCalculatorEnabled(slug: string, settings: { disabled: string[] }): boolean;
```

`CALCULATORS` has one entry in this task: `{ slug: "investment", path: "/calculators/investment", label: "Investment calculator", question: "Will this rental pay off?", description: "See the cash flow, tax effect, equity and five-year return on a rental property.", applyHref: "/apply/buy" }`.

- [ ] **Step 1: Write the failing tests** in `registry.test.ts`:
  - every `path` equals `` `/calculators/${slug}` `` and slugs are unique;
  - a folder `src/calculators/<slug>/` exists for every entry (use `node:fs`);
  - `enabledCalculators({ disabled: ["investment"] })` returns `[]`, and `{ disabled: ["nope"] }` returns all entries;
  - `isCalculatorEnabled("mbs", { disabled: [] })` is `false`, since MBS is never registered.
- [ ] **Step 2: Run** `npx vitest run src/calculators/registry.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement `registry.ts`.**
- [ ] **Step 4: Wire the sitemap.** Remove `"/calculators/investment"` from `ROUTES` in `src/app/sitemap.ts` and append `enabledCalculators(config.calculators).map((c) => c.path)` using `getTenantConfig()`. Make the same change in `src/lib/siteMap.ts` where it lists calculator links.
- [ ] **Step 5: Guard the route.** In the investment `page.tsx`, make the page async, read the config, and call `notFound()` when `isCalculatorEnabled("investment", config.calculators)` is false. Do the same in `generateMetadata`.
- [ ] **Step 6: Feed the admin checkbox list** from `CALCULATORS`.
- [ ] **Step 7: Run** `npm run check` and `npm run build`. Expected: PASS, and the build output still lists `/calculators/investment`.
- [ ] **Step 8: Commit.** `git commit -m "feat(calculators): registry drives the sitemap and switched-off routes"`

### Task 3: Extract the shared kit

**Files:**
- Create in `src/calculators/shared/`: `fields.ts`, `Field.tsx`, `Stat.tsx`, `gauge.ts`, `gauge.test.ts`, `Gauge.tsx`, `Charts.tsx`, `AddDetail.tsx`, `CalculatorShell.tsx`
- Modify: everything in `src/calculators/investment/`
- Test: `src/calculators/investment/InvestmentCalculator.markup.test.tsx` (new)

**Interfaces (Produces):**

```ts
// shared/fields.ts
export type Values = Record<string, string>;
export type Numbers = Record<string, number>;
export type FieldDef = { /* as today in investment/fields.ts, minus `loanOnly` */ };
export function parseNumber(v: string | undefined): number;

// shared/Field.tsx
export function Field(props: { def: FieldDef; idPrefix: string; values: Values; numbers: Numbers;
  onChange: (id: string, value: string) => void; disabled?: boolean; disabledHint?: string }): JSX.Element;

// shared/Stat.tsx: `gauge` becomes optional
export function Stat(props: { label: string; value: string; sub: string; tip: string; loss?: boolean;
  gauge?: { value: number; scale: Scale } }): JSX.Element;

// shared/gauge.ts: Rating, Scale, RATING_LABEL, rate, dialPosition (moved unchanged)
// shared/Gauge.tsx: GaugeDial, GaugeRating (moved unchanged)
// shared/Charts.tsx: SeriesChart, Swatch, compactUSD (moved unchanged)

// shared/AddDetail.tsx: a <details data-calc-panel> with a keyboard-focusable summary
export function AddDetail(props: { summary?: string; children: ReactNode }): JSX.Element; // summary defaults to "Add detail"

// shared/CalculatorShell.tsx: toolbar, two-column grid, sticky results, print handling
export function CalculatorShell(props: { formLabel: string; resultsId: string; onExample: () => void;
  onClear: () => void; form: ReactNode; results: ReactNode }): JSX.Element;
```

What stays in `investment/`: `SCALES` in `gauges.ts`, `RentBreakdown` (move it to `investment/RentBreakdown.tsx`), `Group`, `Projection`, `Note`, the investor disclaimer, and `loanOnly`, which becomes a local field list the calculator turns into `disabled` and `disabledHint="Not used when paying all cash."`.

- [ ] **Step 1: Rename the print hook first.** In `InvestmentCalculator.tsx` change `data-reo-panel` to `data-calc-panel` in both the attribute and the `querySelectorAll`. Run `npm run check`. Commit: `refactor(calculators): generic print-panel attribute`.
- [ ] **Step 2: Pin the current markup.** Write `InvestmentCalculator.markup.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { InvestmentCalculator } from "./InvestmentCalculator";

it("renders the same markup as before the shared-kit extraction", () => {
  expect(renderToStaticMarkup(<InvestmentCalculator />)).toMatchSnapshot();
});
```

- [ ] **Step 3: Run it** to write the snapshot: `npx vitest run src/calculators/investment/InvestmentCalculator.markup.test.tsx`. Expected: PASS, snapshot written. Commit the test and snapshot before moving any code.
- [ ] **Step 4: Move the code** to the files listed above. Field ids keep the `reo-` prefix through `idPrefix="reo"`. `CalculatorShell` takes over the toolbar, the grid, the sticky results section and the `beforeprint`/`afterprint` effect. Move `gauges.test.ts` cases that test `rate` and `dialPosition` into `shared/gauge.test.ts`.
- [ ] **Step 5: Run** `npx vitest run src/calculators`. Expected: PASS with **no snapshot change**. If the snapshot differs, fix the extraction. Do not update the snapshot.
- [ ] **Step 6: Run** `npm run check`. Expected: PASS, same test count as before plus the new ones.
- [ ] **Step 7: Commit.** `git commit -m "refactor(calculators): extract shared kit from the investment calculator"`

### Task 4: Example rate from config, docs, staging check

**Files:**
- Modify: `src/calculators/investment/fields.ts`, `InvestmentCalculator.tsx`, `fields.test.ts`, the investment `page.tsx`
- Modify: `src/calculators/CLAUDE.md`, `docs/CODEBASE.md`, `AGENTS.md`

**Interfaces:**
- Produces: `exampleValues(exampleRatePct: number): Values` in `investment/fields.ts`, and `InvestmentCalculator({ exampleRatePct }: { exampleRatePct: number })`.

- [ ] **Step 1: Write the failing test** in `fields.test.ts`: `exampleValues(6.5).rate === "6.5"` and `exampleValues(7)` deep-equals the current `EXAMPLE`.
- [ ] **Step 2: Run it.** Expected: FAIL, `exampleValues` not exported.
- [ ] **Step 3: Implement.** Replace the `EXAMPLE` constant with `exampleValues`. The page passes `config.calculators.exampleRatePct`. In the markup test, render `<InvestmentCalculator exampleRatePct={7} />`.
- [ ] **Step 4: Run** `npx vitest run src/calculators`. Expected: PASS, snapshot unchanged.
- [ ] **Step 5: Update the docs.** In all three files, replace the "link it in `nav.ts`, add it to `sitemap.ts`" instruction with "add one entry to `src/calculators/registry.ts`", and list the shared kit pieces and what each is for. In `src/calculators/CLAUDE.md` add: example rate and disclaimers come from tenant config, never a constant.
- [ ] **Step 6: Run** `npm run check` and `npm run build`. Expected: PASS.
- [ ] **Step 7: Commit.** `git commit -m "feat(calculators): example rate from tenant config; docs for the registry and shared kit"`
- [ ] **Step 8: Stop and ask Zachary** before deploying. With his OK: `scripts/deploy-ec2.sh` (no arguments). Then confirm on staging that `/calculators/investment` returns 200, shows `$147,032` and four gauges, and that `/sitemap.xml` still lists it.

---

## Step 1: branch `feat/calculator-mortgage`

### Task 5: Golden cases and the Mortgage math

**Files:**
- Create: `scripts/calculators/golden-mortgage.mjs`, `src/calculators/mortgage/golden.json`, `src/calculators/mortgage/math.ts`, `src/calculators/mortgage/math.test.ts`
- Modify: `src/lib/finance.ts`, `scripts/README.md`

**Interfaces (Produces):**

```ts
// src/lib/finance.ts
export function roundCents(n: number): number; // Math.round((n + Number.EPSILON) * 100) / 100

// src/calculators/mortgage/math.ts
export type ExtraFrequency = "monthly" | "annually" | "one-time";
export type MortgageInput = {
  homePrice: number; downPayment: number; annualRate: number; termYears: number;
  yearlyTax: number; yearlyInsurance: number; monthlyHoa: number; monthlyPmi: number;
  extraAmount: number; extraFrequency: ExtraFrequency;
  startMonth: number; startYear: number;      // startMonth is 0 to 11
};
export type ScheduleRow = { paymentNum: number; month: number; year: number; principal: number;
  interest: number; extra: number; balance: number; pmi: number; totalMonthly: number };
export type YearRow = { year: number; principal: number; interest: number; extra: number; endBalance: number };
export type MortgageResult = {
  loanAmount: number; ltv: number; monthlyPI: number;
  first: { principalAndInterest: number; tax: number; insurance: number; hoa: number; pmi: number; total: number };
  schedule: ScheduleRow[]; years: YearRow[];
  totalInterest: number; totalCost: number; interestSaved: number; monthsSaved: number;
  pmiEndPayment: number; payoff: { month: number; year: number };
};
/** null when the dashboard would reject the inputs. */
export function calculateMortgage(input: MortgageInput): MortgageResult | null;
```

**Source to port:** `calculate`, `loanDetails` and `schedule` in `msfg-calc/public/js/shared/amortization-math.js`, purchase mode and `program: "conventional"` only. Drop the FHA and VA branches. Extra payments start with the first payment (`extraStart = 0`).

- [ ] **Step 1: Write the generator** `scripts/calculators/golden-mortgage.mjs`. It takes the `msfg-calc` path as its argument (default `../msfg-calc`, or `MSFG_CALC`, as `scripts/sync-where-the-money-goes.mjs` does), loads `public/js/shared/utils.js` and `amortization-math.js` in a `node:vm` context the way `msfg-calc/test/amortization.test.js` does, runs each case below through `MSFG.AmortizationMath.calculate`, and writes `src/calculators/mortgage/golden.json` as `{ source: "<msfg-calc commit>", cases: [{ name, input, expected }] }`. `input` is a `MortgageInput`; the script maps it to dashboard inputs (`mode: "purchase"`, `program: "conventional"`, `monthlyTax: yearlyTax / 12`, `monthlyIns: yearlyInsurance / 12`, `extraStartMonth`/`extraStartYear` equal to the start). `expected` holds `loanAmount`, `monthlyPI`, `totalInterest`, `totalCost`, `interestSaved`, `monthsSaved`, `pmiEndPayment`, `scheduleLength`, and rows 1, 12 and the last row (`principal`, `interest`, `extra`, `balance`, `pmi`, `totalMonthly`).

  All cases use `startMonth: 0, startYear: 2027` and zero for anything not listed:

| name | inputs |
|---|---|
| `reference` | price 250000, down 50000, rate 0.075, 30y, tax 2500, insurance 1500, HOA 100 |
| `zero-rate` | price 250000, down 50000, rate 0, 10y |
| `zero-down-pmi` | price 300000, down 0, rate 0.07, 30y, PMI 150 |
| `twenty-percent-no-pmi` | price 300000, down 60000, rate 0.07, 30y, PMI 150 |
| `extra-monthly` | reference plus extra 200 monthly |
| `extra-annual` | reference plus extra 1000 annually |
| `one-time-huge` | reference plus extra 500000 one-time |
| `no-optionals` | price 400000, down 80000, rate 0.07, 15y |

- [ ] **Step 2: Run it.** `node scripts/calculators/golden-mortgage.mjs`. Expected: `golden.json` written with 8 cases. Hand-check one against the dashboard's own test: `reference` has `monthlyPI` 1398.43 and row 1 `totalMonthly` 1831.76.
- [ ] **Step 3: Write the failing tests** in `math.test.ts`:
  - one `it.each` over `golden.cases` asserting every `expected` number with `toBe`;
  - `calculateMortgage` returns `null` for: down payment equal to the price, a negative price, rate 0.26, term 0, term 41, term 12.5;
  - in `one-time-huge`, every row has `balance >= 0` and the last row's `balance` is 0;
  - `years` sums to the schedule: total principal plus extra equals `loanAmount` within 0.005.
- [ ] **Step 4: Run** `npx vitest run src/calculators/mortgage/math.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 5: Implement.** Add `roundCents` to `finance.ts`. Write `math.ts` with a comment block of assumptions at the top, as `investment/math.ts` has: conventional loan only; PMI charged only above 80% loan-to-value and ended at the scheduled 78% date or the loan midpoint, whichever is first; extra payments do not end PMI early; ported from `msfg-calc` and kept in step by `golden.json`. Use `monthlyPayment(principal, annualRate * 100, termYears * 12)` from `finance.ts` and round with `roundCents`.
- [ ] **Step 6: Run** the tests. Expected: PASS. If a value is off by a cent, the cause is rounding order: round each row the way the dashboard does, not the totals.
- [ ] **Step 7: Document** the generator in `scripts/README.md` and commit. `git commit -m "feat(calculators): mortgage math ported from the dashboard, with golden cases"`

### Task 6: Mortgage fields

**Files:**
- Create: `src/calculators/mortgage/fields.ts`, `src/calculators/mortgage/fields.test.ts`

**Interfaces:**
- Consumes: `FieldDef`, `Values`, `Numbers`, `parseNumber` from `shared/fields.ts`; `MortgageInput` from Task 5.
- Produces:

```ts
export const FRONT_FIELDS: FieldDef[];   // homePrice, downPayment, downUnit, rate, termYears, yearlyTax, yearlyInsurance
export const DETAIL_FIELDS: FieldDef[];  // monthlyHoa, monthlyPmi, extraAmount, extraFrequency
export function exampleValues(exampleRatePct: number): Values;
export const BLANK: Values;
export function toInput(values: Values, start: { month: number; year: number }): MortgageInput;
```

Pinned values:
- `downUnit` is a choice of `"usd"` and `"pct"`. In percent mode the down payment is `homePrice × pct ÷ 100`.
- `termYears` is a choice of 10, 15, 20, 25, 30.
- Property tax and insurance are yearly dollars. HOA and PMI are monthly dollars. This unit choice applies to every later calculator.
- Example: price `400000`, down `20` in percent mode, term `30`, tax `4800`, insurance `1800`, everything in the detail section `0`, frequency `monthly`, rate from the argument.
- The rate field's `hint` is left empty here. The page supplies `legal.exampleRateNote` (Task 7).

- [ ] **Step 1: Write the failing tests:**
  - `toInput(exampleValues(7), { month: 0, year: 2027 })` gives `downPayment` 80000 and `annualRate` 0.07;
  - switching `downUnit` to `"usd"` with `downPayment: "50000"` gives 50000;
  - `calculateMortgage(toInput(v, start))` is `null`, never a throw, for each of: `homePrice: "abc"`, `homePrice: ""`, `downPayment: "120"` in percent mode, `rate: "99"`, `homePrice: "1e12"` with down in dollars above it;
  - `rate: "-5"` parses to a rate the math rejects.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(calculators): mortgage calculator fields"`

### Task 7: Mortgage calculator component

**Files:**
- Create: `src/calculators/shared/Donut.tsx`, `src/calculators/mortgage/MortgageCalculator.tsx`, `src/calculators/mortgage/MortgageCalculator.markup.test.tsx`

**Interfaces:**
- Consumes: the shared kit (Task 3), `fields.ts` (Task 6), `calculateMortgage` (Task 5).
- Produces:

```ts
// shared/Donut.tsx: inline SVG, no library, with a text legend so colour is never the only signal
export function Donut(props: { title: string; total: string;
  slices: { label: string; value: number; className: string }[] }): JSX.Element;

export function MortgageCalculator(props: { exampleRatePct: number; exampleRateNote: string;
  disclaimer: string }): JSX.Element;
```

Behaviour the tests cannot fully pin:
- The six front fields are always visible. The four detail fields sit inside `AddDetail`.
- The start date is `null` until a mount effect sets it to the month after today. While it is `null`, compute with `{ month: 0, year: 0 }` and show the payoff as a duration ("30 years") and schedule rows as "Year 1", "Year 2". Once set, show the payoff month and year. A "Loan start" month and year control in the detail section lets the visitor change it.
- Results, in order: monthly payment headline with the `Donut` (principal and interest, tax, insurance, HOA, mortgage insurance; zero slices omitted); total interest and payoff date as `Stat` cards without gauges; interest saved and time saved, only when `extraAmount > 0`; `SeriesChart kind="lines"` of the year-end balance; the yearly schedule inside a closed `<details data-calc-panel>` as a real `<table>` with a caption.
- When `calculateMortgage` returns `null`, the results column shows only: "Enter a home price, a down payment smaller than the price, a rate and a term to see your payment."
- Under the headline, when PMI applies: "Includes mortgage insurance until payment {pmiEndPayment}." When the down payment is under 20% and PMI is 0: "With less than 20% down, most conventional loans add mortgage insurance. Add it under Add detail."
- The disclaimer prop is rendered under the results.

- [ ] **Step 1: Write the failing tests** with `renderToStaticMarkup`:
  - default render contains `$2,129`, the principal and interest on 320000 at 7% for 30 years, and the text of `exampleRateNote` and `disclaimer`;
  - the markup contains none of `NaN`, `Infinity`, `$-`, and none of the words `qualify`, `approved`, `eligible`, `your rate` (case-insensitive);
  - each typed field (`homePrice`, `downPayment`, `rate`, `yearlyTax`, `yearlyInsurance`, `monthlyHoa`, `monthlyPmi`, `extraAmount`) has one input whose id is matched by a `<label for>`, and each choice field (`downUnit`, `termYears`, `extraFrequency`) is a `<fieldset>` with a `<legend>`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** `Donut.tsx`, then `MortgageCalculator.tsx`.
- [ ] **Step 4: Run** `npx vitest run src/calculators`. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(calculators): mortgage calculator component"`

### Task 8: Mortgage page, landing page, menu and footer

**Files:**
- Create: `src/calculators/mortgage/content.ts`, `src/calculators/shared/CalculatorPage.tsx`, `src/app/(marketing)/calculators/mortgage/page.tsx`, `src/app/(marketing)/calculators/page.tsx`
- Modify: `src/components/CtaBand.tsx`, `src/calculators/registry.ts`, `src/content/nav.ts`, `src/content/nav.test.ts`, `src/components/nav/Nav.tsx` and any other caller of `navigationForFeatures`, `src/app/sitemap.ts`, the investment `page.tsx`

**Interfaces (Produces):**

```ts
// CtaBand: new optional prop. "link" renders a plain Button to secondaryHref and never the booking pop-up.
secondaryMode?: "schedule" | "link"; // default "schedule"

// shared/CalculatorPage.tsx (server component): breadcrumb to /calculators, h1, intro, children,
// "How this works", "Common questions", then the call to action.
export async function CalculatorPage(props: { entry: CalculatorEntry; intro: string; howItWorks: string[];
  questions: { q: string; a: string }[]; children: ReactNode }): Promise<JSX.Element>;

// nav.ts
export function navigationForFeatures(features: { ratesNavigation: boolean }, calculators: CalculatorEntry[]): NavItem[];
```

Pinned values:
- Registry entry: `{ slug: "mortgage", path: "/calculators/mortgage", label: "Mortgage calculator", question: "What will my mortgage payment be?", description: "Estimate your monthly payment with taxes and insurance, and see how extra payments change the payoff.", applyHref: "/apply/buy" }`, placed first.
- Call to action on every calculator page: `title="Like these numbers?"`, `lead="Start your application or talk it through with a loan officer."`, `primaryHref={entry.applyHref}`, `secondaryHref="/loan-officers"`, `secondaryLabel="Find a loan officer"`, `secondaryMode="link"`.
- Menu: the "Mortgage Calculators" item has `href: "/calculators"` and one link per enabled calculator. With none enabled, the item is omitted. "Affordability calculator" and "Cash-out calculator" are gone from `NAV` and from `FOOTER_COLUMNS`, where calculator links also come from the registry.
- `content.ts` is drafted by the implementer and reviewed by Zachary on staging. It must state: a conventional loan is assumed, and FHA, VA and USDA loans have different insurance and fees; mortgage insurance applies under 20% down and ends when the balance reaches 78% of the price; tax and insurance are the amounts the visitor typed. Three or four questions, each specific to mortgage payments. No formulas.

- [ ] **Step 1: Update `nav.test.ts` first.** Replace the "groups the requested tools" test: with two entries passed in, the item is `{ label: "Mortgage Calculators", href: "/calculators", items: [both links] }`; with `[]` there is no such item; no link anywhere in the returned navigation or in `FOOTER_COLUMNS` points to `/coming-soon` with "calculator" in its label.
- [ ] **Step 2: Add to `registry.test.ts`:** `CALCULATORS[0].slug === "mortgage"`.
- [ ] **Step 3: Run** `npx vitest run src/content/nav.test.ts src/calculators/registry.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement** the `CtaBand` prop, `CalculatorPage`, `content.ts`, the registry entry, the `nav.ts` change and its callers.
- [ ] **Step 5: Add the routes.** The mortgage `page.tsx` copies the investment page's shape: `buildMetadata`, `PageJsonLd`, `notFound()` when switched off, and `<CalculatorPage>` wrapping `<MortgageCalculator>` with the three config values. The landing `page.tsx` renders a card per enabled calculator (question as the heading, description, link) and calls `notFound()` when none are enabled. Add `"/calculators"` to the sitemap when at least one is enabled.
- [ ] **Step 6: Put the investment page on `CalculatorPage`'s call to action** by adding the same `CtaBand` under it in its `page.tsx`. Do not touch `InvestmentCalculator.tsx`; its markup snapshot must not change.
- [ ] **Step 7: Run** `npm run check` and `npm run build`. Expected: PASS. The build lists `/calculators`, `/calculators/mortgage` and `/calculators/investment`.
- [ ] **Step 8: Commit.** `git commit -m "feat(calculators): mortgage page, calculators landing page, registry-driven menu"`

### Task 9: Verify against the spec's "done" list

**Files:** none, unless a check fails.

- [ ] **Step 1: Run the built site locally** (`node .next/standalone/server.js` on a spare port) and confirm: `/calculators`, `/calculators/mortgage`, `/calculators/investment` return 200; `/calculators/nope` returns 404; `/sitemap.xml` lists the first three and not `/calculators/mbs`.
- [ ] **Step 2: Switched-off check.** Save a config with `calculators.disabled: ["mortgage"]` in the local database through `/admin/config`. Confirm `/calculators/mortgage` is 404 and absent from the menu, the landing page and the sitemap. Switch it back on.
- [ ] **Step 3: Phone width and keyboard.** At 390px wide the six fields and the headline are usable without horizontal scroll. Tab reaches every field, the "Add detail" summary and the schedule summary; Enter and Space open both.
- [ ] **Step 4: Print.** Print preview shows the results, the open detail section and the full schedule.
- [ ] **Step 5: Dashboard comparison.** Enter the `reference` case on the page and confirm the headline principal and interest is $1,398 and the first payment total is $1,832.
- [ ] **Step 6: Stop and ask Zachary** before deploying. With his OK: `scripts/deploy-ec2.sh` (no arguments), then repeat Step 1 against `https://staging.msfg.us`. Zachary then runs two scenarios of his own against the dashboard and reviews the page text.
