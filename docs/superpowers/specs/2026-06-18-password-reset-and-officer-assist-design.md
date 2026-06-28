# Client Password Reset + Officer-Assisted Reset — Design

- **Date:** 2026-06-18
- **Status:** Approved design (pre-plan)
- **Repo:** `msfg.us` (Next.js 16 / React 19 / TS / Cognito). Builds on the branded-auth work in PR #8 (`docs/superpowers/specs/2026-06-16-finish-screen-branded-auth-design.md`).

## Problem

Clients need **easy, repeatable access** to their account: a clean login and a self-service way to recover a forgotten password — fully on-brand, not the AWS Hosted UI. Separately, a **loan officer** must be able to help a stuck client regain access (e.g. on a phone call) without the security/compliance problems of knowing the client's actual password. Today msfg.us has branded auth only *inline on the apply finish screen*, an inert "Forgot password?" link, no standalone client login page, and no officer-assist mechanism.

## Decisions (locked in brainstorming)

1. **Officer assist = "send reset" OR "issue temp password" — never the real password.** The officer can (a) trigger a self-service reset (client gets a code, sets their own password — officer never sees it) or (b) issue a one-time temporary password that the client is **forced to change at next login**. The officer never learns the client's permanent password. (Setting a permanent password directly was rejected as an impersonation/GLBA anti-pattern.)
2. **Client self-service reset is branded + inline** — `ForgotPassword`/`ConfirmForgotPassword` in the same inline style as the existing signup→code flow. (Hosted-UI reset rejected as off-brand.)
3. **AuthZ: any Officer-role staff → any client account**, looked up by email, **restricted to client/borrower accounts only (never staff/admin)**, **every action audit-logged**. (Strict own-clients-only and admins-only were rejected — officers must be able to help any client who calls in.)
4. **Standalone branded `msfg.us/login` + `/forgot-password`** front door (reuses the `AccountPanel` component) so returning clients have an on-brand entry point and the LOS app (`app.msfgco.com`) can deep-link clients here. The Hosted-UI `/auth/login` redirect stays for staff/OIDC.
5. **AWS SDK for the officer/admin path** (`@aws-sdk/client-cognito-identity-provider`) — the Cognito Admin APIs are SigV4-signed and *must* be. The SDK family is already a dependency (`@aws-sdk/client-s3`). The unauthenticated client ops keep the existing no-SDK `fetch`/`X-Amz-Target` pattern.
6. **Capability = a new `canManageClients` boolean on `Membership`** (not a new role rank), so a loan officer can be granted client-management **without** site/config-editing rights.

## Goals / Non-goals

**Goals:** a client recovers a forgotten password on-brand without leaving msfg.us; a returning client has a branded login front door; an authorized officer can send a reset or issue a forced-change temp password to any client account, safely and auditably.

**Non-goals (this milestone):**
- **Officer onboarding / team-management UI** — actually creating staff `AdminUser`s for officers and a UI to grant `canManageClients` at scale is deferred ("work on that later"). For now the capability exists and a platform admin grants it manually (seed / direct toggle).
- Passwordless / email-OTP login (considered, not chosen).
- MFA (separate future decision).
- Changes to the LOS app (`app.msfgco.com`) — out of this repo; it merely deep-links to the new `/login`.

## Existing pieces we build on

- **Branded auth (PR #8):** `src/lib/auth/cognitoIdp.ts` (fetch-based IDP client: `signUp`/`confirmSignUp`/`initiateAuth`/`resendCode`, `IdpResult<T>`, `secretHash`, `X-Amz-Target` JSON, never-throws); `src/app/api/v1/auth/{signup,confirm,signin,resend}/route.ts`; `AccountPanel.tsx` + `accountPanelClient.ts` (mode state machine, inert "Forgot password?" link); `useAuth().refresh()`.
- **Session/Cognito:** `setSessionCookies({ id_token, refresh_token? })`, `verifyIdToken(idToken)` (nonce-optional), `authConfigured()`, `getCognitoConfig()` (region, userPoolId, clientId, clientSecret), `safeReturnTo()`; Hosted-UI `/auth/login`.
- **Rate-limit:** `checkRateLimit`/`clientIdentifier`/`rateLimitHeaders` (`src/server/api/rateLimit.ts`).
- **Admin authz:** `getAdminContext()`/`requireRole()` (`src/server/admin/access.ts`), `roleSatisfies()`/bootstrap allowlist (`src/server/admin/roles.ts`); Prisma `AdminUser`, `Membership`, `AdminRole` enum, `isPlatformAdmin`. Admin pages live under `src/app/admin/*`.
- **AWS creds:** the existing S3 client (`src/server/officers/s3.ts`) already resolves AWS credentials for this app; the same principal's IAM policy is extended (not a new credential mechanism).

---

## Part A — Client self-service reset + standalone login (no new infra)

### A1. `cognitoIdp.ts` — two new unauthenticated ops
Same pattern as the existing ops (ClientId, optional `SecretHash`, `X-Amz-Target`, typed `IdpResult`, never throws):
- `forgotPassword({ email })` → `ForgotPassword` (Cognito emails a reset code).
- `confirmForgotPassword({ email, code, newPassword })` → `ConfirmForgotPassword`.

### A2. Routes (`src/app/api/v1/auth/*`, `runtime=nodejs`)
- `POST /forgot { email }` → `forgotPassword`. **Anti-enumeration:** always return `200 { ok: true }`, including for `UserNotFoundException`/`InvalidParameterException` (unconfirmed/no-verified-email). Rate-limited per IP.
- `POST /reset { email, code, newPassword }` → `confirmForgotPassword`; on success, immediately `initiateAuth({ email, password: newPassword })` → `verifyIdToken` → `setSessionCookies` → `200 { ok: true }` (reset-and-signed-in). Mappings: `CodeMismatchException`→`400 code_mismatch`; `ExpiredCodeException`→`400 expired`; `InvalidPasswordException`→`400 { error: <policy msg> }`; `LimitExceededException`→`429`. Rate-limited.

### A3. `AccountPanel` — `forgot` + `reset` modes
Activate the inert link. New modes:
- `forgot`: email (prefilled/editable) → "Send reset code" → `accountPanelClient.forgot()` → on ok, go to `reset` mode with a notice.
- `reset`: 6-digit code + new password → "Reset & continue" → `accountPanelClient.reset()` → on ok, `onAuthed()` (now signed in); maps code_mismatch/expired/invalid-password messages. "Resend code" reuses `/forgot`.
- Signin mode's "Forgot password?" → switches to `forgot`. `accountPanelClient.ts` gains `forgot()` and `reset()` wrappers (same DI-fetch shape as existing wrappers).

### A4. Standalone branded pages
- **`/login`** — a branded page (reuses `AccountPanel`, default mode `signin`, signup hidden — signup is the funnel's job — forgot reachable). Accepts a `returnTo` query param sanitized via `safeReturnTo`; on `onAuthed`, redirect to `returnTo` (else `APP_URL`). Editable email (not locked, unlike the finish-screen instance). This requires a small `AccountPanel` prop extension: `initialMode?: "signin" | "signup"` and `allowSignup?: boolean` (defaults preserve current finish-screen behavior).
- **`/forgot-password`** — thin route that renders `/login` content in `forgot` mode (or redirects to `/login?mode=forgot`). The `mode` query also accepts `reset` (`/login?mode=reset`) so a client who **already has a code** (e.g. an officer-initiated reset) lands directly on the code + new-password step without re-requesting a code.
- The Hosted-UI `/auth/login` is unchanged (staff/OIDC). The LOS app can point returning clients at `https://msfg.us/login?returnTo=…`.

---

## Part B — Officer-assisted reset (new infra)

### B1. `src/lib/auth/cognitoAdmin.ts` (server-only) — SigV4 admin ops
Wraps `@aws-sdk/client-cognito-identity-provider` `CognitoIdentityProviderClient` (region from `getCognitoConfig()`, credentials via the existing default AWS chain used by the S3 client). Functions, each returning a typed result (never throwing raw):
- `getUserByEmail(email)` → `AdminGetUser` (Username = email) → `{ exists, status, sub, emailVerified }` (or `{ exists: false }` on `UserNotFoundException`).
- `sendReset(email)` → `AdminResetUserPassword` (sets the user to RESET_REQUIRED and emails a code — the client then completes at Part A's **reset step** (`/login?mode=reset` → `/reset`) using that code; no second code is requested).
- `issueTempPassword(email)` → generate a strong temp password (crypto-random, meets pool policy) → `AdminSetUserPassword({ Permanent: false })` → return the temp **once** to the caller (never persisted). Client status becomes FORCE_CHANGE_PASSWORD.

### B2. Staff-account guardrail (invariant)
Before `sendReset`/`issueTempPassword`, resolve the target's `sub` (via `getUserByEmail`) and **refuse if the target is staff**: an `AdminUser` exists for that `cognitoSub` with any `Membership` **or** `isPlatformAdmin`, **or** the email is on `ADMIN_BOOTSTRAP_EMAILS`. An officer can never reset a staff/admin account. Refusal is itself audit-logged.

### B3. Capability + guard
- Prisma: add `Membership.canManageClients Boolean @default(false)` (migration).
- `src/server/admin/access.ts`: add `requireClientManager()` — like `requireRole`, but passes when `isPlatformAdmin` **or** the active-tenant membership has `canManageClients`. Redirects to `/auth/login` (unauthenticated) or `/no-access` (unauthorized).
- Granting the flag is manual for now (seed / direct toggle) — see non-goals.

### B4. Audit log
- Prisma model `ClientAccessAudit { id, tenantId, actorAdminUserId, actorEmail, action, targetEmail, targetSub?, createdAt @default(now()) }` with an enum `ClientAccessAction { RESET_EMAIL_SENT, TEMP_PASSWORD_ISSUED, REFUSED_STAFF_TARGET }`; index `(tenantId, createdAt)` (migration).
- Every officer action writes a row (including refusals).

### B5. `/admin/clients` console
- Server-rendered page gated by `requireClientManager()`. A search box (client email) → server action calls `getUserByEmail` → shows status (no-account / unconfirmed / confirmed / force-change). Two server-action buttons:
  - **"Send password reset email"** → `sendReset` → client receives a code and completes at the branded reset step (`/login?mode=reset`).
  - **"Issue temporary password"** → `issueTempPassword` → shows the generated temp **once** with copy + "read this to the client; they'll be asked to set a new password at sign-in."
- Recent audit entries for the tenant shown below the form.

### B6. `NEW_PASSWORD_REQUIRED` handling (required by the temp-password path)
A client given a temp password signs in (`/login` or finish-screen) → `InitiateAuth` returns `ChallengeName: NEW_PASSWORD_REQUIRED` + a `Session`. Today `initiateAuth` rejects all challenges (`ChallengeNotSupported`), so this must be handled:
- `cognitoIdp.initiateAuth` returns the challenge instead of failing: `{ ok: true, challenge: "NEW_PASSWORD_REQUIRED", session }`.
- `POST /signin`: on that challenge, set the Cognito `Session` in a **short-lived httpOnly cookie** (never exposed to JS) and return `200 { ok: true, status: "new_password_required" }`.
- New `POST /api/v1/auth/new-password { email, newPassword }` → reads the challenge `Session` cookie → `RespondToAuthChallenge(NEW_PASSWORD_REQUIRED, { NEW_PASSWORD })` → `verifyIdToken` → `setSessionCookies` → clears the challenge cookie → `200 { ok: true }`. (`RespondToAuthChallenge` is an unauthenticated, ClientId-keyed op — fits `cognitoIdp.ts`, with `SECRET_HASH` when confidential.)
- `AccountPanel` gains a `new_password` mode (new password + confirm) reached when signin returns `new_password_required`.

The "send reset email" path needs none of this (it reuses Part A's `/reset`). B6 is bundled with Part B because it's only exercised by temp passwords.

---

## Errors & security

- **Client ops:** rate-limited per IP; `/forgot` is anti-enumeration (uniform `ok`); codes/passwords forwarded to Cognito over TLS, never stored or logged; new id_token verified before any session is set.
- **Admin ops:** behind staff auth + `canManageClients`; SigV4-signed via least-privilege IAM (policy scoped to `cognito-idp:AdminGetUser`, `AdminResetUserPassword`, `AdminSetUserPassword` on the pool ARN); **client-accounts-only** (staff-refusal invariant); every action (incl. refusals) audit-logged; temp passwords are random, shown once, never persisted, forced-change; officers never learn permanent passwords.
- **Challenge session:** the `NEW_PASSWORD_REQUIRED` `Session` lives only in a short-lived httpOnly cookie, never in JS.

## Ops prerequisites (not code)

- Cognito pool: enable **"prevent user existence errors"**; confirm the password-reset email message/template is configured (the pool already emails signup codes).
- Extend the existing AWS IAM principal's policy with the three `cognito-idp:Admin*` actions on the pool ARN (`us-west-1_S6iE2uego`).
- (Still pending from PR #8: enable `ALLOW_USER_PASSWORD_AUTH` + self-service sign-up.)

## Testing

- `cognitoIdp`: `forgotPassword`/`confirmForgotPassword` and the `NEW_PASSWORD_REQUIRED` branch of `initiateAuth` + `respondToNewPassword` — fetch mocked.
- Routes: `/forgot` (uniform ok incl. unknown user; rate-limit), `/reset` (success→session; code_mismatch; expired; invalid password), `/signin` (new_password_required → challenge cookie set), `/new-password` (challenge cookie → session; missing/expired cookie → 400/401).
- `cognitoAdmin`: via `aws-sdk-client-mock` — correct commands + the staff-refusal guard + audit writes.
- Admin actions: `requireClientManager` authz; staff-target refusal; audit row written.
- `AccountPanel`: forgot→reset→authed and signin→new_password→authed RTL paths.

## Decomposition (two implementation plans / PRs, one shared spec)

- **Plan 1 — Part A** (client self-service + standalone login): no new infra, stacks on PR #8.
- **Plan 2 — Part B** (officer console): adds `@aws-sdk/client-cognito-identity-provider` + `aws-sdk-client-mock`, `cognitoAdmin.ts`, two Prisma migrations (`canManageClients`, `ClientAccessAudit`), `requireClientManager`, `/admin/clients`, and the B6 `NEW_PASSWORD_REQUIRED` handling.

## Open / deferred

- Officer staff-account provisioning + a team-management UI to grant `canManageClients` (deferred — manual grant for now).
- Optional: scope officers to their own clients (Q3 alternative) as a later hardening once a reliable client↔officer assignment exists.
- MFA and passwordless login — separate future decisions.
