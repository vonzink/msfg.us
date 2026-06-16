# Apply Funnel → Full Loan Application Hand-off — Design

- **Date:** 2026-06-16
- **Status:** Approved design (pre-plan)
- **Repos touched:** `msfg.us` (Next.js/TS) and `mortgage-app` (`/Users/zacharyzink/MSFG/WebProjects/mortgage-app`: React SPA + Spring Boot/Java, deployed at app.msfgco.com)

## Problem

At the apply-funnel finish step ("You're all set — what's next? … Continue in the MSFG app / Connect with {officer}"), the funnel-gathered data must carry into the **full loan application** at app.msfgco.com and **pre-populate** it. Some users already have accounts; some must create one.

## Decisions (locked)

1. **Hand-off model: server-to-server auto-create.** msfg.us creates a `REGISTERED` loan application in the app's backend (prefilled + assigned to the chosen loan officer); the user lands on their started application. PII never travels in the URL.
2. **New-user account: Cognito Hosted UI sign-up.** Both apps share the Cognito pool `us-west-1_S6iE2uego`. Signed-out users hit "Sign in & continue" → Cognito Hosted UI (sign-in *or* sign-up tab) → return authenticated. Existing users sign in via the same SSO.
3. **Create is rebuilt server-side from the persisted lead (`leadId`), not client state.** The Cognito redirect wipes the funnel's in-memory answers, so the source of truth for the create is the Postgres lead (which already stores every field, including `loanOfficer`).

## Goals / Non-goals

**Goals:** seamless transition into a started, LO-assigned application; prefill from the funnel; handle existing + new accounts; idempotent (no duplicate applications); never a dead end if the hand-off fails.

**Non-goals:** full 1003/URLA completion in the funnel; document upload; co-borrowers; building a borrower self-serve sign-up form inside the app (we reuse Cognito Hosted UI); changing the existing LO/Admin create path.

## Existing state (what we build on)

- **msfg.us** already has the scaffold: `FinishStep.tsx` → `POST /api/v1/applications` → `losClient.createLoanApplication(idToken, payload)` → `LOS_API_BASE + LOS_PATH` with `Authorization: Bearer <id_token>`. It is **env-gated off** (`LOS_API_BASE` unset) and its path (`/api/applications`) + flat payload **don't match** the app's real API. Auth session keeps the `id_token` in an **httpOnly cookie** read server-side (`getIdToken()`), never sent by the client.
- **mortgage-app** create endpoint is `POST /api/loan-applications` — **LO/Admin/Processor only**, expects a full `LoanApplicationDTO`. Borrowers cannot self-create today. Prefill today is the React form reading `carryOverData` from **sessionStorage** (per-origin → msfg.us cannot write it cross-domain). Backend auto-materializes a local `users` row on first valid JWT. LO assignment is `assignedLoId` (FK `users.id`) + `assignedLoName`; **no slug field** on users.

## Architecture & end-to-end flow

```
Funnel finish (lead already persisted → leadId; lead.fields has all answers + loanOfficer)
   │
   ├─ Already signed in ───────────────► FinishStep POSTs { leadId }
   │
   └─ Signed out ─► "Sign in & continue"
                     → /auth/login?returnTo=/apply/{intent}?lead=<leadId>
                     → Cognito Hosted UI [Sign in | Sign up]   (new users create here, verify email)
                     → back to /apply/{intent} (authed) ─► FinishStep POSTs { leadId }

POST /api/v1/applications { leadId }                      (msfg.us, server-side)
   │  read session id_token; fetch lead by leadId
   │  funnelToIntake(lead) → IntakeDTO (+ resolve chosen officer)
   ▼
POST {LOS_API_BASE}/api/loan-applications/intake          (Bearer id_token; idempotent on sourceLeadId)
   │  Java: create REGISTERED app owned by caller; map property/borrower/liability;
   │        resolve assignedLoId by officer email
   ▼  → { applicationId }
FinishStep "Continue in the MSFG app" ─► app.msfgco.com/applications/{applicationId}
```

If the user is unauthenticated and never signs in, nothing changes from today: the lead is captured, and the CTA still SSOs them into the app (now `LOS`-disabled path returns `handoff:"skipped"`).

## Intake DTO contract (the interface between the two repos)

`POST /api/loan-applications/intake` — `Authorization: Bearer <cognito id_token>`

```jsonc
{
  "sourceLeadId": "uuid",                 // idempotency key (dedupe)
  "source": "apply-wizard",
  "intent": "buy" | "refi" | "cash",
  "loanPurpose": "Purchase" | "Refinance" | "CashOut",
  "borrower": { "firstName": "", "lastName": "", "email": "", "phone": "" },
  "property": {
    "addressLine": "", "city": "", "state": "", "zipCode": "",
    "propertyType": "PrimaryResidence" | "SecondHome" | "Investment" | null,  // from propertyUse
    "constructionType": "SiteBuilt" | "Manufactured" | null,                  // from propertyType
    "propertyValue": 0
  },
  "financials": {
    "currentMortgageBalance": 0,          // refi/cash → a Liability "MortgageLoan"
    "annualIncome": 0,
    "creditBand": ""                      // stored as a note (no exact field)
  },
  "loanOfficer": { "email": "", "nmls": "", "name": "", "slug": "" }  // nullable
}
```
Response: `200 { "applicationId": "<id>" }` — **same id on retry** (idempotent on `sourceLeadId`).

The IntakeDTO is intentionally decoupled from the app's internal `LoanApplicationDTO`: msfg.us never touches the app's model; the Java endpoint owns the mapping IntakeDTO → `LoanApplication`/`Property`/`Borrower`/`Liability`.

## msfg.us changes (TypeScript)

- **`src/lib/applyIntake.ts` (new): `funnelToIntake(lead)`** — pure mapper from the persisted lead's named `fields` to the IntakeDTO. Unit-tested.
- **`src/app/api/v1/applications/route.ts`** — accept `{ leadId }`; fetch the lead server-side (`getLeadById`); build the IntakeDTO via `funnelToIntake`; call the intake client. Keep today's full-payload path as a fallback when `leadId` is absent (back-compat / belt-and-suspenders).
- **`src/server/integrations/los/losClient.ts`** — `LOS_PATH = "/api/loan-applications/intake"`; send the IntakeDTO; return `{ applicationId }`. (Keeps the best-effort, timeout, never-throw contract.)
- **`src/components/apply/steps/FinishStep.tsx`** — fire the hand-off with `{ leadId }`; carry `leadId` across the login redirect via `returnTo=/apply/{intent}?lead=<leadId>` **and** a localStorage fallback; when `applicationId` returns, point "Continue in the {shortName} app" at `app.msfgco.com/applications/{applicationId}`.
- **`src/validation/lead.ts`** — extend `applicationHandoffSchema` to accept `{ leadId }` (officer already flows via the lead).
- **Lead read helper** — `getLeadById(id)` in the lead service if not already present (tenant-scoped).

## mortgage-app changes (Java/Spring)

- **`POST /api/loan-applications/intake`** (new controller method) — authorize the **authenticated borrower** (any authenticated user) to create their *own* `REGISTERED` application; separate from the LO/Admin-only `POST /loan-applications`. Map IntakeDTO → `LoanApplication` + `Property` + primary `Borrower` (sequenceNumber 1) + optional `Liability` (MortgageLoan, from `currentMortgageBalance`). Set the borrower-owner linkage the app uses so the user sees it.
- **Idempotency** — add `sourceLeadId` (unique) to `loan_applications` (Flyway migration); on duplicate, return the existing application id instead of creating.
- **LO resolution** — resolve `assignedLoId`/`assignedLoName` by matching `loanOfficer.email` to `users.email` (officers are `*@msfg.us`, same as their app user row). No match → leave unassigned; never fail the create.

## Field mapping (funnel → IntakeDTO → app)

| Funnel field | IntakeDTO | App model |
|---|---|---|
| intent (buy/refi/cash) | loanPurpose | LoanApplication.loanPurpose |
| contact name | borrower.firstName/lastName | Borrower (seq 1) |
| contact email/phone | borrower.email/phone | Borrower |
| address (structured) | property.addressLine/city/state/zipCode | Property |
| propertyUse | property.propertyType | Property.propertyType |
| propertyType (Manufactured→) | property.constructionType | Property.constructionType |
| propertyType: SFR/Condo/Townhouse/Other | property.constructionType="SiteBuilt"; dwelling style → note | (no exact dwelling-style field in the app) |
| homeValue | property.propertyValue | Property.propertyValue (+ derive loanAmount) |
| mortgageBalance (refi/cash) | financials.currentMortgageBalance | Liability "MortgageLoan" |
| income (annual) | financials.annualIncome | Borrower income (→ monthly) |
| creditBand | financials.creditBand | stored as a note |
| loanOfficer (slug) | loanOfficer{email,nmls,name,slug} | assignedLoId via email lookup |

## Cross-cutting

- **Idempotency:** `leadId` end-to-end; the FinishStep effect (which can re-fire) and any retry collapse to one application.
- **Security:** PII server-to-server only (httpOnly `id_token`); only the opaque `applicationId` appears in the final redirect URL. The intake endpoint creates only a self-owned app for the JWT's user. No new public surface.
- **Graceful degradation:** lead capture is unchanged and authoritative; a failed hand-off still SSOs the user into the app — never a dead end.
- **Config/ops:** set `LOS_API_BASE` to the app's API host; document in `.env.example`. Server-to-server, so CORS is likely a non-issue.

## Testing

- **msfg.us:** unit-test `funnelToIntake()` across buy/refi/cash; route test for `leadId` → rebuilt IntakeDTO and the missing-lead fallback; FinishStep carries `leadId` across the redirect and deep-links on success.
- **Java:** intake endpoint test — creates a REGISTERED, borrower-owned app; idempotent on `sourceLeadId`; LO resolved by email; no-match LO leaves it unassigned without failing.

## Open items (confirm during implementation — not blockers)

1. The app's exact "continue an application" route for the deep link (`/applications/{id}` vs `/apply?appId={id}`).
2. The borrower-owner linkage on `LoanApplication` so a borrower-role user sees the created app (verify in the Java model; the dashboard user-materialization pattern is the reference).
3. Whether `loanAmount` should be derived (e.g., homeValue − down, or mortgageBalance) at intake or left for the borrower to complete in-app.

## Out of scope / future

Co-borrowers, document upload from the funnel, admin-create accounts (deferred — Hosted UI sign-up chosen), real-time LO calendar booking from the finish step.
