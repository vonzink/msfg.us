# Handoff — Client Password Management (msfg.us)

Paste the block below into the msfg-suite session.

---

You are picking up auth/identity work on the **msfg.us** repo at `/Users/zacharyzink/MSFG/WebProjects/msfg.us` (Next.js 16 / React 19 / TS / Tailwind v4 / Prisma 7 · Cognito pool `us-west-1_S6iE2uego` · LOS app at `app.msfgco.com`). This repo uses the **superpowers** workflow: brainstorming → writing-plans → subagent-driven-development, with specs in `docs/superpowers/specs/` and plans in `docs/superpowers/plans/`. TDD with **Vitest 4**; run a single test via `npx vitest run <path>`. Commits end with a `Co-Authored-By:` footer; branch off — never commit straight to `main`.

## Two work items are in flight

### 1. PR #8 — Finish-screen branded auth (DONE, awaiting merge)
- Branch `feat/finish-screen-branded-auth`, **PR: https://github.com/vonzink/msfg.us/pull/8**. Implemented + reviewed **READY TO MERGE**: `tsc` clean, **289/289 vitest** green.
- What it added (the foundation the new work extends): `src/lib/auth/cognitoIdp.ts` (fetch-based Cognito IDP client — `signUp`/`confirmSignUp`/`initiateAuth`/`resendCode`, `IdpResult<T>`, `secretHash`, `X-Amz-Target`, never-throws), `src/app/api/v1/auth/{signup,confirm,signin,resend}/route.ts`, `AccountPanel.tsx` + `accountPanelClient.ts` (inline auth state machine with an inert "Forgot password?" link), `useAuth().refresh()`, officer email/phone plumbed to `FinishStep`, and RTL/jsdom test infra.
- **Blocking ops prereq before it works live:** on Cognito pool `us-west-1_S6iE2uego` (msfg.us app client) enable **`ALLOW_USER_PASSWORD_AUTH`** + **self-service sign-up**. Until then the panel renders but signup/signin error in prod, so don't merge-to-deploy before the flag is on.

### 2. Client password management (SPEC APPROVED — next step: write the plan)
- **Spec (approved, committed):** `docs/superpowers/specs/2026-06-18-password-reset-and-officer-assist-design.md` (commit `a8708e2`) on branch **`feat/client-password-management`**. Read it first — it is the source of truth.
- **Status:** design approved by the owner; the spec's own user-review gate was handed off to you instead of completed. The next superpowers step is **`writing-plans`** (start with **Plan 1 / Part A**), then `subagent-driven-development` to execute.

#### Locked decisions (do NOT re-litigate)
- **Client self-service reset = branded + inline** (`ForgotPassword`/`ConfirmForgotPassword`), same style as the existing signup→code flow. No Hosted-UI reset.
- **Standalone branded `msfg.us/login` + `/forgot-password`** front door, reusing `AccountPanel` (signin + forgot; signup hidden — signup stays the funnel's job); `returnTo` sanitized via `safeReturnTo`; the LOS app deep-links here.
- **Officer assist = "send reset" OR "issue temp password" — NEVER the real password.** Temp = `AdminSetUserPassword(Permanent=false)` (forced change), shown once, never stored.
- **AuthZ:** any staff with a new **`canManageClients`** flag on `Membership` → any **client/borrower** account by email; **never a staff/admin account** (staff-refusal invariant); **every action audit-logged** (`ClientAccessAudit`).
- **AWS SDK** (`@aws-sdk/client-cognito-identity-provider`) for the signed Admin APIs — the SDK family is already a dep (`@aws-sdk/client-s3`); reuse the same AWS credentials, extend the IAM policy. The unauthenticated client ops keep the no-SDK `fetch`/`X-Amz-Target` pattern.
- **Temp-password path requires `NEW_PASSWORD_REQUIRED` handling** (extend `initiateAuth`/signin + a `/api/v1/auth/new-password` route + an `AccountPanel` `new_password` mode), because a forced-change temp can't otherwise be used to sign in. (The "send reset" path needs none of this — it reuses Part A's `/reset`.)
- **Deferred (owner said "later"):** provisioning officer staff accounts + a team-management UI to grant `canManageClients`. For now the capability exists and a platform admin grants it manually (seed / direct toggle).

#### Decomposition (two plans / two PRs, one shared spec)
- **Plan 1 — Part A** (client self-service + standalone login): no new infra.
- **Plan 2 — Part B** (officer console): `@aws-sdk/client-cognito-identity-provider` + `aws-sdk-client-mock`, `src/lib/auth/cognitoAdmin.ts`, two Prisma migrations (`Membership.canManageClients`, `ClientAccessAudit` + enum), `requireClientManager()` in `src/server/admin/access.ts`, `/admin/clients` console, the staff-refusal guard + audit, and the `NEW_PASSWORD_REQUIRED` handling.

## ⚠️ Branch/dependency logistics (read before coding)
`feat/client-password-management` was cut from **`main`**, so it currently contains **only the spec doc** — it does NOT yet include PR #8's `cognitoIdp.ts` / `AccountPanel` code that Part A extends. Before implementing Part A: **merge PR #8 to `main` first, then rebase `feat/client-password-management` onto the updated `main`** (or re-cut the implementation branch from post-#8 `main`). Part B then stacks on Part A.

## Recommended next actions (in order)
1. Read `docs/superpowers/specs/2026-06-18-password-reset-and-officer-assist-design.md` end to end.
2. Get PR #8 merged (and the Cognito `ALLOW_USER_PASSWORD_AUTH` + self-service-signup flag enabled), then rebase/re-cut the password-management branch onto updated `main`.
3. Invoke **`superpowers:writing-plans`** for **Plan 1 (Part A)** → save to `docs/superpowers/plans/`, then **`superpowers:subagent-driven-development`** to execute (fresh subagent per task + spec-then-quality review, the pattern used for PR #8).
4. Repeat for **Plan 2 (Part B)**.

## Ops prerequisites to line up (not code)
- PR #8: enable `ALLOW_USER_PASSWORD_AUTH` + self-service sign-up on the app client.
- Part B: extend the existing AWS IAM principal's policy with `cognito-idp:AdminGetUser`, `AdminResetUserPassword`, `AdminSetUserPassword` on the pool ARN; enable Cognito **"prevent user existence errors"**; confirm the reset-code email template.

## Known unrelated side-item
A latent **Zod v4 email-ordering bug** exists in prod `src/validation/lead.ts` (public lead intake can reject whitespaced emails — `z.email().trim()` runs the format check before trimming). It was fixed in the new `src/validation/auth.ts`; the lead.ts fix was spun off as a separate task chip (`task_192f3f47`) and is not part of either work item above.
