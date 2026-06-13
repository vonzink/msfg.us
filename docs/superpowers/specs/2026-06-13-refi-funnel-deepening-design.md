# Refi Application Funnel — Deepening Design

**Date:** 2026-06-13
**Status:** Approved (brainstorm 2026-06-13)
**Reference:** Better.com refinance flow (15 borrower screens supplied by the user
as visual reference). Recreate the *pattern* with MSFG tokens/components — not a
copy. Existing surface: `/apply/[intent]` wizard ([Wizard.tsx](../../../src/components/apply/Wizard.tsx),
[flows.ts](../../../src/content/flows.ts)) from Phase 1.

## Summary

Deepen the refinance branch of the existing apply wizard from a thin 5-step
lead funnel into a Better-grade **qualified-lead funnel**, then hand the borrower
to the LOS (`app.msfgco.com`) — **prefilled with everything collected** — or to a
loan officer. The website does **not** become a point-of-sale: no credit pull, no
1003, no account-management portal. Those live in the LOS.

Build the new step types generically so `buy` and `cash` adopt them in a
follow-up; **refi is deepened now**.

## Scope decisions (locked)

1. **Funnel → LOS** (not a POS). The website captures a rich qualified lead and
   hands off; the LOS owns the real application.
2. **Finish = two doors, borrower picks:** (a) **Continue in the app** — route to
   the LOS prefilled with all collected fields; (b) **Talk to a loan officer** —
   GHL calendar booking (Phase 3).
3. **Property address = Google Places autocomplete**, behind a swappable
   server-side `AddressProvider` interface (key never in the browser).
4. **Qualifying depth = full, income optional:** home value → mortgage balance →
   self-reported credit band → optional household income.
5. **No soft credit pull.** Credit is a self-reported band only (no SSN, no FCRA
   surface). "MSFG isn't ready for soft pulls."

## Non-goals (LOS owns these — reference only)

- Soft/hard **credit pull**, SSN capture, FCRA authorization.
- **Account-management portal**: change email/phone, 2FA, password reset,
  communication preferences.
- **Mid-funnel account gate / sign-in** ("Looks like you have an account" as a
  blocking step). Recognition is handled at the finish (see below); a mid-funnel
  prompt is a future upgrade, not this spec.
- The full **1003** (income/employment/assets/REO/liabilities/declarations/HMDA),
  document upload, e-sign.
- Borrower **account creation on the website** is deferred (the borrower Cognito
  pool `us-west-1_KSSdUL3FW` refactor is paused). The "Continue in the app" door
  uses SSO when already signed in, else a deep-link/secure link into the LOS,
  where account creation happens. The funnel never forces a login.

## The refi path

Entry is the hero `IntentTabs` → `/apply/refi`. Steps in order (★ = built/upgraded
this phase; ☐ = reuses an existing step):

1. ★ **Refinance goals** — multi-select: *Lower my monthly payment · Long-term
   savings · Take cash out · Just checking rates*. "Select all that apply."
2. ★ **Property address** — Google Places autocomplete + secondary **Apt/Unit**
   and **ZIP** fields (mirrors the reference). Stores structured address.
3. ☐ **Property use** — *Primary residence · Second home · Investment property*.
4. ☐ **Property type** — *Single-family · Condo · Townhouse · Manufactured home*
   (options are config; default to this set).
5. ★ **Estimated home value** — currency input.
6. ★ **Current mortgage balance** — currency input.
7. ☐ **Estimated credit score** — self-reported band: *Excellent 740+ · Good
   680–739 · Fair 620–679 · Below 620 · Not sure*. (Reuses `choice`; no pull.)
8. ★ **Household income** — currency, **optional/skippable**.
9. ★ **Contact** — captured in two sub-screens for conversion (Better pattern):
   first name + last name + email, then **phone + TCPA consent**, personalized
   "Hi {firstName}!". **The lead fires when phone is submitted.**
10. ★ **Finish — two doors:** *Continue in the app* (prefill → LOS) ·
    *Talk to a loan officer* (GHL calendar).

## Engine extensions

The wizard is config-driven (`FLOW[intent]: Step[]` → typed renderers). Add four
step types; credit band reuses `choice`.

| Type | Renders | Stores | Advance |
| --- | --- | --- | --- |
| `multi` | checkbox list + Continue | `string[]` | explicit Continue |
| `address` | Google Places autocomplete + Apt/Unit + ZIP | `{ line1, line2?, city, state, zip, placeId? }` | explicit Continue |
| `currency` | formatted `$` input; `optional?: true` adds a Skip | `number \| null` | explicit Continue / Skip |
| `finish` | two-door end (LOS prefill · GHL booking) | — | terminal |

- `choice` / `binary` keep **auto-advance** (260ms). `multi` / `address` /
  `currency` / `form` use an explicit Continue.
- The enhanced **contact** (`form`) renders two sub-panes (name+email → phone+TCPA)
  with personalization; lead fires on phone submit. No new top-level type.
- `finish` **evolves the current mock `AccountStep`** — it already has signed-in
  detection + the `losClient` hand-off + the "Continue in the MSFG app" deep link;
  we add the second door (GHL calendar) and the prefill payload.

New types live in `src/components/apply/steps/` next to the existing renderers;
`flows.ts` gains the new step shapes + a deepened `FLOW.refi`.

## Address autocomplete — provider interface

The Google key **never reaches the browser**. A thin client `AddressAutocomplete`
component calls our own endpoints; a server-side provider talks to Google.

- `src/server/integrations/address/` — `AddressProvider` interface
  (`suggest(query) → Suggestion[]`, `details(id) → StructuredAddress`),
  `GooglePlacesProvider` (first impl), and `getAddressProvider()` (selects by
  config; `MapboxProvider` swappable later).
- Routes `GET /api/v1/address/suggest?q=` and `GET /api/v1/address/details?id=`
  wrap the provider (rate-limited, tenant-agnostic for MSFG).
- Key: `GOOGLE_PLACES_API_KEY` from env / `SecretStore`. **Graceful degrade:** if
  no key is configured, `address` renders a **validated free-text street field**
  (+ Apt/Unit + ZIP) so dev/staging never breaks and the funnel still ships.
- Debounced session-token requests (Google session pricing); referrer/IP-scoped.

## Data flow (no migration)

- A **pure** `buildRefiLeadFields(answers)` normalizes the index-keyed answers into
  named fields: `goals: string[]`, `propertyUse`, `propertyType`, `homeValue`,
  `mortgageBalance`, `creditBand`, `income?`, `address`. These ride in the existing
  `Lead.answers` **Json** column; the formatted address also populates
  `Lead.location`. **No schema change.**
- The wizard's answer map widens from `Record<number, string>` to
  `Record<number, AnswerValue>` where `AnswerValue = string | string[] | number |
  StructuredAddress | null`. `LeadPayload.answers` widens to match.
- Lead pipeline is unchanged: client → `POST /api/v1/leads` → `captureLead`
  (Postgres system-of-record, idempotent) → best-effort GHL sync. GHL gains
  best-effort **custom-field mapping** for the new named fields (in the GHL
  integration layer only; never blocks the user).

## Finish: prefill hand-off + booking

Account recognition happens **here**, not mid-funnel (locked decision): the funnel
never forces a login; the LOS is the borrower's real account home, so sign-in /
resume belongs at the hand-off.

- **Continue in the app:** build a `LosPrefill` payload from
  `buildRefiLeadFields` + contact, then:
  - **already signed in** (Cognito session) → greet by name; `losClient` prefill
    call (`LOS_API_BASE`, id_token Bearer, best-effort) + SSO deep-link that
    **resumes** their existing application in `app.msfgco.com`;
  - **not signed in** → deep-link with the lead reference (`leadId`) so the LOS
    can rehydrate; the borrower signs in or creates their account **in the LOS**
    (Hosted UI), where account existence is resolved natively;
  - `LOS_API_BASE` unset (today) → deep-link only, no prefill call. Graceful at
    every stage.
- **Talk to a loan officer:** the Phase-3 GHL calendar (`ScheduleCallButton` /
  `GhlCalendar`); falls back to a tel/contact link when unconfigured.
- A short "what happens next" confirmation either way.

### Returning-borrower recognition (best-effort, non-blocking)

So the loan officer knows a lead is a returning contact, `captureLead` sets a
**`returning` flag** by matching the email server-side, in priority order, all
best-effort and never blocking the user:

1. an authenticated Cognito session on the request (definitive — we know them);
2. an existing tenant `Lead` with the same email in Postgres (they've been here
   before);
3. a GHL contact match by email, when the GHL integration is configured.

`AdminGetUser` against a Cognito pool is **deferred** (needs server AWS creds + a
resolved authoritative borrower pool) — listed as a follow-up, not built now. The
flag rides in `Lead.answers` (no migration) and maps to a GHL custom field.

## Compliance

- **TCPA** consent on the phone sub-screen (existing `consentTcpa`), captured with
  the lead. No new regulated surface — self-reported band carries no FCRA
  obligation; no SSN is collected.
- Tenant-aware throughout (lead is tenant-scoped; address routes tenant-agnostic
  for MSFG dedicated mode).

## Build sequencing

1. Engine + step types (`multi`, `currency`, `address` w/ graceful text
   fallback, `finish`) — generic, with unit tests.
2. `AddressProvider` interface + Google impl + the two API routes.
3. `buildRefiLeadFields` normalizer + widen answer/lead types + GHL field mapping.
4. Deepen `FLOW.refi`; wire the two-door finish + LOS prefill payload.
5. Browser verification; then a follow-up adopts the new steps for `buy`/`cash`.

## Testing

- **Unit (vitest, node):** `buildRefiLeadFields` (each field + optional income +
  missing answers); currency parse/format/`null`; `StructuredAddress` shape;
  step-progression (auto-advance vs explicit Continue; Skip on optional);
  `AddressProvider` suggest/details mapping (mocked HTTP); graceful-degrade
  (no key → text field); the **`returning` matcher** (signed-in / prior-lead /
  GHL precedence; no match → false; never throws).
- **Browser (preview):** full refi run end-to-end — goals multi-select, Google
  autocomplete (and the text fallback), currency masks, optional-income skip,
  split contact + "Hi {name}!" + TCPA, lead fires on phone, both finish doors
  (prefill deep-link + GHL booking), progress bar, back navigation, mobile.

## Open follow-ups (not this spec)

- Borrower account creation on the website (resume the paused borrower Cognito
  pool work) — would let "Continue in the app" create the account pre-handoff,
  and unlock **mid-funnel recognition** (server `AdminGetUser` against an
  authoritative borrower pool → a non-blocking "welcome back" prompt).
- `buy` / `cash` flow deepening using the new step types.
- Optional "instant estimate" teaser (new payment / cash available) from value +
  balance + goal on the contact or finish screen — conversion booster.
