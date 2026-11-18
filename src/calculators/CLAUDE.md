# Calculators

Rules for anything under `src/calculators/`. Full walkthrough for humans: `docs/CODEBASE.md`, section "Adding a calculator".

## Layout

- One folder per calculator, named after its URL slug: `src/calculators/<name>/`.
- Copy `investment/` as the starting shape:
  - `<Name>Calculator.tsx` is the `"use client"` component.
  - `math.ts` is the model.
  - `fields.ts` holds input definitions, defaults and limits.
  - `*.test.ts` sits beside the file it covers.
- The route is the only file outside this folder: `src/app/(marketing)/calculators/<name>/page.tsx`. Keep it thin: metadata, breadcrumb, heading, and the calculator component.

## Math

- `math.ts` is pure functions only. No React, no DOM, no `Date.now()`, no fetching.
- Rates are decimals in the model (0.06 = 6%). Convert percentages at the field boundary, not inside the math.
- Write down every assumption in the comment block at the top of `math.ts`, the way `investment/math.ts` does. State what is not modelled.
- Use `formatUSD` and the amortization helpers from `src/lib/finance.ts`. Do not write a second rounding or payment formula.
- Every change to a formula needs a test with a hand-checked number. Change the test first.
- `investment/math.ts` is ported from msfg-calc `legacy/calc-reo/reo-math.js`. Keep the two in step and say so when one changes.

## Sharing

- Never import from one calculator's folder into another.
- When two calculators need the same input, gauge or chart, move it to `src/calculators/shared/`. Create that folder the first time it is needed.

## Wording

- Results are estimates. Do not present them as a quote, an approval, or tax advice.
- Do not show a rate or APR as an offer. Rates here are numbers the visitor typed in.

## Wiring a new calculator

1. Add the route page.
2. Link it in `src/content/nav.ts`.
3. Add the path to `ROUTES` in `src/app/sitemap.ts`.
4. Run `npm run check`.

## Do not

- Put calculators in `public/`. Next.js serves that folder as-is and never compiles it.
- Edit anything in `mbs/` by hand. It is plain HTML, CSS and JS generated from the msfg-calc repo. Change the page there and rerun `scripts/sync-where-the-money-goes.mjs`.
- Copy the shape of `mbs/` for a new calculator. It is served by the route handler at `src/app/(marketing)/calculators/mbs/[[...path]]/route.ts` because it is not React. New calculators follow `investment/`.
