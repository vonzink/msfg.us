# Buy Funnel Refinements — Design

**Date:** 2026-06-16
**Status:** Approved (brainstorm 2026-06-16)
**Builds on:** the config-driven apply wizard (`src/content/flows.ts` → `Wizard.tsx` → `src/components/apply/steps/*`), the in-application Ask-AI panel (`src/components/apply/ask-ai/*`), and the officer-picker step the parallel session added to refi (`OfficerStep`).

## Summary

Six refinements to the purchase (`/apply/buy`) funnel, observed by the user on staging:
1. Wire the **dead help links** ("Why do we need this?" on the address step; "What is a first-time home buyer?" on the owned-property step) to **open the Ask-AI panel and auto-send the question** so the answer streams in.
2. Add an **"I don't have an address yet" (TBD)** link to the address step that marks the property to-be-determined and advances.
3. Add an **"Other"** option to the buy `propertyType` step.
4. Let the **down-payment** step **toggle Percent ↔ Amount**.
5. Add the **loan-officer selection** step to the buy flow (refi already has it).

These are localized changes; no backend/API changes. The Wizard already renders `type: "officer"` generically, so the officer step is config-only.

## Decisions locked (brainstorm 2026-06-16)

1. **Down payment capture:** store the entered **value + chosen unit**; the LOS/LO sees it **labeled** ("20%" or "$85,000") — no lossy conversion. Default unit shown = **Percent**, with a toggle to **Amount**. Switching units clears the field (so "20" never silently becomes "$20").
2. **Address TBD:** the link reads **"I don't have an address yet"**, records the property as **to-be-determined**, and advances. Officer-filtering falls back to the full roster when there's no property state.

## Architecture

### A. Help link → Ask-AI (one reusable mechanism, covers items 1)
- **`ApplyChatPanel`** gains `seedQuestion?: string`. A `useEffect` auto-sends it once when the panel `open`s on an **empty thread** (guarded by a `sentSeed` ref; reset when the panel closes so a different help link can seed next time). `useApplyChat.send()` already guards `busy`, so this is safe.
- **`Wizard`** gains `seedQuestion` state + `openAskAi(question?: string)` that sets the seed and opens the panel; `onClose` clears the seed. The floating "Ask AI" FAB calls `openAskAi()` (no seed → normal empty state with starter chips).
- **Step configs** (`flows.ts`) get an optional **`askPrompt?: string`** on the address + binary steps — the actual question sent to the assistant (richer than the link label where needed). The Wizard seeds with `step.askPrompt ?? step.help`.
- **`AddressStep`** + **`BinaryStep`** gain `onAskAi?: (question: string) => void` (and `AddressStep` surfaces `help?: string`). Their dead `<a href="#">` become `<button onClick={() => onAskAi(question)}>`.
- Seed questions: address → `"Why does this application ask for the property address, and how is it used?"`; owned-property → `"What is a first-time home buyer?"` (the existing label, sent verbatim).

### B. Address TBD (item 2)
- `AddressStep` gains `onTbd?: () => void` and renders a secondary link **"I don't have an address yet"** beneath the fields. Clicking it calls `onTbd`.
- The Wizard wires `onTbd` to set the address answer to a **TBD marker** and advance: a `StructuredAddress` of `{ line1: "Address to be determined", city: "", state: "", zip: "" }` (exported as `TBD_ADDRESS` from `AddressStep` for reuse). `toLocation()` then renders "Address to be determined"; `propertyState` is empty → the officer step shows all officers.

### C. "Other" property type (item 3)
- Add `{ label: "Other", icon: <same key refi uses> }` to the buy `propertyType` step's `opts` in `flows.ts`. (Confirm refi's "Other" icon during implementation and match it.)

### D. Down-payment %/$ toggle (item 4)
- **Answer model:** a currency step with a toggle stores a **`CurrencyAmount = { value: number | null; unit: "$" | "%" }`** instead of a bare number. Add this to the `AnswerValue` union (`leads.ts`) and the currency step's value typing.
- **`CurrencyStep`** gains an additive **`toggle?: boolean`**. When set: render a **Percent | Amount** segmented control above the input (default from the step's `unit`, i.e. Percent for down payment); the input adapts (`$` prefix + thousands for Amount, `%` suffix + 0–100 for Percent); switching units **clears the value**; `onChange` reports the full `{ value, unit }`. When `toggle` is absent, behavior is exactly as today (bare number, fixed unit) — purchase price, income, home value, mortgage balance are unaffected.
- **`flows.ts`:** the buy down-payment step gets `toggle: true`, and its `field` is renamed `downPaymentPct` → **`downPayment`** (it can now hold a % or a $ amount, so the `Pct` suffix would be misleading).
- **`Wizard`:** the currency renderer branches — toggle steps read/write the `CurrencyAmount` object; non-toggle steps keep the `number` path.
- **`buildLeadFields` (`applyFields.ts`):** a toggle currency answer maps to a single **labeled string** field, e.g. `downPayment: "20%"` or `downPayment: "$85,000"` — faithful to what the applicant entered, ready for the LO/LOS.

### E. Officer step in buy (item 5)
- Insert the officer step into `FLOW.buy` **after `income` (optional) and before the `form` step** (matching refi's placement): `{ type: "officer", q: "Who would you like to work with?", field: "loanOfficer", sub: "Pick a loan officer, or let us match you with the right fit." }`.
- **No Wizard or page changes** — the Wizard already finds the officer step (`officerIdx`), derives `chosenOfficer`, passes `propertyState` for filtering, and hands the officer to `FinishStep`; the apply page already passes the `officers` roster.

## Data flow

`FLOW.buy` answers normalize via `buildLeadFields(steps, answers)` → `Lead.answers` JSON (no migration). New/changed fields: `downPayment` (labeled string from the `{value,unit}` answer), `address` (may be the TBD marker), `loanOfficer` (officer slug or the "no preference" sentinel — already handled). The Ask-AI mechanism is client-only (no new server surface; it hits the existing `/api/v1/ai/chat`).

## Testing

**Unit (vitest):**
- `applyFields`/`buildLeadFields`: a toggle down-payment answer `{value:20,unit:"%"}` → `downPayment:"20%"`; `{value:85000,unit:"$"}` → `downPayment:"$85,000"`; a TBD address → location "Address to be determined"; existing fields unchanged.
- `flows`: buy `propertyType` includes "Other"; buy contains an `officer` step; the down-payment step has `toggle: true`; the address + binary steps carry an `askPrompt`/`help`.
- `CurrencyStep` toggle parsing (if a pure helper is extracted) — clamp 0–100 for %, thousands for $.

**Browser (preview, `/apply/buy`):**
- "Why do we need this?" and "What is a first-time home buyer?" open the Ask-AI panel and the answer streams.
- "I don't have an address yet" advances; the finish/LOS shows the address as TBD.
- Property type shows "Other".
- Down payment toggles Percent ↔ Amount; switching clears; the value persists into the funnel; finish shows the labeled value.
- The officer step appears with state-filtered officers + "No preference"; the chosen officer reaches the finish step.
- Regression: refi flow + the floating Ask-AI FAB (no-seed empty state) still work.

## Out of scope / follow-ups

- No changes to refi (it already has "Other" + the officer step).
- The category-page payment estimator math (separate from the wizard) is untouched.
- TBD address does not attempt geocoding or later prompting; the LO completes it.
- No new credit pull / soft-pull (unchanged).
