# Funnel pivot: officer-picker search/grid + finish-step LO off-ramp

**Date:** 2026-06-27 · **Status:** Draft · **Tenant:** MSFG (tenant #1)

## Context & motivation

The apply funnel (`src/app/apply/[intent]/page.tsx` → `src/components/apply/Wizard.tsx`) is the primary conversion path: a multi-step wizard that captures a lead, lets the borrower pick a loan officer, and hands off to the self-serve loan application at `/continue` on the downstream app (`app.msfgco.com`).

Two related frictions motivate this work:

1. **The officer picker scrolls.** `OfficerStep.tsx` renders a single tall `flex flex-col gap-3.5` column of full-width tiles (lines 62–93), each `min-h-[78px]`. Inside the wizard's `max-w-[560px]` step box (`Wizard.tsx:155`), even the in-state subset of a 16-officer roster (`src/content/officers.ts`, OFFICERS, 16 entries) requires vertical scrolling, and there is no way to reach a *named* officer who is not licensed in the property state without clicking "Show all" and scrolling further. There is no search affordance today (`OfficerStep.tsx` has only `useState(showAll)` at line 44).

2. **The finish step is now a black box.** Commit `90188bb` (2026-06-25, owner request, cited in `FinishStep.tsx:9–17`) made the finish step **auto-redirect on mount**: it mints a hand-off token in one effect (`FinishStep.tsx:38–57`) and then `window.location.href`-redirects to `${APP_URL}/continue?t=…` the instant the token lands (`FinishStep.tsx:60–64`). The borrower never sees a screen on the happy path — only a "Taking you to your application…" spinner (`FinishStep.tsx:98–103`). This optimizes the self-serve path but removes any branded moment to connect the borrower with the human officer they may have just chosen.

**The tension, and how we mitigate it.** Part 2 *partially reverses* `90188bb`: it re-introduces a rendered finish screen and moves the redirect from on-mount to on-click. This is a deliberate UX reversal of an owner-requested change, not a refactor. We mitigate the regression risk three ways:

- **Preserve the weighting.** "Continue your application" stays the visually-weighted PRIMARY action (the green 3D press button). The human-contact options are a quiet, SECONDARY, *reveal-on-demand* off-ramp — never a co-equal fork. The self-serve handoff target (`/continue`) is unchanged.
- **Keep the click instant.** We keep the on-mount token mint as a **pre-warm** (reuse `FinishStep.tsx:38–57` verbatim) so the Continue click navigates immediately; we only delete the auto-navigate effect (`FinishStep.tsx:60–64`).
- **Measure it.** Part 2 emits analytics (`finish_view`, `continue_click`, `continue_fallback_shown`, `offramp_open`, `offramp_phone_prompt`, `offramp_phone_submit`, `channel_select:*`, `contact_request_ok`, `contact_request_fail`) so the impact of re-adding a screen vs. the auto-redirect baseline is observable, and so a spike in token failures vs. a genuine off-ramp choice are distinguishable (rollout below). If Continue-through rate regresses materially, the rendered screen can be reverted to auto-redirect behind the flag without losing Part 1.

This is **one spec, two parts**. Ship **Part 1 first** (frontend-only, low risk), then **Part 2**. MSFG is tenant #1 of a multi-tenant platform; all copy, channels, branding, and the house line come from per-tenant config, never hardcoded module-level `SITE`/env (AGENTS.md).

## Goals / Non-goals

**Goals**
- Part 1: a name-only live search pinned atop the officer picker that instantly matches across the full 16-officer roster; a compact 4-column photo-forward avatar grid (2 columns on mobile) so ~8 officers fit in ~2 rows with no scroll; NMLS detail moved off the tile face; all existing select/auto-advance/a11y behaviors preserved. Pure frontend — no API or data-model change.
- Part 2: convert the finish step from on-mount auto-redirect to a rendered screen whose Continue button performs the mint+redirect on click (pre-warmed, TTL-aware, with a pending/disabled state during a click-time re-mint); add a reveal-on-demand LO off-ramp (Call / Text / Email + ~15-min callback promise) personalized with the chosen officer; record contact requests server-side best-effort and non-blocking; **hard-gate call/text contact-requests that use a recaptured number behind affirmative TCPA consent (UI + server enforcement)**; thread officer email/phone and tenant off-ramp config to the component.

**Non-goals**
- No calendar/scheduler booking in the off-ramp (explicitly out of scope for v1; noted as a v2 option).
- No promotion of `contactPreference` to a real DB column (v1 stores it in `lead.answers.fields`; DB is live prod RDS).
- No branded inline auth (`AccountPanel`) work — that is a separate, currently-stale plan. Part 2 only *reuses* its officer-type widening (see Officer type widening below).
- No change to the downstream `/continue` contract (it keeps accepting `?t=<token>`).
- No CRM officer-assignment or task-creation endpoints unless explicitly scoped below (v1 = tag-only).

---

## Part 1 — Officer picker: search + two-row grid

### Current state (cite files)

- `src/components/apply/steps/OfficerStep.tsx` (whole file, 1–123). Client component. Exports `ApplyOfficer` (`slug/name/title/nmls/states/photo`, lines 10–17) and the `NO_PREFERENCE` sentinel (line 20). Sole state is `const [showAll, setShowAll] = useState(false)` (line 44). In-state filter logic at 45–51: `inState` = officers filtered by `propertyState`; `filtered` = `inState.length>0 && !showAll`; `visible` = `filtered ? inState : officers`; `hiddenCount`. Renders a "Licensed in <state>" note (55–60), a single vertical `flex flex-col gap-3.5` list of full-width tiles (62–93) — each `min-h-[78px]` with a `size-12` round avatar + name (17px bold) + title (13px green-600) + an `NMLS #x · Licensed in STATES` line (12.5px), with selected/hover/focus classes (72–76); a "Show all loan officers" text link shown only when `filtered && hiddenCount>0` (95–103); the full-width "No preference — match me" button (105–117); and an optional muted `sub` line (119).
- `src/components/apply/Wizard.tsx` (19, 23, 89–100, 124–128, 153–155, 221–229). Renders `OfficerStep` inside a `mx-auto w-full max-w-[560px] text-center` step box (line 155). **Auto-advance is owned here, not the tile:** `OfficerStep` gets `onPick={pickAuto}` (227); `pickAuto` (96–100) stores `answers[idx]=value` then `setTimeout(next, AUTO_ADVANCE_MS=260ms)` (23). `propertyState` is derived from the address step (119–122) and passed in (224); `selected` = the answer string (226).
- `src/app/apply/[intent]/page.tsx` (48–55, 57–69). Server Component. Derives the **full 16-officer roster** via `listOfficers()` and maps to `ApplyOfficer[]` (`slug/name/title/nmls/states/photo` — no email/phone), passing the whole array to `<Wizard officers={…}/>`. The full roster is already client-side, so name-only search needs no data/API change.
- `src/components/glossary/GlossaryExplorer.tsx` (13, 25–36, 76–104, 142–145). Existing name-only live-filter pattern to copy: `useState('')` query, `q=query.trim().toLowerCase()`, `useMemo` filter on `.toLowerCase().includes(q)`, real sr-only `<label htmlFor>` + `type="search"` input, magnifier SVG (82–94), and a "No terms match" empty state (142–145). No shared `<SearchInput>` exists — it is an inline pattern.
- `src/components/apply/steps/ChoiceStep.tsx` (54–83). Reference tile pattern: `aria-pressed` button with the identical selected vs. default class strings used for state consistency.
- `src/components/apply/steps/PlaceStep.tsx` (33, 37–40). Reference field/input pattern — note line 37–39 fires `onNext` on Enter and line 33 uses `autoFocus`. The new officer search input must inherit **neither**.
- `src/app/globals.css` (42–52, 103–107). `--radius-lg=12px` (`rounded-lg`), `--shadow-3d`/`--shadow-pop`; global `:focus-visible` ring (103–107) = 2px `spring-3` outline that already applies to every `<button>`.
- `src/content/officers.ts` (46–48 `stateName`, 56–327 OFFICERS 16 entries). `stateName(code)` is already imported by `OfficerStep` (line 6) for the "Licensed in" note.

### Changes

- **Search box (pinned top, always visible).** Add a name-only `type="search"` input pinned above the "Licensed in <state>" note and the grid, copying the GlossaryExplorer markup/state shape. It filters by name across **all 16 officers**. A non-empty query escapes the in-state default (acts as an instant "Show all"). Empty query → existing in-state-default behavior unchanged. The input is a pure filter: **Enter must not select or advance** (do not inherit `PlaceStep`'s Enter→onNext, `PlaceStep.tsx:37–39`). There is **no enclosing `<form>`** in the wizard step box (`Wizard.tsx:155` is a `<div>`), so a stray Enter is structurally incapable of submitting/advancing — the only way to break this is for a dev to wire `onKeyDown`; **do not add any `onKeyDown` to the search input.** Do not `autoFocus` (avoid stealing focus mid-funnel — `PlaceStep.tsx:33` does autoFocus; the officer search must not); the input must retain focus while typing (do not re-key/remount it as the grid filters).
- **Grid (4-col desktop → 2-col mobile).** Replace the single vertical column with `grid grid-cols-4 gap-3 max-[980px]:grid-cols-2` (use the project's 980px breakpoint convention per AGENTS.md — not Tailwind `md:`/`lg:`). No 3-col intermediate (confirmed: 4 desktop / 2 mobile only). The grid lives inside the existing `max-w-[560px]` box → tiles ≈ 120–130px wide.
- **Tile redesign (photo-forward).** Each tile: avatar on top (centered), name + title below (centered), `aria-pressed` button. NMLS + license states move **off the tile face** into the button's `title` attribute and `aria-label` (so hover users and screen readers still get them; name + title stay visible). Tile is `min-h` sized to its content, not the old 78px row.
- **Preserved behaviors.** Tap-to-select auto-advance (still `onPick(slug)` → parent `pickAuto`, zero Wizard change); the "No preference — match me" button stays a separate full-width button **below** the grid (not part of the `.map()`); selected/hover/focus class strings stay identical to today/`ChoiceStep`; global focus ring applies automatically.
- **"Show all" link removed.** Typing now *is* the instant Show-all, so the separate "Show all loan officers" text link (`OfficerStep.tsx:95–103`) and the `showAll` state are removed. The in-state default still shows pre-typing; the search input is the documented affordance to reach the rest. The search `<label>` text ("Search loan officers by name") is the discoverability affordance for keyboard/SR users who need to reach an out-of-state officer.
- **Empty state.** When a non-empty query matches no officer, render an `aria-live="polite"` empty-state line (e.g. `No officers match "<q>"`), mirroring GlossaryExplorer 142–145, so the filter result is announced. The user query is interpolated **only as a React text node** (auto-escaped); it must **never** be concatenated into a raw `title`/`aria-label`/HTML-ish attribute string by hand.
- **Single-match behavior.** When a query matches exactly one officer, that single tile is a **normal tap-to-select target** — there is no auto-select and no auto-advance from search (Enter does nothing; selection is always a tile tap → `onPick(slug)` → parent `pickAuto`).
- **"PropertyState set, zero in-state matches" case (intended).** When `propertyState` is set but no officer is licensed there, the existing `inState.length > 0` guard already falls through to showing the **full roster with NO "Licensed in <state>" note**. This is the intended behavior (do not surface a confusing empty "Licensed in <state>" affordance) — QA should verify it.

### Component design (no data changes)

**State shape** (co-located with existing derivation at lines 45–51):
```ts
const [query, setQuery] = useState("");
const q = query.trim().toLowerCase();
```
**Filter logic** (`useMemo`, deps `[officers, propertyState, q]`):
- `inState` = `propertyState ? officers.filter(o => o.states.includes(propertyState)) : []` (unchanged).
- `searching` = `q.length > 0`.
- `visible` = `searching ? officers.filter(o => o.name.toLowerCase().includes(q)) : (inState.length > 0 ? inState : officers)`.
- The "Licensed in <state>" note shows only when `!searching && inState.length > 0` (so the zero-in-state case shows the full roster with no note).

**a11y**
- Search input: real sr-only `<label htmlFor>` (e.g. "Search loan officers by name"), `type="search"`, `inputMode="text"`. No `autoFocus`, no `onKeyDown`.
- Tiles: keep `type="button"` + `aria-pressed={selected===o.slug}`; add `aria-label={`${o.name}, ${o.title}, NMLS #${o.nmls}, licensed in ${o.states.map(stateName).join(", ")}`}` and a matching `title` so the off-face NMLS/states remain accessible. (These are built from the static officer record, never from the user's search query.)
- Avatar `<Image alt="">` stays decorative (the name is the accessible label via tile text/aria-label).
- Empty-state container is `aria-live="polite"`.
- Visible focus ring comes from the global `:focus-visible` rule — no per-element focus styling.

**Exact tokens / breakpoints**
- Grid: `grid grid-cols-4 gap-3 max-[980px]:grid-cols-2`.
- Tile container: `rounded-lg border-[1.5px] p-3 text-center` + the existing selected/default strings — selected: `border-green-600 bg-green-600 text-white [box-shadow:0_4px_0_#0a3a2a,var(--shadow-pop)]`; default: `border-line bg-white text-ink shadow-3d hover:-translate-y-0.5 hover:border-green-600 hover:shadow-pop`.
- Avatar: keep the existing `size-12` round avatar treatment (`relative size-12 shrink-0 overflow-hidden rounded-full border border-line bg-paper-2`), centered (`mx-auto`).
- Name: `text-[14px] font-bold leading-tight` (down from 17px to fit ~120px tiles); title: `text-[12px] font-semibold` (`on ? text-white/85 : text-green-600`). Long names (e.g. "Michael Grensteiner", "Robert Hoff, CFA") must wrap rather than overflow — allow two lines / `break-words`; do not truncate the name into illegibility.
- Search input: reuse the wizard-consistent field treatment from `PlaceStep.tsx:40` (`rounded-lg border-[1.5px] border-line shadow-3d focus:border-green-600`) for visual consistency with other steps, with a leading magnifier (GlossaryExplorer SVG, 82–94) and `pl-12`.

**Contrast note (a11y, AGENTS.md):** moving NMLS off the tile face also resolves the borderline `text-white/75`-on-`green-600` small-text contrast of the current NMLS line. Name + title remain; keep title at `text-white/85` on selected (already used).

**SSG:** no `Date.now()`/`new Date()` at render scope (none needed). Component stays a client component within a statically-generated route — fine.

### Files touched

- `src/components/apply/steps/OfficerStep.tsx` — add search state + input, replace column with grid, redesign tile, move NMLS/states to `title`/`aria-label`, remove `showAll` + "Show all" link, add empty state. **No change to `ApplyOfficer` for Part 1.**
- No other files. `Wizard.tsx`, `page.tsx`, content modules unchanged.

---

## Part 2 — Finish-step LO off-ramp

### Current state (cite files)

- `src/components/apply/steps/FinishStep.tsx` (whole file, 1–104). Current = the `90188bb` auto-redirect: effect #1 (38–57) mints the token on mount (`POST /api/v1/applications`, body `{ leadId }`, `fired.current` guard); effect #2 (60–64) sets `window.location.href = ${APP_URL}/continue?t=${token}` once `token` lands. Failure sets `failed` and renders a manual fallback (67–95): "Continue in the {shortName} app" (→ bare `APP_URL`, **no `?t=`**) + an "or" divider + a book/officer CTA — the *only* place the current `officer` prop is read (68–70). Happy path renders only a spinner with `aria-live="polite"` (98–103). The `officer` prop type is the **narrow** `{ slug: string; name: string } | null` (31). No `Date.now()`/`new Date()` anywhere.
- `src/app/api/v1/applications/route.ts` (whole file, 1–44). Mints the hand-off token. Validates `{ leadId }`, loads via `getLeadById` (32), resolves the officer slug from `lead.answers.fields.loanOfficer` via `resolveOfficerName` against bundled OFFICERS (11–15, 35–37) → `{ name, slug } | null` (it deliberately does **not** project email/phone), builds the payload (`buildHandoffPayload`, 38), signs with `HANDOFF_TOKEN_SECRET` (39), returns `{ ok:true, handoffToken }` with `Cache-Control: no-store`. `runtime nodejs`, `dynamic force-dynamic`. Docstring (17–21) flags an unfinished SECURITY follow-up: bind lead to browser session + rate-limit.
- `src/server/integrations/los/handoffToken.ts` (1–53). `HandoffPayload` (3–11). `mintHandoffToken` (45–53) signs an HS256 JWT, `setIssuedAt` (49), `.setExpirationTime('10m')` (51) — **the 10-minute TTL**. No verify/decode helper here (verification is downstream at `/continue`).
- `src/components/apply/Wizard.tsx` (123–128, 156–162, 230–232). Renders `FinishStep` for step type `finish` or `account` (230–232) and passes `officer={chosenOfficer}`. `chosenOfficer` (127–128) = `officers.find(o => o.slug === officerSlug) ?? null` — a **full `ApplyOfficer`** object, already flowing; `FinishStep` merely narrows its *type*. Wizard already passes `intent`, `contact`, `leadId`, `shortName`, `calendarHref`. Heading is suppressed for finish/account steps (156–162); the comment at 156–157 says the step "auto-redirects … so we suppress the big step heading" — **this comment goes stale after Part 2** (see Files touched).
- `src/app/apply/[intent]/page.tsx` (48–55, 60–67). The only `ApplyOfficer[]` constructor; drops `email`/`phone` today. Already threads `phoneHref`, `phoneDisplay`, `consentTcpa = buildConsentTcpa(config)`, `shortName`, `calendarHref` (60–67) to Wizard via derived strings.
- `src/content/officers.ts` (11–32 type, 50–54 `telDigits`, 56–327 data). `Officer` already carries `email` (21) and `phone` (22–23); all 16 have real values. `telDigits(phone)` (51–54) → `+1XXXXXXXXXX`. House line is Robert Hoff's `(720) 838-1246` (63).
- `src/server/officers/map.ts`. `rowToOfficer` already projects DB `email`/`phone` (→ `''` when null). So widening `ApplyOfficer` + two lines in `page.tsx` is the whole job — no schema/projection work.
- `src/components/apply/steps/ContactStep.tsx` (36, 88–98). The phone field uses an **sr-only `<label>`** (36) and renders the `consentTcpa` prop string under the phone field (97). Part 2's inline phone recapture reuses both the sr-only-label pattern and the exact `consentTcpa` string.
- `src/server/leads/leadService.ts` (2–10, 44–90, 127–132, 167–171). `captureLead`/`dispatchToGhl` = the best-effort GHL pattern to mirror: Postgres is system-of-record; GHL failures are swallowed (try/catch ~81), never block the user; tenant-safe write via `patchLead` = `updateMany({where:{id}})` then `findFirst` re-read (53–57) because the scoped client BANS `.update()`. **Note `updateMany` REPLACES the whole `answers` JSON column — it is not a deep merge** (see Data model). `captureLead` builds `mergedAnswers` by spreading existing answers and nesting `fields` (127–132). `getLeadById` (167–171) is a tenant-scoped `findFirst`. There is **no** exported generic lead-update helper yet.
- `docs/superpowers/plans/2026-06-18-finish-screen-branded-auth.md` (Task 12, Task 13). Pending + **stale**: Task 12 = widen `ApplyOfficer` + map email/phone in `page.tsx`; Task 13 = a full FinishStep replace integrating `AccountPanel`/`OfficerContactCard` (neither exists on disk) and predates/conflicts with `90188bb`.

### Continue path change (auto-redirect on mount → click)

- **Keep effect #1 as the pre-warm.** Reuse `FinishStep.tsx:38–57` verbatim — mint on mount behind the `fired` guard. **Delete effect #2** (60–64). Move navigation into the Continue button's `onClick`.
- **Record mint time.** Record `mintedAt` **in a ref, inside the same `.then()` callback where the token is received**, alongside `setToken(token)` — e.g. `mintedAtRef.current = Date.now(); setToken(token);` (request-time client code, allowed by the SSG rule). Do **not** derive `mintedAt` from a `useEffect` on `token` (that adds a render of skew). The token TTL is exactly 10 minutes (`handoffToken.ts:51`).
- **TTL handling on click.** On Continue click:
  1. If a warmed token exists **and** `Date.now() - mintedAtRef.current < ~8min` (safety margin below the 10-min TTL): navigate immediately to `${APP_URL}/continue?t=${encodeURIComponent(token)}`. Emit `continue_click` with `{ warmed: true, remintRequired: false }`.
  2. Else (stale or never warmed): set a **pending/disabled visual state** on the Continue button (disable it + show a "Setting up…" label in an `aria-live="polite"` region) while re-`POST /api/v1/applications` `{ leadId }` (cheap, idempotent read+sign — the server rebuilds from the persisted lead), then navigate with the fresh token. Emit `continue_click` with `{ warmed: <bool>, remintRequired: true }`. Guard with a separate in-flight ref so a double-click does not fire parallel mints; keep the existing `fired` ref for the warm only. The pending state clears on navigation (success) or on falling to the fallback (failure).
- **Token-staleness extraction (testable).** Extract the "is the warmed token stale?" decision as a **pure function** `isHandoffTokenStale(mintedAt: number | null, now: number, ttlMs?: number): boolean` (default safety window ~8 min) so it is node-testable without a DOM (see Testing strategy).
- **Failure fallback** remains and is reworked to never strand the borrower: if both the warm and the click-time re-mint fail, **stay on the screen** (do not navigate) and render the manual fallback markup (reuse the existing 67–95 markup as the visual basis: green button + "or" divider). Emit `continue_fallback_shown`. **Fallback target:** the fallback link must point at a route the downstream app serves **without** a token (the app's logged-out/continue entry — confirm exact path in Open questions), NOT a token-required `/continue` that would reject a tokenless visitor. If the only safe tokenless target is the app sign-in/home, link there. The off-ramp (Call/Text/Email) also remains available on the fallback so the borrower can always reach a human.
- **Heading.** Wizard suppresses the step heading for finish/account (156–162). Re-introducing a rendered screen means giving the screen its own in-component title (e.g. "You're all set — finish your application") rather than re-enabling the Wizard heading. Keep heading suppression in Wizard unchanged (only the stale comment at `Wizard.tsx:156–157` is updated — see Files touched).

### The reveal-on-demand off-ramp (states)

Four states on the rendered finish screen:

1. **Collapsed (default).** PRIMARY: the green 3D "Continue your application" button (Continue path above). Below it, a quiet disclosure trigger: `Prefer to talk to {officerFirst} first?` (or `Prefer to talk to a loan officer first?` when no officer). The trigger is a `<button>` with `aria-expanded={false}` controlling the panel via `aria-controls`.
2. **Revealed.** Clicking the trigger sets `aria-expanded={true}`, emits `offramp_open`, and expands a panel personalized with the chosen officer (photo + name + NMLS) plus the three channel buttons (Call / Text / Email) and the SLA callback promise (e.g. "She'll reach out within ~15 minutes."). Continue stays visible and weighted above. **Focus management:** on reveal, move focus to the panel's heading (or its first interactive element); on collapse, restore focus to the trigger.
3. **Phone-recapture sub-form (only when `borrower.phone` is empty AND the chosen channel ∈ {call, text}).** See "Phone-skipped strict ordering" below. Email never enters this state.
4. **Confirmation.** After a successfully-fired contact request (or, for email, after the `mailto:` opens), the panel swaps to an `aria-live="polite"` confirmation (e.g. "Sarah will text you shortly — keep an eye on your phone."). Continue **stays available** throughout; requesting contact never blocks or replaces self-serve.

The panel is a single in-component disclosure (local `useState` for open + chosen channel + recapture-phone + recapture-consent + confirmation). No router navigation. No calendar/scheduler (v2 option only). The `aria-live="polite"` confirmation/status region is a **stable node** (rendered once, content swapped) — do not unmount/remount it, so SR users reliably hear the swap.

**a11y (off-ramp panel):**
- Disclosure trigger: `aria-expanded` + `aria-controls` pointing at the panel id.
- Focus moves into the panel on reveal (panel heading or first control) and returns to the trigger on collapse.
- Each channel button has an explicit `aria-label` naming the target: e.g. `aria-label="Call Sarah"` / `aria-label="Text Sarah"` / `aria-label="Email Sarah"`; in the no-officer branch, `aria-label="Call a loan officer"` etc. (the house line target).
- The inline phone-recapture input has a real **sr-only `<label>`** (mirroring `ContactStep.tsx:36`) and is programmatically associated with the consent line via `aria-describedby` pointing at the element rendering the `consentTcpa` string.
- The status/confirmation `aria-live="polite"` region is stable (not remounted).

### Channel behaviors

All three emit `channel_select` with `{ channel: "call"|"text"|"email" }` on pick. For the **happy path where `borrower.phone` is already present** (or for Email always), the channel also fires the server-side contact-request (best-effort, fire-and-forget) and opens the appropriate deep link. The **phone-skipped path defers both** the request and (for Text) the deep link until a consented number is captured — see strict ordering below.

- **Call** → the officer's number as a `tel:` link built with `telDigits(officer.phone)` (`href={`tel:${telDigits(phone)}`}`). No-officer → tenant house line (`config.contact.phoneHref`). The `tel:` link for the officer/house line may open immediately on tap (it dials a known, public business number — no borrower PII or consent needed to dial out). The **LO-callback request/tag** (which asks the LO to call the *borrower*) must wait for a known, consented borrower number when the borrower's phone was skipped.
- **Text** → mobile `sms:` deep link prefilled, `href={`sms:${telDigits(phone)}`}` (optional `?&body=` prefill of a short intro). No-officer → house line. When the borrower's phone was skipped, the `sms:` link and the request both wait for the recaptured, consented number.
- **Email** → `mailto:` prefilled, `href={`mailto:${officer.email}?subject=…`}` (or an inline note if no email). Email always works without a phone and is **exempt from the TCPA recapture/consent gate** (no telephonic consent needed); it fires the contact-request immediately and opens `mailto:`.

Guard each deep link: only render/enable Call/Text when `officer?.phone` (or the house line) is non-empty — the DB fallback maps missing phone to `""`, which `telDigits` would turn into a bare `+` (`map.ts:25`).

### Phone-skipped strict ordering + TCPA consent gate

When `borrower.phone` is empty and the borrower taps **Call** or **Text**, the flow is strictly:

1. **Reveal the recapture sub-form. Do NOT fire `requestContact` and do NOT open the `sms:` deep link yet.** (For **Call**, the `tel:` link to the officer/house line may still open so the borrower can dial out immediately — but no LO-callback request/tag is sent.) Emit `offramp_phone_prompt`.
2. The sub-form shows: an sr-only-labeled phone input (`ContactStep.tsx:36` pattern), the **exact** `consentTcpa` string from `buildConsentTcpa(config)` (the same prop threaded into `ContactStep`, `ContactStep.tsx:97` — never paraphrased), `aria-describedby`-associated with the input, and an affirmative consent action. The affirmative action is explicit: **a required consent checkbox** co-located with the consent string (the confirm button is disabled until the number is valid AND the box is checked). (Copy on the confirm button additionally states the consent, e.g. "By tapping Confirm, you agree …", but the checkbox is the recorded affirmative action.)
3. On submit of a **valid number with consent checked**: emit `offramp_phone_submit`; record `contactPreference.phone` + consent (below); fire `requestContact(leadId, channel, { phone, consentTcpa: true })`; for **Text**, now open the `sms:` deep link to the recaptured number; show the confirmation.
4. If the borrower abandons the sub-form (never submits a valid+consented number), **no request is fired, no LO tag is pushed, no LO-callback is requested** — the borrower was only ever told to call out (Call) or nothing (Text).

This guarantees the LO is never told to call/text a number that is unknown or lacks recorded consent.

### Server-side: contact-request endpoint

**Route:** `POST /api/v1/leads/{id}/contact-request` (new). Scaffold copied from `src/app/api/v1/leads/route.ts` and `applications/route.ts`: `runtime='nodejs'`, `dynamic='force-dynamic'`; `req.json()` try/catch → 400; Zod `safeParse` → 400 with `error.flatten()`; catch-all → `console.error` + 500 that leaks nothing.

**Payload schema** (new `contactRequestSchema` in `src/validation/lead.ts`, alongside `leadInputSchema`):
```ts
z.object({
  channel: z.enum(["call", "text", "email"]),
  phone: z.string().trim().refine(v => v === "" || v.length >= 7).optional(), // recapture
  consentTcpa: z.boolean().optional(),
  idempotencyKey: idempotencyKeySchema.optional(),
})
```

**TCPA hard gate (server-side enforcement).** Before any recording/outreach: if `channel ∈ {call, text}` **and** a non-empty `phone` is present in the body (i.e. a recaptured number), require `consentTcpa === true`. If consent is absent/false, **return 422** (do not record `contactPreference.phone`, do not push any GHL tag). Email is exempt. A call/text request with **no** recaptured phone (borrower already had a phone on file) is allowed without `consentTcpa` in the body, because consent for the on-file number was already captured at lead-create (`consentAt`); such a request never introduces a new number.

**Flow:**
1. Resolve tenant + lead via `getTenantDb()`/`getLeadById(id)` (tenant-scoped). Cross-tenant/missing → 404 (mirror `applications/route.ts:33`).
2. Resolve the officer server-side from `lead.answers.fields.loanOfficer` (the slug) using the **same `resolveOfficerName`-style `{ name, slug }` resolution against OFFICERS** that `applications/route.ts` uses — do **not** trust client-sent officer identity. This server resolution yields only `{ name, slug }`, which is **sufficient** because the only server-side use is the `officer:${slug}` / officer-name GHL tag. The off-ramp's officer **email/phone are consumed client-side** (via the widened `ApplyOfficer` → `FinishStep`), never resolved here. (If a future version must notify the LO directly server-side, resolve against the full OFFICERS entry / `listOfficers()` rather than `resolveOfficerName`.)
3. **Read-modify-write the preference (explicit).** Load the lead's current `answers` (already have it from `getLeadById`). **Reconstruct the FULL `answers` object** — `{ ...answers, fields: { ...answers.fields, contactPreference: nextPref } }` — preserving every existing `answers.fields` key (`loanOfficer`, address, etc.) so the downstream `/continue` handoff (which reads `answers.fields.*`) is not clobbered. Then write the **entire reconstructed `answers` blob** via the tenant-scoped `updateMany({where:{id}}, data:{answers})` + `findFirst` re-read pattern (the scoped client bans `.update()`; `updateMany` REPLACES the column, so a partial `{answers:{contactPreference}}` would destroy `loanOfficer`/address — never pass a partial). The read-modify-write race is acceptable for v1 (single funnel session, low contention) — add a brief code comment noting the TOCTOU window.
4. **`contactPreference` shape (channel history).** To keep Postgres (system-of-record) consistent with the **accumulating** GHL tags, `contactPreference` records a history, not a single overwrite:
   ```ts
   contactPreference = {
     channels: string[],        // de-duped set of channels ever requested, e.g. ["text","call"]
     latest: "call",            // most recent channel
     requestedAt: <ISO>,        // most recent request time
     ...(phone ? { phone, consentTcpa: true, consentRequestedAt: <ISO> } : {}),
   }
   ```
   **Idempotency:** read the current `contactPreference`. If `channels` already includes the requested `channel`, short-circuit the GHL push (no duplicate tag) — mirror `captureLead`'s SYNCED/SKIPPED no-op (`leadService.ts:160–162`) — but still refresh `latest`/`requestedAt` (and `phone`/consent if newly provided). If the channel is new, append it to `channels`, set `latest`, and proceed to outreach. This makes a same-channel double-click a no-op while a genuine channel switch (Text then Call) records **both** channels in `channels` (matching the two GHL tags that accumulate), so the system-of-record never disagrees with CRM.
5. **Best-effort outreach.** Wrap the GHL call in the same try/catch-swallow structure as `dispatchToGhl` (59–88): never throw, record failure but return ok to the client. **v1 = tag-only:** re-upsert the GHL contact with an added `Requested: ${channel}` tag (and optionally `officer:${slug}`), extending `leadToContactInput`'s tag list (`mappers.ts:13–26`) rather than building tags inline. `ghlClient.upsertContact` supports `tags`/`customFields` and short-circuits when `!ghlConfigured()` (`ghlClient.ts:156–167`), so this needs **zero CrmClient interface change**. True officer-assignment / task-creation / SMS-send are not in the interface and are explicitly deferred (see Open questions).
6. Respond `{ ok: true }` quickly; the client never waits on GHL. (A 422 from the consent gate or a 404/400 returns `{ ok: false }`-shaped error per the route conventions.)

**Tenant scoping:** all reads/writes go through `getTenantDb()`/`getLeadById` so the route never reaches across tenants or pushes PII through the wrong CRM creds (the `retry-ghl` route documents this concern).

**No-PII logging:** log at most `leadId + channel + ok/fail`. Never log the contact's phone/email/name (matches the capture route + `ghlClient` conventions).

**Client helper:** a new fire-and-forget `requestContact(leadId, channel, opts?: { phone?: string; consentTcpa?: boolean })` modeled on `submitLead` (`src/lib/leads.ts:52–80`): POST, swallow/log errors, generate its own `idempotencyKey` via `crypto.randomUUID()`, return `{ ok }`, never block Continue. On resolve, the caller emits `contact_request_ok` (on `{ok:true}`) or `contact_request_fail` (on `{ok:false}` or thrown/swallowed error).

### Data model

- Store the preference at **`lead.answers.fields.contactPreference`** (JSON): `{ channels[], latest, requestedAt, phone?, consentTcpa?, consentRequestedAt? }`. `Lead.answers` is a `Json` column (`prisma/schema.prisma:177`) and `captureLead` already nests `fields` under `answers.fields` (`leadService.ts:127–132`); the apply funnel already reads `answers.fields.loanOfficer`. **No Prisma migration** — DATABASE_URL is a live prod RDS (project memory); do not add a column for v1.
- The write is a **read-modify-write of the full `answers` blob** (see route flow step 3) because the tenant-scoped `updateMany` REPLACES the JSON column; the helper must preserve all existing `answers.fields` keys.
- **v2 note:** promoting `contactPreference` to a first-class `Lead` column (with an `assignedOfficer` column) is a future option once a migration window on the prod RDS is acceptable.

### Officer type widening (reuse branded-auth Task 13)

The off-ramp needs `email` + `phone` (Call/Text/Email) and `nmls` + `photo` (personalized panel). Today `ApplyOfficer` (`OfficerStep.tsx:10–17`) has 6 fields (no email/phone) and `FinishStep.officer` is narrowed further to `{slug,name}`. The source data already carries email/phone in both the bundled OFFICERS and the DB projection.

**Reuse vs. new — be explicit:**
- **Reuse** the *type-widening half* of the stale branded-auth plan (its Task 12 + the prop-type portion of Task 13): widen `ApplyOfficer` to add `email: string; phone: string`; add `email: o.email, phone: o.phone` to the `page.tsx:48–55` map; widen `FinishStep.officer` to `{ slug; name; nmls; photo; email; phone } | null`. Wizard already passes the full object (`Wizard.tsx:231`) so **no Wizard call-site change** is needed. Keep `ApplyOfficer` scalars-only — do **not** add `bio[]`/`applyHref` (preserves the "smaller client bundle" intent, `OfficerStep.tsx:8–9`).
- **New / do NOT reuse:** the branded-auth plan's Task 13 *FinishStep body* (the `AccountPanel`/`OfficerContactCard`/`useAuth` flow). It is stale, references non-existent components, and predates the `90188bb` auto-redirect. Part 2's FinishStep body (render-on-click + off-ramp) **supersedes** it. A literal file-replace from that plan would regress `90188bb`.
- **Coordination:** land the type-only widening as the shared change; whichever of the two plans touches it first owns it — do not re-add email/phone twice.

### Edge cases

- **No officer chosen ("No preference", `officer === null`).** Off-ramp shows generic "Talk to a loan officer" using the **tenant house line** (`config.contact.phoneDisplay`/`phoneHref`, currently `(720) 838-1246` / `tel:+17208381246`, threaded via `page.tsx:60–61`). Channel buttons read `aria-label="Call a loan officer"` etc. Confirmation reads "A loan officer will reach out." Never hardcode the number (multi-tenant invariant).
- **Phone skipped on the phone step.** Handled by the strict ordering + TCPA gate above: **Call/Text** reveal the recapture sub-form (sr-only label + `consentTcpa` line + required consent checkbox) and only fire the request / LO-callback after a valid, consented number is submitted; the recaptured number + consent are stored in `answers.fields.contactPreference`. **Email** works without a phone and is gate-exempt. Reuse the exact `consentTcpa` string from `ContactStep` (`ContactStep.tsx:97`) — do not paraphrase. (Whether to *also* patch `Lead.phone` / refresh the lead's `consentAt` for the new number is an Open question; v1 stores it in `contactPreference` with its own `consentRequestedAt`.)

### Multi-tenant config

Channel set, the "~15 min" SLA copy, the house line, **and the render-vs-auto-redirect flag** must come from tenant/site config (default MSFG), never hardcoded.

- **House line:** reuse the existing `config.contact.phoneDisplay`/`phoneHref` (already in `DEFAULT_TENANT_CONFIG`, `site.ts:218–224`; already threaded to Wizard as `phoneDisplay`/`phoneHref`). Thread these to `FinishStep` for the no-officer branch.
- **Channels + SLA copy + flag:** add a small additive sub-schema to `TenantConfigSchema` + `DEFAULT_TENANT_CONFIG` in `src/content/site.ts` (e.g. an `applyOffRamp` block: `{ channels: ("call"|"text"|"email")[]; slaCopy: string; finishScreen: "rendered" | "autoRedirect" }`, MSFG defaults `channels: ["call","text","email"]`, `slaCopy: "within ~15 minutes"`, `finishScreen: "rendered"`). Derive strings server-side in `page.tsx` (the page passes only derived strings to the client Wizard) and thread through Wizard → FinishStep.
- **Defaults resolve without a re-publish.** Both the `finishScreen` flag default (`"rendered"`) and the `applyOffRamp` channel/SLA defaults must resolve correctly from `DEFAULT_TENANT_CONFIG` via `getTenantConfig`'s fallback (`config.ts:64–79`) **even when the published CMS revision predates these fields** — i.e. a missing `applyOffRamp` block falls back to the MSFG defaults, so prod renders the screen with populated channels/SLA/house-line without requiring a CMS edit. (Use `.default(...)`/optional-with-fallback in the Zod schema so an older published revision parses cleanly.)
- **CMS note + sequenced re-publish.** Live config is the **published CMS revision**, not the `site.ts` module (`getTenantConfig`, `config.ts:64–79`). Because the defaults resolve via fallback, Part 2 will work on prod without a re-publish; however, to make the new fields **explicit and overridable per tenant**, a CMS re-publish for MSFG is sequenced as an explicit rollout step (see Rollout) and any non-default tenant override requires its own re-publish (coordinate per the content-publishing-model memory). **Verification:** on staging, confirm the published revision yields the rendered screen + populated off-ramp (channels/SLA/house line) before flipping prod.

### Analytics events

No custom analytics exist today (only Vercel `<Analytics/>`, `layout.tsx:3,68`). Add a tiny typed wrapper around `track()` from `@vercel/analytics` (pkg `^2.0.1`, present) and emit, client-side only (all snake_case via the wrapper):

- `finish_view` — on mount of the rendered finish screen.
- `continue_click` with props `{ warmed: boolean; remintRequired: boolean }` — on Continue click (before navigate). Lets token-staleness / re-mint rate be measured.
- `continue_fallback_shown` — when the warm mint failed and/or the click-time re-mint failed and the manual fallback is shown. Makes a post-`90188bb` token-failure spike visible.
- `offramp_open` — when the disclosure expands.
- `offramp_phone_prompt` — when the phone-recapture sub-form is shown (phone-skipped Call/Text).
- `offramp_phone_submit` — when a valid, consented recaptured number is submitted.
- `channel_select` with prop `{ channel: "call"|"text"|"email" }` — on channel pick.
- `contact_request_ok` — when `requestContact` resolves `{ ok: true }`.
- `contact_request_fail` — when `requestContact` resolves `{ ok: false }` or throws/swallows an error. Surfaces server/CRM failure rate.

These close the measurement loop the rollout depends on: `finish_view → continue_click` separates "user chose off-ramp" from "continue broke" (via `continue_fallback_shown`); the `offramp_open → offramp_phone_prompt → offramp_phone_submit → channel_select → contact_request_ok/fail` funnel exposes TCPA-gated drop-off and CRM failures.

### Files touched

- `src/components/apply/steps/FinishStep.tsx` — remove auto-navigate effect; keep mint-as-pre-warm + record `mintedAt` in a ref inside the mint `.then()`; Continue onClick with TTL re-mint guard + pending/disabled state; extract `isHandoffTokenStale` pure helper; render the screen with its own title; add reveal-on-demand off-ramp (disclosure + focus management + 3 channels + confirmation); phone-recapture sub-form with sr-only label, `consentTcpa` line via `aria-describedby`, required consent checkbox, strict ordering; widen `officer` prop; consume `phoneDisplay`/`phoneHref`, `consentTcpa`, off-ramp channels/SLA props; reworked tokenless fallback target; analytics emits (incl. fallback/fail/phone-prompt events).
- `src/components/apply/steps/OfficerStep.tsx` — widen `ApplyOfficer` with `email`/`phone` (shared with Part 1 file but a distinct, type-only change).
- `src/app/apply/[intent]/page.tsx` — add `email: o.email, phone: o.phone` to the officer map; derive + pass off-ramp channels/SLA strings + the `finishScreen` flag.
- `src/components/apply/Wizard.tsx` — pass `consentTcpa`, `phoneDisplay`/`phoneHref`, off-ramp config props, and the `finishScreen` flag through to `FinishStep` (officer object already passed); **update the stale comment at `Wizard.tsx:156–157`** (it claims the finish step auto-redirects) to state the finish step now renders and owns its own title while heading suppression stays.
- `src/content/site.ts` — add the `applyOffRamp` sub-schema (`channels`, `slaCopy`, `finishScreen`) with `.default(...)`/fallback so older published revisions parse + `DEFAULT_TENANT_CONFIG` values + a derive helper.
- `src/validation/lead.ts` — add `contactRequestSchema`.
- `src/app/api/v1/leads/[id]/contact-request/route.ts` — new route (incl. 422 TCPA gate).
- `src/server/leads/leadService.ts` — add a tenant-scoped read-modify-write helper that loads the lead, reconstructs the full `answers` object preserving existing `answers.fields` keys, merges `contactPreference` (channel-history shape), and writes the whole blob via `updateMany` + `findFirst` (follow `patchLead`); reuse for the route.
- `src/server/integrations/ghl/mappers.ts` — extend the tag list to add `Requested: ${channel}` (and optional `officer:${slug}`).
- `src/lib/leads.ts` (or a sibling) — add the fire-and-forget `requestContact` client helper.
- `src/lib/analytics.ts` (new) — thin typed `track()` wrapper for the events above.

---

## Data flow

**Continue path (Part 2):**
```
mount → effect#1 POST /api/v1/applications {leadId}
      → route: getLeadById → resolve officer slug → buildHandoffPayload → mintHandoffToken (10m)
      → .then: mintedAtRef.current = Date.now(); setToken(token)   [PRE-WARM, no navigation]

Continue click → stale = isHandoffTokenStale(mintedAtRef.current, Date.now())  (~8m window)
   fresh → emit continue_click{warmed:true, remintRequired:false}
         → window.location = APP_URL/continue?t=<token>
   stale/never-warmed → disable button + "Setting up…" (aria-live)
         → emit continue_click{warmed:<bool>, remintRequired:true}
         → re-POST /api/v1/applications {leadId} (in-flight guarded)
              success → navigate with new token
              fail    → stay on screen, render manual fallback (tokenless app entry, NOT token-required /continue)
                      → emit continue_fallback_shown
```

**Contact-request path (Part 2):**
```
channel pick (call|text|email) → emit channel_select{channel}

  EMAIL (gate-exempt):
    → fire requestContact(leadId,"email") + open mailto:
  CALL/TEXT with borrower.phone present:
    → fire requestContact(leadId,channel) ; CALL opens tel: / TEXT opens sms:
  CALL/TEXT with borrower.phone EMPTY (strict order):
    → reveal recapture sub-form (emit offramp_phone_prompt); do NOT fire request / sms: yet
       (CALL: tel: to officer/house line may open immediately; no LO-callback yet)
    → borrower submits valid number + checks consent
       → emit offramp_phone_submit
       → fire requestContact(leadId,channel,{phone,consentTcpa:true}) ; TEXT opens sms:

  → POST /api/v1/leads/{id}/contact-request {channel, phone?, consentTcpa?, idempotencyKey}
  → route (getTenantDb): getLeadById → 404 if missing/cross-tenant
        → TCPA gate: channel∈{call,text} AND phone present AND !consentTcpa → 422 (no record, no tag)
        → resolve officer {name,slug} from answers.fields.loanOfficer (server: slug only, for tag)
        → read answers.fields.contactPreference {channels[],latest,...}
             channel already in channels? → skip GHL tag (idempotent), refresh latest/requestedAt/phone
             else → append channel; read-modify-write FULL answers (preserve loanOfficer/address)
                  → try { ghl.upsertContact(tags += "Requested: <channel>") } catch { swallow+record }
        → respond {ok:true}   [client already moved on; Continue stays available]
  → client: emit contact_request_ok ({ok:true}) | contact_request_fail (else); show confirmation (aria-live)
```

## Error handling

- **Token mint (warm) fails:** swallow → render manual fallback (reworked tokenless target); emit `continue_fallback_shown`; no spinner-strand.
- **Token re-mint (click) fails:** keep the user on the screen, clear the pending state, fall to the manual fallback; never navigate to a token-required `/continue` without a token. Emit `continue_fallback_shown`.
- **Click-time re-mint in flight:** Continue button is disabled with a "Setting up…" `aria-live` label; the in-flight ref prevents parallel mints; navigation only on success.
- **Stale token clicked:** re-mint before navigating (TTL guard via `isHandoffTokenStale`) — do not trust the warmed token blindly past ~8 min.
- **Double-click Continue:** in-flight ref prevents parallel mints; navigation is idempotent (same URL).
- **Manual fallback target:** links to a route the app serves without a token (logged-out/continue entry or sign-in/home), NOT a token-required `/continue` that would reject a tokenless visitor — so the borrower is never dead-ended. The off-ramp stays available on the fallback.
- **contact-request 400 (bad body):** client logs + swallows; Continue unaffected; emit `contact_request_fail`; no confirmation shown.
- **contact-request 422 (call/text recapture without consent):** server records nothing and pushes no tag; client logs + swallows; emit `contact_request_fail`; no confirmation shown (the UI gate should prevent reaching this, but the server enforces it defensively).
- **contact-request 404 (cross-tenant/missing lead):** route returns 404; client swallows; emit `contact_request_fail`; any already-opened `tel:`/`mailto:`/`sms:` (per the ordering rules) still lets the borrower reach the officer.
- **GHL down / unconfigured:** `dispatchToGhl`-style swallow; route still returns `{ok:true}` because the Postgres write is authoritative; `ghlConfigured()` short-circuits cleanly.
- **Double-click a channel:** idempotent on `lead + channel` via the `channels[]` set (no duplicate tag); `latest`/`requestedAt` refresh.
- **Channel switch (Text then Call):** both channels recorded in `contactPreference.channels` (matching the two accumulating GHL tags); `latest` reflects the most recent — system-of-record stays consistent with CRM.
- **Empty officer phone:** Call/Text guarded; fall back to house line or hide the channel; Email still offered.
- **Route catch-all:** `console.error` + 500 with no internal leak (mirror `leads/route.ts:46–51`).

## Testing strategy

**Existing infra:** `vitest.config.ts` → `environment:"node"`, `include:["src/**/*.test.ts"]` (`.ts` only; `.tsx` not collected). No RTL/jsdom/happy-dom installed (only `vitest ^4.1.8`).

- **Route tests (node, `.test.ts`) — fits today's infra directly** (mirror `applications/route.test.ts`):
  - `contact-request`: 400 on bad body; 404 on unknown/cross-tenant lead; **422 on a call/text request that carries a recaptured `phone` without `consentTcpa===true`** (and confirm nothing is written and no tag pushed); records `contactPreference` (channel-history shape) in `answers.fields` **without clobbering `loanOfficer`/address** (assert other `answers.fields` keys survive the write); idempotent on same channel (second same-channel call does not duplicate the GHL tag); channel switch records both channels in `channels[]`; GHL failure swallowed → still `{ok:true}`; no PII in logs; tenant scoping (cross-tenant leadId → 404).
- **Pure-helper unit tests (node, `.test.ts`):**
  - `telDigits` deep-link derivation guards (empty phone → no bare `+`).
  - The off-ramp config derive helper (`applyOffRamp` defaults + override; an absent block falls back to MSFG defaults incl. `finishScreen: "rendered"`).
  - `isHandoffTokenStale(mintedAt, now, ttlMs?)` — null/fresh/stale boundary cases (extracted as a pure function so it is node-testable without a DOM).
  - Contact-request validation schema (`contactRequestSchema`) accept/reject cases, including the consent-gate combinations.
  - Part 1 name-filter: extract the name-filter into a pure function and test accept/reject + empty-query in-state fallthrough in node.
- **Component tests (OfficerStep search/grid, FinishStep off-ramp + consent gate + focus management) — require NEW infra:** RTL + jsdom + user-event + jest-dom, broadening the vitest glob to `.test.tsx` with a per-file `// @vitest-environment jsdom` docblock (node tests stay on node). This is exactly Task 9 of the branded-auth plan. **Decision needed (Open question):** pull in Task 9 for v1 component coverage, or scope component tests out of v1 and cover logic via the node tests above. Recommended: cover Part 1 filter logic + the TTL/consent/config predicates via the extracted pure functions in node; defer DOM-level component tests unless Task 9 lands. (Note: the consent gate has both a UI guard and a server guard, so the server-side 422 test covers the compliance-critical path even without component tests.)

## Rollout & sequencing

1. **Part 1 first** (frontend-only, low risk): ship the search + grid. No flag strictly required, but gate behind a simple build-time/config boolean if a quick rollback is desired. Verify visually inside `max-w-[560px]` at desktop (4-col) and ≤980px (2-col); confirm tap-to-select auto-advance, single-match-is-tappable, the zero-in-state-officers fallthrough (full roster, no note), and a11y (focus retention while typing, empty state announced, no Enter-submit).
2. **Type-only widening** as a small shared commit (ApplyOfficer email/phone + page map + FinishStep prop type) — unblocks Part 2 and the branded-auth plan without duplicating.
3. **Part 2** after Part 1 is stable: land the tenant `applyOffRamp` config (channels/SLA/`finishScreen`, with fallback defaults so prod works pre-publish), the contact-request route (incl. 422 TCPA gate + read-modify-write helper), the client helper, then the FinishStep rewrite.
   - **Config defaults pre-publish:** confirm `DEFAULT_TENANT_CONFIG` fallback yields `finishScreen: "rendered"` + populated channels/SLA/house line even though the live published CMS revision predates the new fields (older revision parses via `.default(...)`).
   - **Sequenced CMS re-publish (MSFG, tenant #1):** as an explicit step before/with the Part 2 prod ship, re-publish the MSFG config so the published revision **explicitly** carries the channels/SLA/house line and the `finishScreen` flag (makes them overridable; coordinate per the content-publishing-model memory). On **staging**, verify the published revision yields the rendered screen + populated off-ramp before flipping prod.
   - **Flagging:** the FinishStep render-vs-auto-redirect behavior reads the `applyOffRamp.finishScreen` flag (default: `"rendered"`, resolved from `DEFAULT_TENANT_CONFIG`). This makes the `90188bb` reversal reversible: if Continue-through regresses, set `finishScreen: "autoRedirect"` (keeping Part 1) without a code revert.
4. **Measuring off-ramp impact:** compare `continue_click` rate (and `remintRequired`/`warmed` props) and time-to-continue against the `90188bb` auto-redirect baseline; watch `continue_fallback_shown` for token-failure spikes; track the `offramp_open → offramp_phone_prompt → offramp_phone_submit → channel_select → contact_request_ok/fail` funnel; watch self-serve completion downstream at `/continue`. If self-serve completion drops while off-ramp engagement is low, revert via the flag.

## Open questions

- **Re-mint staleness cutoff:** ~8 min (2-min safety margin under the 10-min TTL) is proposed — confirm the desired margin (it is the default in `isHandoffTokenStale`).
- **`/continue` contract + tokenless fallback target:** confirmed assumption is that `/continue` still accepts only `?t=<token>` (the same URL the current effect builds) and needs no app-side change. **Confirm the exact tokenless route the manual fallback should link to** (the app's logged-out/continue entry vs. sign-in/home) so a tokenless visitor is never rejected/dead-ended.
- **CRM action depth (v1):** is a `Requested: ${channel}` tag on the existing contact sufficient, or must "assign officer + create task + notify LO" be **real** CRM actions? The latter requires extending the `CrmClient` interface + `ghlClient` (no `assignedTo`/task/SMS today) and a full-OFFICERS server resolution (for the LO's email/phone). v1 proposes tag-only; confirm.
- **Recaptured-phone source of truth + consent semantics:** write the recaptured number + consent only to `answers.fields.contactPreference` (`phone`/`consentTcpa`/`consentRequestedAt`, v1 proposal), or also patch `Lead.phone` and/or refresh the lead's `consentAt` so the new number is covered at the row level? The server gate already requires `consentTcpa===true` for a recaptured call/text number; confirm whether row-level consent refresh is also required for compliance records.
- **Off-ramp config shape/naming:** confirm an additive `applyOffRamp` block on `TenantConfigSchema` (`channels` + `slaCopy` + `finishScreen`, house line reusing `contact.phone*`, all with fallback defaults) so the seed/CMS-publish flow can carry it and older published revisions still parse.
- **Idempotency key strategy:** dedupe on `lead.id + channel` via `contactPreference.channels[]` (proposed) vs. reuse the lead's `idempotencyKey`. `lead+channel` keying makes a same-channel double-click a no-op while letting a borrower request a different channel (recorded in `channels[]`).
- **Component-test infra:** land branded-auth Task 9 (RTL+jsdom) for FinishStep/OfficerStep coverage (search/grid, focus management, consent-gate UI) in v1, or rely on node-only tests (route incl. 422 gate + extracted pure helpers)?

## Out of scope

- Calendar/scheduler booking in the off-ramp (v2 option only).
- Promoting `contactPreference` to a real `Lead` column / any Prisma migration on the live prod RDS (v2 option).
- The branded inline auth (`AccountPanel`/`OfficerContactCard`/`useAuth`) work itself — separate, stale plan; Part 2 reuses only its officer-type widening, not its FinishStep body.
- True CRM officer-assignment / task-creation / SMS-send (unless reclassified per the Open question) — v1 is tag-only.
- Any change to the downstream `/continue` hand-off contract.
- Part 1: any API, data-model, or `ApplyOfficer` field change beyond the (Part 2) email/phone widening.
