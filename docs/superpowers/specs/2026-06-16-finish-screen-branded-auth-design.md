# Finish-Screen Branded Auth + Officer Contact — Design

- **Date:** 2026-06-16
- **Status:** Approved design (pre-plan)
- **Repo:** `msfg.us` (Next.js / TS). Builds on the funnel→app hand-off (`2026-06-16-funnel-to-loan-application-handoff-design.md`).

## Problem

The apply-funnel finish screen breaks for a **new borrower**: the "Sign in & continue" button redirects to Cognito's generic Hosted UI sign-in page, which offers no way to create an account — so new borrowers are stuck. Separately, the "Connect with {officer}" button just links to the `/loan-officers` directory, which isn't useful. Both need a redesign so the finish screen lets a new borrower create an account on-brand and reach their chosen officer directly.

## Decisions (locked in brainstorming)

1. **Branded sign-up/sign-in on msfg.us** — custom forms on our own site, no Cognito Hosted UI.
2. **Inline on the finish screen** — the finish step shows the branded auth panel; email is pre-filled from the funnel contact; no page bounce. This also removes the leadId-across-redirect complexity (the hand-off fires the instant the session is set).
3. **Server-side Cognito proxy via `fetch`** — `SignUp`/`ConfirmSignUp`/`InitiateAuth`/`ResendConfirmationCode` are plain JSON API calls to `cognito-idp.{region}.amazonaws.com` (like the existing `exchangeCode`), so **no new SDK dependency**. Tokens are set in the existing httpOnly session cookie; they never reach the browser.
4. **Officer CTA → inline contact actions** — Call / Text / Email the chosen officer (their real phone/email), inline on the finish screen.

## Goals / Non-goals

**Goals:** a new borrower creates an account without leaving msfg.us or seeing the AWS-styled UI; an existing borrower signs in inline; the chosen officer is reachable directly from the finish screen.

**Non-goals (v1):** a full branded **forgot-password** flow (sign-in shows the link; wiring `ForgotPassword`/`ConfirmForgotPassword` is a fast-follow — same shape as signup+confirm); social/SSO providers; MFA; replacing the existing OIDC redirect login used elsewhere on the site (that stays for non-funnel entry points).

## Existing pieces we build on

- **Session:** `setSessionCookies({ id_token, access_token?, refresh_token? })` sets the httpOnly `msfg_id_token` cookie; `getSession()` verifies it on read; `getIdToken()` returns it for the hand-off. The OIDC callback's pattern (exchange → verify id_token → `setSessionCookies`) is what the branded routes reuse.
- **Cognito config:** `getCognitoConfig()` (region, userPoolId, clientId, clientSecret?, issuer, jwksUri). `verifyIdToken(idToken, nonce)` exists; the password flow has no nonce, so a **nonce-optional** verify path is needed.
- **Officers:** the full `Officer` (content/officers.ts) has `email`, `phone`, `nmls`, `photo`; `telDigits()` converts a display phone to a `tel:` number. The apply-flow `ApplyOfficer` (OfficerStep.tsx) currently carries `slug/name/title/nmls/photo/states` — **missing `email`/`phone`**.

## Architecture & flow

```
Finish screen (unauthenticated, auth configured)
  ┌─ AccountPanel (inline, branded) ───────────────────────────┐
  │  mode "signup": email (prefilled) + password               │
  │     → POST /api/v1/auth/signup                             │
  │        ├ code_sent → mode "code"                           │
  │        └ exists    → mode "signin" (+ "you already have…") │
  │  mode "code": 6-digit code + resend                       │
  │     → POST /api/v1/auth/confirm  (confirm + sign in)       │
  │  mode "signin": email + password                          │
  │     → POST /api/v1/auth/signin                             │
  │        └ unconfirmed → mode "code"                         │
  └─ on auth success → re-check useAuth → hand-off effect fires ┘
         → creates REGISTERED app, deep-links to /applications/{id}

  ── or ──
  Officer contact card: photo · {name} · NMLS #… · [Call][Text][Email]
```

Authenticated users keep the existing "Continue in the {shortName} app" path unchanged.

## Components

### 1. `src/lib/auth/cognitoIdp.ts` (new) — fetch-based IDP client
Pure server helpers hitting `https://cognito-idp.{region}.amazonaws.com/` with header `X-Amz-Target: AWSCognitoIdentityProviderService.<Op>` and a JSON body. No AWS signing (these are unauthenticated user-pool ops keyed by `ClientId`).
- `signUp({ email, password, firstName, lastName })` → `SignUp` (Username=email, UserAttributes email/given_name/family_name).
- `confirmSignUp({ email, code })` → `ConfirmSignUp`.
- `initiateAuth({ email, password })` → `InitiateAuth` `AuthFlow=USER_PASSWORD_AUTH` → `{ IdToken, AccessToken, RefreshToken }`.
- `resendCode({ email })` → `ResendConfirmationCode`.
- `secretHash(email)` — base64(HMAC-SHA256(clientSecret, email+clientId)) included when `clientSecret` is set (confidential client).
- Each maps Cognito error codes (from the JSON `__type`) to typed results, never throwing raw.

### 2. API routes (`src/app/api/v1/auth/*`, server-only, `runtime=nodejs`)
- `POST /signup { email, password, firstName?, lastName? }` → `signUp`
  - ok → `200 { status: "code_sent" }`
  - `UsernameExistsException` → `200 { status: "exists" }`
  - `InvalidPasswordException` → `400 { error: "<policy message>" }`
- `POST /confirm { email, code }` → `confirmSignUp` then `initiateAuth` → verify id_token → `setSessionCookies` → `200 { ok: true }`
  - `CodeMismatchException` → `400 { error: "code_mismatch" }`; `ExpiredCodeException` → `400 { error: "expired" }`
- `POST /signin { email, password }` → `initiateAuth` → verify → `setSessionCookies` → `200 { ok: true }`
  - `UserNotConfirmedException` → `200 { status: "unconfirmed" }` (UI jumps to code entry); on this, also call `resendCode`.
  - `NotAuthorizedException`/`UserNotFoundException` → `401 { error: "invalid_credentials" }` (uniform — no enumeration)
- `POST /resend { email }` → `resendCode` → `200 { ok: true }`
- All validate input with a small zod schema; all return `503` when `!authConfigured()`. A lightweight per-IP rate-limit guards `/signin` and `/signup` (reuse the public-API token-bucket pattern).

### 3. `src/components/apply/steps/AccountPanel.tsx` (new) — inline auth state machine
Client component. Props: `initialEmail`, `initialFirstName`, `initialLastName`, `onAuthed()`. State: `mode ∈ {signup, code, signin}`, `pending`, `error`. Branded with design tokens (green primary button, `rounded-lg`, etc.). On a successful `confirm`/`signin` it calls `onAuthed()`. "Already have an account? Sign in" / "Create one" toggles; "Resend code"; a disabled "Forgot password?" placeholder link (v2).

**Email is pre-filled from the funnel and read-only.** The hand-off's ownership check matches the signed-in email to the lead's contact email (the lead was captured anonymously, so there's no cognitoSub to match on). If the borrower created an account under a *different* email, the hand-off would silently 404. Locking the field to the funnel email guarantees the match and matches intent (they just entered it). A small caption explains "we'll use the email from your application." (The `signin` mode allows editing the email — a returning user may sign in under a different identity — but then the same ownership rule applies: a mismatched account won't receive this lead's application, which is correct.)

### 4. `FinishStep.tsx` integration
- When `auth.configured && !auth.authenticated`: render `<AccountPanel>` (pre-filled from the existing `contact` prop) instead of the redirect button. `onAuthed` calls `auth.refresh()` (or re-reads `/api/v1/auth/me`) so the existing hand-off `useEffect` fires.
- When authenticated: unchanged "Continue in the {shortName} app".
- Replace the officer link with the inline **officer contact card** (Call/Text/Email).

### 5. Officer data plumbing
- `ApplyOfficer` gains `email: string; phone: string`.
- `app/apply/[intent]/page.tsx` maps `email`/`phone` from `listOfficers()` into the officers prop.
- `FinishStep`'s `officer` prop carries `{ slug, name, nmls, photo, email, phone }` (the Wizard already resolves the chosen officer; extend what it passes).

## Cognito prerequisites (ops — required before the branded flow works live)
- Enable **USER_PASSWORD_AUTH** (`ALLOW_USER_PASSWORD_AUTH`) on the msfg.us app client.
- Enable **self-service sign-up** on the user pool.

## Errors & security
- Mapped, friendly errors: exists → "you already have an account, sign in"; invalid password → show the policy; code mismatch/expired → re-enter / resend; bad credentials → "email or password is incorrect"; unconfirmed → code entry.
- Server-only; passwords forwarded to Cognito over TLS and never stored or logged; tokens kept in httpOnly cookies; the id_token is signature/claims-verified before the session is set; per-IP rate-limit on `/signin` + `/signup`.

## Testing
- Route tests with the IDP `fetch` mocked: signup→code_sent; signup→exists; confirm→session set (cookie written); signin→session; signin→unconfirmed; bad/expired code; invalid credentials.
- `AccountPanel` component test: the signup→code→authed path, the exists→signin switch, and the signin→unconfirmed→code path.

## Open items / fast-follow
- Branded **forgot-password** (`ForgotPassword` + `ConfirmForgotPassword`) — same shape as signup+confirm; the link is present but inert in v1.
- Confirm the Cognito app client is **public vs confidential** (drives whether `SECRET_HASH` is sent) — handled in code either way; just verify against the deployed client.
