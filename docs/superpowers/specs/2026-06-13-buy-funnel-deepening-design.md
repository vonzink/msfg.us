# Purchase (Buy) Application Funnel — Deepening Design

**Date:** 2026-06-13
**Status:** Approved (brainstorm 2026-06-13)
**Reference:** Better.com purchase flow (5 borrower screens supplied by the user).
**Builds on:** the refi funnel engine — `docs/superpowers/specs/2026-06-13-refi-funnel-deepening-design.md` and its plan. That engine (the `multi`/`address`/`currency`/`finish` step types, `DeckStage` motion, `buildLeadFields`, the `returning` flag, `AddressProvider`, `ContactStep`, two-door `FinishStep`) currently lives in **unmerged PR #4**. The buy work depends on it.

## Summary

Deepen the `buy` branch of the apply wizard to Better-grade parity, exactly as
refi was deepened — reusing the engine verbatim and only adding buy-specific
**content** plus two tiny engine extensions. No credit pull, no 1003, no account
portal (LOS owns those). **No DB migration** (named answers ride `Lead.answers`).

## Scope decisions (locked)

1. **Funnel → LOS**, same as refi. Two-door finish (continue in the app, prefilled
   → LOS / talk to a loan officer → GHL). Returning-borrower flag. No soft pull.
2. **Down payment = purchase price ($) + down payment (%).** The % is captured
   as a number; the LOS/LO derives down-dollars and loan amount.
3. **Full qualifying**, parallel to refi: first-time-buyer binary → purchase
   price → down payment % → self-reported credit band → optional income.

## The buy path

Entry: hero `IntentTabs` → `/apply/buy`. ★ = built/extended here; ☐ = reuses the
refi engine unchanged.

1. ★ **Buy stage** — single-select `choice`, field `buyStage`:
   *Signed a purchase agreement · Making offers · Going to open houses · Just
   researching*. (Replaces the old "When do you plan to buy?" step.)
2. ☐ **Property address** — `address` (Google Places + Apt/Unit + ZIP, text
   fallback). field `address`.
3. ☐ **Property use** — `choice`, field `propertyUse`: *Primary residence ·
   Second home · Investment property*. Keeps a social-proof `sub` (static for
   v1 — see follow-ups).
4. ★ **Property type** — `choice`, field `propertyType`, **buy options**:
   *Single Family · Condo · Co-op · 2 to 4 units · Manufactured home* (buy adds
   Co-op + 2–4 units vs refi's set). `review: true`.
5. ☐ **First-time buyer** — `binary`, field `ownedLast3yr`: "Have you owned any
   property in the last three years?" with the `help` link "What is a first-time
   home buyer?". (Drop the `usatoday` badge to match Better's cleaner screen.)
6. ★ **Purchase price** — `currency` (`$`), field `purchasePrice`.
7. ★ **Down payment** — `currency` with **`unit: "%"`**, field `downPaymentPct`.
8. ☐ **Estimated credit score** — `choice`, field `creditBand` (self-reported,
   no pull): Excellent 740+ / Good 680–739 / Fair 620–679 / Below 620 / Not sure.
9. ☐ **Household income** — `currency` (`$`), `optional: true`, field `income`.
10. ☐ **Contact** — `ContactStep` (name+email → phone+TCPA, "Hi {name}!"); lead
    fires on phone submit.
11. ☐ **Finish** — `FinishStep` (two doors, LOS prefill via `buildLeadFields`,
    GHL booking, returning recognition).

## Engine extensions (small)

The refi engine covers ~90%. Two additive changes:

1. **Currency `%` unit.** Add optional `unit?: "$" | "%"` to the `currency` step
   shape (`flows.ts`) and to `CurrencyStep` (default `"$"`). When `"%"`: render a
   trailing `%` (instead of the leading `$`), and clamp the parsed value to
   `0–100`. `$` behavior is unchanged. `buildLeadFields`/`parseCurrency` are
   unaffected (the value is still a number). This is the only renderer change.
2. **Two option icons.** `buyStage` and "2 to 4 units" want apt glyphs. Add
   `StepIconKey` entries (e.g. `doc` for "Signed a purchase agreement", `search`
   for "Just researching", `units` for "2 to 4 units") mapped to lucide icons in
   `steps/icons.tsx`. Reuse existing keys where they already fit (`house`,
   `invest`, `mailbox`, `condo`, `coop`, `help`).

Everything else — `MultiStep` (unused by buy), `AddressStep`, `ContactStep`,
`FinishStep`, `DeckStage`, `buildLeadFields`, the `returning` resolver, the
`/api/v1/address/*` routes, the Wizard switch (already renders every step type),
the `place`→`address` and `account`→`finish` routing — is reused with **no
change**. `FLOW.buy` is rewritten; `FLOW.refi` and `FLOW.cash` are untouched.

## Data flow (no migration)

`buildLeadFields(FLOW.buy, answers)` → named fields (`buyStage`, `address`,
`propertyUse`, `propertyType`, `ownedLast3yr`, `purchasePrice`, `downPaymentPct`,
`creditBand`, `income?`) → `Lead.answers` JSON + `location` from the address.
Same pipeline as refi (`submitLead` → `/api/v1/leads` → `captureLead` →
best-effort GHL + `returning` flag). The two-door finish hands the named fields
to the LOS via `/api/v1/applications` when signed in.

## Compliance

TCPA on the phone sub-screen (unchanged). Self-reported credit band → no FCRA
surface. First-time-buyer + property questions carry no new regulated surface.

## Testing

- **Unit (vitest):** extend `applyFields.test.ts` / a currency test for the `%`
  unit (clamp 0–100, parse, format with `%`); `buildLeadFields` over the buy
  steps (named keys incl. optional income skipped, the `binary` Yes/No value,
  the `%` number). `icons` smoke (new keys resolve).
- **Browser (preview):** full buy run — buy-stage auto-advance, address +
  fallback, property use/type (5 opts), first-time-buyer binary, purchase price
  ($) + down payment (%), credit band, optional income skip, split contact +
  lead fires, both finish doors; deck motion; mobile; reduced motion.

## Sequencing (dependency on PR #4)

The engine is in unmerged PR #4. Build buy **on a branch off `refi-funnel-deepening`**
(stacked) so it has the engine, OR merge PR #4 to `main` first and branch off
`main`. Decide at execution time. The buy PR targets `main` (it will include the
refi commits until #4 merges, or just the buy delta after).

## Out of scope / follow-ups

- **Dynamic social-proof sub** on property-use (live count + the state from the
  address answer, "…helped N customers in {state}"). v1 uses a static sub;
  wiring the state across steps is a follow-up.
- `cash` flow deepening (same engine, separate pass).
- Soft credit pull, account portal, full 1003 — LOS owns these (unchanged).
- Buyer-specific "instant affordability" teaser (price + down% + credit →
  estimated payment) on the contact/finish screen — optional booster, later.
