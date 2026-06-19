# Finish-Screen Branded Auth + Officer Contact Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a new borrower create an account (or sign in) inline on the apply-funnel finish screen — fully branded, no AWS Hosted UI — and reach their chosen loan officer directly (Call / Text / Email).

**Architecture:** A new fetch-based Cognito **IDP client** (`SignUp`/`ConfirmSignUp`/`InitiateAuth`/`ResendConfirmationCode` via `X-Amz-Target` JSON, no SDK) sits behind four server-only `/api/v1/auth/*` routes that verify the id_token and set the existing httpOnly session cookie. A client `AccountPanel` state machine drives signup→code→authed / signin / unconfirmed inline on `FinishStep`; on success it calls `useAuth().refresh()`, which flips `authenticated` and lets the existing LOS hand-off effect fire. The chosen officer’s real phone/email render in an inline `OfficerContactCard`.

**Tech Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · Zod v4 · Vitest 4 · `jose` (existing id_token verify) · node `crypto` (SecretHash).

---

## Deltas discovered during research (read before starting)

The approved spec was written from memory; the codebase differs in these ways. **These are intentional adjustments — follow the plan, not the spec, where they conflict.**

1. **No existing IDP-API call to mirror.** `exchangeCode`/`postToken` (`src/lib/auth/cognito.ts`) hit the **Hosted UI** `/oauth2/token` (OAuth2 form-encoded), *not* `cognito-idp.{region}.amazonaws.com`. The new `cognitoIdp.ts` is a genuinely new pattern (`Content-Type: application/x-amz-json-1.1`, `X-Amz-Target: AWSCognitoIdentityProviderService.<Op>`), consistent with the spec’s no-SDK philosophy but not a literal copy of `exchangeCode`.
2. **`setSessionCookies` takes `{ id_token, refresh_token? }` only** — there is **no `access_token`**. The spec’s `{ id_token, access_token?, refresh_token? }` is wrong; drop `access_token`.
3. **`verifyIdToken(idToken, expectedNonce?)` is already nonce-optional.** Call `verifyIdToken(idToken)` with no second arg — it still enforces RS256/iss/aud/exp/token_use. No new "nonce-optional verify path" code is needed.
4. **`useAuth()` has no `refresh`** — it is fire-once on mount. We add a `refresh()` to it (Task 7) so `AccountPanel.onAuthed` can re-read `/api/v1/auth/me` and let the hand-off effect fire.
5. **`/confirm` must carry `password`.** The spec’s confirm body `{ email, code }` can’t "confirm + sign in" because `InitiateAuth` needs the password. The `AccountPanel` already holds the password (entered in signup or signin); `/confirm` accepts `{ email, password, code }`.
6. **No React component test infra exists** (no `@testing-library/*`, no DOM env; Vitest `environment: "node"`, include glob `src/**/*.test.ts` only). Task 9 adds RTL + jsdom and broadens the glob to `.test.tsx` (per-file `// @vitest-environment jsdom` docblock keeps the 30+ node tests on node).
7. **`ApplyOfficer` lacks `email`/`phone`**; `FinishStep`’s `officer` prop type is the narrow `{ slug, name } | null` even though `Wizard` passes the full object. We widen both (Task 12, Task 13).
8. **Officer roster comes from `@/server/officers/officers` `listOfficers()`** (DB-backed, falls back to the bundled `OFFICERS` constant in `@/content/officers`). There is **no `listOfficers()` in `content/officers.ts`** — that file exports the `OFFICERS` array + `telDigits()`.

## Cognito prerequisite (ops, non-code — required before the flow works live)

On user pool `us-west-1_S6iE2uego`, msfg.us app client:
- Enable **`ALLOW_USER_PASSWORD_AUTH`** (USER_PASSWORD_AUTH) — required by `InitiateAuth`.
- Enable **self-service sign-up** on the pool — required by `SignUp`.

No new env vars: the IDP client reads `region`/`clientId`/`clientSecret` from the existing `getCognitoConfig()`, and the routes gate on the existing `authConfigured()`.

## Commit convention

Conventional commits scoped `feat(auth|apply)` / `test` / `chore`. End every commit message with the repo footer:
```
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

## File structure

**Create**
- `src/lib/auth/cognitoIdp.ts` — fetch-based Cognito IDP client (SignUp/ConfirmSignUp/InitiateAuth/ResendConfirmationCode + SecretHash + typed results). Server-only.
- `src/lib/auth/cognitoIdp.test.ts`
- `src/validation/auth.ts` — zod request schemas for the four routes.
- `src/validation/auth.test.ts`
- `src/app/api/v1/auth/signup/route.ts` (+ `route.test.ts`)
- `src/app/api/v1/auth/confirm/route.ts` (+ `route.test.ts`)
- `src/app/api/v1/auth/signin/route.ts` (+ `route.test.ts`)
- `src/app/api/v1/auth/resend/route.ts` (+ `route.test.ts`)
- `src/components/apply/steps/accountPanelClient.ts` — client-side typed fetch wrappers for the four routes (DI fetch for testability).
- `src/components/apply/steps/accountPanelClient.test.ts`
- `src/components/apply/steps/AccountPanel.tsx` — inline auth state machine. Client.
- `src/components/apply/steps/AccountPanel.test.tsx` (RTL)
- `src/components/apply/steps/OfficerContactCard.tsx` — Call/Text/Email card. Client.
- `src/components/apply/steps/OfficerContactCard.test.tsx` (RTL)

**Modify**
- `src/lib/auth/useAuth.ts` — add `refresh()`.
- `src/components/apply/steps/OfficerStep.tsx` — add `email`/`phone` to `ApplyOfficer`.
- `src/app/apply/[intent]/page.tsx` — map `email`/`phone` into the officers prop.
- `src/components/apply/steps/FinishStep.tsx` — render `AccountPanel` (unauth) / `OfficerContactCard`; widen `officer` prop; `onAuthed → auth.refresh()`.
- `vitest.config.ts` + `package.json` — RTL/jsdom devDeps + `.test.tsx` include glob.

---

## Task 1: Cognito IDP client (`cognitoIdp.ts`)

**Files:**
- Create: `src/lib/auth/cognitoIdp.ts`
- Test: `src/lib/auth/cognitoIdp.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/auth/cognitoIdp.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";

// Mutable config so one test can flip the client to "confidential".
const h = vi.hoisted(() => ({
  cfg: { region: "us-west-1", clientId: "client-1", clientSecret: undefined as string | undefined },
}));
vi.mock("@/lib/auth/cognito", () => ({ getCognitoConfig: () => h.cfg }));

import { signUp, confirmSignUp, initiateAuth, resendCode } from "./cognitoIdp";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

afterEach(() => {
  vi.restoreAllMocks();
  h.cfg = { region: "us-west-1", clientId: "client-1", clientSecret: undefined };
});

describe("cognitoIdp", () => {
  it("signUp POSTs SignUp with email attributes and no SecretHash for a public client", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(200, { UserSub: "u1" }));
    const res = await signUp({ email: "a@b.com", password: "Passw0rd!", firstName: "Ann", lastName: "Bee" });
    expect(res.ok).toBe(true);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe("https://cognito-idp.us-west-1.amazonaws.com/");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["X-Amz-Target"]).toBe("AWSCognitoIdentityProviderService.SignUp");
    expect(headers["Content-Type"]).toBe("application/x-amz-json-1.1");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.ClientId).toBe("client-1");
    expect(body.Username).toBe("a@b.com");
    expect(body.UserAttributes).toEqual([
      { Name: "email", Value: "a@b.com" },
      { Name: "given_name", Value: "Ann" },
      { Name: "family_name", Value: "Bee" },
    ]);
    expect(body.SecretHash).toBeUndefined();
  });

  it("maps a Cognito __type to a typed error code + message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(400, { __type: "UsernameExistsException", message: "User already exists" }),
    );
    const res = await signUp({ email: "a@b.com", password: "x" });
    expect(res).toEqual({ ok: false, code: "UsernameExistsException", message: "User already exists" });
  });

  it("strips the coral prefix from __type", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(400, { __type: "com.amazonaws#InvalidPasswordException", message: "bad" }),
    );
    const res = await signUp({ email: "a@b.com", password: "x" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("InvalidPasswordException");
  });

  it("initiateAuth returns tokens from AuthenticationResult", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(200, { AuthenticationResult: { IdToken: "id", AccessToken: "ac", RefreshToken: "rf" } }),
    );
    const res = await initiateAuth({ email: "a@b.com", password: "x" });
    expect(res).toEqual({ ok: true, data: { idToken: "id", accessToken: "ac", refreshToken: "rf" } });
  });

  it("initiateAuth maps NotAuthorizedException", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(400, { __type: "NotAuthorizedException", message: "Incorrect username or password." }),
    );
    const res = await initiateAuth({ email: "a@b.com", password: "x" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("NotAuthorizedException");
  });

  it("confirmSignUp and resendCode hit the right targets", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(200, {}));
    await confirmSignUp({ email: "a@b.com", code: "123456" });
    await resendCode({ email: "a@b.com" });
    const targets = fetchSpy.mock.calls.map((c) => ((c[1] as RequestInit).headers as Record<string, string>)["X-Amz-Target"]);
    expect(targets).toEqual([
      "AWSCognitoIdentityProviderService.ConfirmSignUp",
      "AWSCognitoIdentityProviderService.ResendConfirmationCode",
    ]);
  });

  it("includes a base64 SecretHash when the client is confidential", async () => {
    h.cfg = { region: "us-west-1", clientId: "client-1", clientSecret: "shhh" };
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(200, {}));
    await signUp({ email: "a@b.com", password: "Passw0rd!" });
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(typeof body.SecretHash).toBe("string");
    expect(body.SecretHash.length).toBeGreaterThan(0);
  });

  it("returns a NetworkError result instead of throwing", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    const res = await signUp({ email: "a@b.com", password: "x" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("NetworkError");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/auth/cognitoIdp.test.ts`
Expected: FAIL — `Failed to resolve import "./cognitoIdp"` (module not created yet).

- [ ] **Step 3: Write the implementation**

Create `src/lib/auth/cognitoIdp.ts`:

```ts
import "server-only";
import crypto from "node:crypto";
import { getCognitoConfig } from "@/lib/auth/cognito";

/**
 * Fetch-based Cognito IDP client for the branded apply-finish auth flow.
 *
 * Hits the IDP control-plane JSON API directly
 * (`https://cognito-idp.{region}.amazonaws.com/`, `X-Amz-Target`) — these are
 * UNAUTHENTICATED user-pool ops keyed by ClientId, so there is no SigV4. No AWS
 * SDK dependency. Each op returns a typed { ok } result and NEVER throws on a
 * Cognito error — the caller branches on `code`. Server-only; passwords are
 * forwarded over TLS and never logged.
 */

const IDP_TIMEOUT_MS = 8000;

export type IdpResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

export interface IdpTokens {
  idToken: string;
  accessToken: string;
  refreshToken?: string;
}

/** base64(HMAC-SHA256(clientSecret, username + clientId)) — required when the
 *  app client is confidential. undefined for a public client. */
function secretHash(username: string): string | undefined {
  const { clientId, clientSecret } = getCognitoConfig();
  if (!clientSecret) return undefined;
  return crypto.createHmac("sha256", clientSecret).update(username + clientId).digest("base64");
}

/** Strip the optional `prefix#` Cognito sometimes prepends to __type. */
function errorCode(type: unknown): string {
  if (typeof type !== "string" || !type) return "UnknownError";
  const hash = type.lastIndexOf("#");
  return hash >= 0 ? type.slice(hash + 1) : type;
}

async function idp<T>(target: string, body: Record<string, unknown>): Promise<IdpResult<T>> {
  const { region } = getCognitoConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IDP_TIMEOUT_MS);
  try {
    const res = await fetch(`https://cognito-idp.${region}.amazonaws.com/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-amz-json-1.1",
        "X-Amz-Target": `AWSCognitoIdentityProviderService.${target}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return { ok: false, code: errorCode(json.__type), message: String(json.message ?? "") };
    }
    return { ok: true, data: json as unknown as T };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, code: "Timeout", message: `IDP ${target} timed out` };
    }
    return { ok: false, code: "NetworkError", message: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

export function signUp(input: {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}): Promise<IdpResult<void>> {
  const { clientId } = getCognitoConfig();
  const attrs: { Name: string; Value: string }[] = [{ Name: "email", Value: input.email }];
  if (input.firstName) attrs.push({ Name: "given_name", Value: input.firstName });
  if (input.lastName) attrs.push({ Name: "family_name", Value: input.lastName });
  const hash = secretHash(input.email);
  return idp<void>("SignUp", {
    ClientId: clientId,
    Username: input.email,
    Password: input.password,
    UserAttributes: attrs,
    ...(hash ? { SecretHash: hash } : {}),
  });
}

export function confirmSignUp(input: { email: string; code: string }): Promise<IdpResult<void>> {
  const { clientId } = getCognitoConfig();
  const hash = secretHash(input.email);
  return idp<void>("ConfirmSignUp", {
    ClientId: clientId,
    Username: input.email,
    ConfirmationCode: input.code,
    ...(hash ? { SecretHash: hash } : {}),
  });
}

export async function initiateAuth(input: {
  email: string;
  password: string;
}): Promise<IdpResult<IdpTokens>> {
  const { clientId } = getCognitoConfig();
  const hash = secretHash(input.email);
  const res = await idp<{
    AuthenticationResult?: { IdToken?: string; AccessToken?: string; RefreshToken?: string };
    ChallengeName?: string;
  }>("InitiateAuth", {
    ClientId: clientId,
    AuthFlow: "USER_PASSWORD_AUTH",
    AuthParameters: {
      USERNAME: input.email,
      PASSWORD: input.password,
      ...(hash ? { SECRET_HASH: hash } : {}),
    },
  });
  if (!res.ok) return res;
  const r = res.data.AuthenticationResult;
  if (!r?.IdToken || !r.AccessToken) {
    // A challenge (MFA, etc.) or empty result — unsupported in v1.
    return {
      ok: false,
      code: res.data.ChallengeName ? "ChallengeNotSupported" : "NoAuthResult",
      message: "Authentication did not return tokens",
    };
  }
  return { ok: true, data: { idToken: r.IdToken, accessToken: r.AccessToken, refreshToken: r.RefreshToken } };
}

export function resendCode(input: { email: string }): Promise<IdpResult<void>> {
  const { clientId } = getCognitoConfig();
  const hash = secretHash(input.email);
  return idp<void>("ResendConfirmationCode", {
    ClientId: clientId,
    Username: input.email,
    ...(hash ? { SecretHash: hash } : {}),
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/auth/cognitoIdp.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/cognitoIdp.ts src/lib/auth/cognitoIdp.test.ts
git commit -m "feat(auth): fetch-based Cognito IDP client for branded apply auth"
```

---

## Task 2: Auth request schemas (`validation/auth.ts`)

**Files:**
- Create: `src/validation/auth.ts`
- Test: `src/validation/auth.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/validation/auth.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { signupSchema, confirmSchema, signinSchema, resendSchema } from "./auth";

describe("auth schemas", () => {
  it("normalizes email to lowercase + trims", () => {
    const r = signinSchema.safeParse({ email: "  A@B.COM ", password: "longenough" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe("a@b.com");
  });

  it("rejects a short password", () => {
    expect(signinSchema.safeParse({ email: "a@b.com", password: "x" }).success).toBe(false);
  });

  it("confirm requires a numeric code and a password", () => {
    expect(confirmSchema.safeParse({ email: "a@b.com", password: "longenough", code: "abc" }).success).toBe(false);
    expect(confirmSchema.safeParse({ email: "a@b.com", code: "123456" }).success).toBe(false);
    expect(confirmSchema.safeParse({ email: "a@b.com", password: "longenough", code: "123456" }).success).toBe(true);
  });

  it("signup accepts optional names", () => {
    expect(signupSchema.safeParse({ email: "a@b.com", password: "longenough" }).success).toBe(true);
    expect(signupSchema.safeParse({ email: "a@b.com", password: "longenough", firstName: "Ann", lastName: "Bee" }).success).toBe(true);
  });

  it("resend needs only an email", () => {
    expect(resendSchema.safeParse({ email: "a@b.com" }).success).toBe(true);
    expect(resendSchema.safeParse({}).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/validation/auth.test.ts`
Expected: FAIL — `Failed to resolve import "./auth"`.

- [ ] **Step 3: Write the implementation**

Create `src/validation/auth.ts`:

```ts
import { z } from "zod";

/** Shared field rules. Email is normalized exactly like the lead schema
 *  (`@/validation/lead`) so the hand-off ownership match stays case-stable. */
const email = z.email("A valid email is required").trim().toLowerCase();
const password = z.string().min(8, "Password must be at least 8 characters").max(256);
const code = z.string().trim().regex(/^\d{4,8}$/, "Enter the code from your email");

export const signupSchema = z.object({
  email,
  password,
  firstName: z.string().trim().max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
});
export type SignupInput = z.infer<typeof signupSchema>;

/** Confirm carries the password so the route can confirm + sign in in one call. */
export const confirmSchema = z.object({ email, password, code });
export type ConfirmInput = z.infer<typeof confirmSchema>;

export const signinSchema = z.object({ email, password });
export type SigninInput = z.infer<typeof signinSchema>;

export const resendSchema = z.object({ email });
export type ResendInput = z.infer<typeof resendSchema>;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/validation/auth.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/validation/auth.ts src/validation/auth.test.ts
git commit -m "feat(auth): zod request schemas for branded auth routes"
```

---

## Task 3: `POST /api/v1/auth/signup`

**Files:**
- Create: `src/app/api/v1/auth/signup/route.ts`
- Test: `src/app/api/v1/auth/signup/route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/api/v1/auth/signup/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/cognito", () => ({ authConfigured: vi.fn(() => true) }));
vi.mock("@/lib/auth/cognitoIdp", () => ({ signUp: vi.fn() }));
vi.mock("@/server/api/rateLimit", () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true, limit: 60, remaining: 59, reset: 0, retryAfter: 0 })),
  clientIdentifier: () => "ip:test",
  rateLimitHeaders: () => ({}),
}));

import { POST } from "./route";
import * as cognito from "@/lib/auth/cognito";
import * as idp from "@/lib/auth/cognitoIdp";
import * as rl from "@/server/api/rateLimit";

const authConfigured = vi.mocked(cognito.authConfigured);
const signUp = vi.mocked(idp.signUp);
const checkRateLimit = vi.mocked(rl.checkRateLimit);

function req(body: unknown) {
  return new Request("http://x/api/v1/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  authConfigured.mockReturnValue(true);
  signUp.mockReset();
  checkRateLimit.mockReturnValue({ allowed: true, limit: 60, remaining: 59, reset: 0, retryAfter: 0 });
});

describe("POST /api/v1/auth/signup", () => {
  it("returns code_sent on success", async () => {
    signUp.mockResolvedValue({ ok: true, data: undefined });
    const res = await POST(req({ email: "a@b.com", password: "longenough" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, status: "code_sent" });
  });

  it("returns exists when the user already exists", async () => {
    signUp.mockResolvedValue({ ok: false, code: "UsernameExistsException", message: "exists" });
    const res = await POST(req({ email: "a@b.com", password: "longenough" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, status: "exists" });
  });

  it("surfaces the password policy message on InvalidPasswordException", async () => {
    signUp.mockResolvedValue({ ok: false, code: "InvalidPasswordException", message: "Password must contain a number" });
    const res = await POST(req({ email: "a@b.com", password: "longenough" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Password must contain a number");
  });

  it("400s on an invalid body", async () => {
    const res = await POST(req({ email: "not-an-email" }));
    expect(res.status).toBe(400);
  });

  it("429s when rate limited", async () => {
    checkRateLimit.mockReturnValue({ allowed: false, limit: 60, remaining: 0, reset: 0, retryAfter: 5 });
    const res = await POST(req({ email: "a@b.com", password: "longenough" }));
    expect(res.status).toBe(429);
  });

  it("503s when auth is not configured", async () => {
    authConfigured.mockReturnValue(false);
    const res = await POST(req({ email: "a@b.com", password: "longenough" }));
    expect(res.status).toBe(503);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/api/v1/auth/signup/route.test.ts`
Expected: FAIL — `Failed to resolve import "./route"`.

- [ ] **Step 3: Write the implementation**

Create `src/app/api/v1/auth/signup/route.ts`:

```ts
/**
 * POST /api/v1/auth/signup — branded apply-finish sign-up (server-only).
 *
 * Proxies Cognito SignUp via the fetch-based IDP client. Never reveals whether
 * an email exists beyond the friendly "sign in instead" hint. Per-IP rate
 * limited. Node runtime; never cached.
 */
import { NextResponse } from "next/server";
import { authConfigured } from "@/lib/auth/cognito";
import { signUp } from "@/lib/auth/cognitoIdp";
import { signupSchema } from "@/validation/auth";
import { checkRateLimit, clientIdentifier, rateLimitHeaders } from "@/server/api/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!authConfigured()) {
    return NextResponse.json({ ok: false, error: "Authentication is not configured." }, { status: 503 });
  }

  const rl = checkRateLimit(clientIdentifier(req));
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many attempts. Please try again shortly." },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = signupSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  }

  const result = await signUp(parsed.data);
  if (result.ok) {
    return NextResponse.json({ ok: true, status: "code_sent" });
  }

  switch (result.code) {
    case "UsernameExistsException":
      return NextResponse.json({ ok: true, status: "exists" });
    case "InvalidPasswordException":
    case "InvalidParameterException":
      return NextResponse.json(
        { ok: false, error: result.message || "That password doesn't meet the requirements." },
        { status: 400 },
      );
    case "NetworkError":
    case "Timeout":
      return NextResponse.json(
        { ok: false, error: "We couldn't reach the sign-up service. Please try again." },
        { status: 503 },
      );
    default:
      console.warn(`[auth/signup] unexpected: ${result.code} ${result.message}`);
      return NextResponse.json(
        { ok: false, error: "We couldn't create your account. Please try again." },
        { status: 400 },
      );
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/app/api/v1/auth/signup/route.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/v1/auth/signup
git commit -m "feat(auth): POST /api/v1/auth/signup branded sign-up route"
```

---

## Task 4: `POST /api/v1/auth/confirm`

**Files:**
- Create: `src/app/api/v1/auth/confirm/route.ts`
- Test: `src/app/api/v1/auth/confirm/route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/api/v1/auth/confirm/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/cognito", () => ({
  authConfigured: vi.fn(() => true),
  verifyIdToken: vi.fn(async () => ({ sub: "s" })),
}));
vi.mock("@/lib/auth/cognitoIdp", () => ({ confirmSignUp: vi.fn(), initiateAuth: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ setSessionCookies: vi.fn() }));

import { POST } from "./route";
import * as cognito from "@/lib/auth/cognito";
import * as idp from "@/lib/auth/cognitoIdp";
import * as session from "@/lib/auth/session";

const authConfigured = vi.mocked(cognito.authConfigured);
const verifyIdToken = vi.mocked(cognito.verifyIdToken);
const confirmSignUp = vi.mocked(idp.confirmSignUp);
const initiateAuth = vi.mocked(idp.initiateAuth);
const setSessionCookies = vi.mocked(session.setSessionCookies);

function req(body: unknown) {
  return new Request("http://x/api/v1/auth/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const valid = { email: "a@b.com", password: "longenough", code: "123456" };

beforeEach(() => {
  authConfigured.mockReturnValue(true);
  verifyIdToken.mockResolvedValue({ sub: "s" } as unknown as Awaited<ReturnType<typeof verifyIdToken>>);
  confirmSignUp.mockReset();
  initiateAuth.mockReset();
  setSessionCookies.mockReset();
});

describe("POST /api/v1/auth/confirm", () => {
  it("confirms, signs in, and sets the session cookie (no access_token)", async () => {
    confirmSignUp.mockResolvedValue({ ok: true, data: undefined });
    initiateAuth.mockResolvedValue({ ok: true, data: { idToken: "id", accessToken: "ac", refreshToken: "rf" } });
    const res = await POST(req(valid));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(setSessionCookies).toHaveBeenCalledWith({ id_token: "id", refresh_token: "rf" });
  });

  it("400 code_mismatch on CodeMismatchException", async () => {
    confirmSignUp.mockResolvedValue({ ok: false, code: "CodeMismatchException", message: "" });
    const res = await POST(req(valid));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("code_mismatch");
    expect(initiateAuth).not.toHaveBeenCalled();
  });

  it("400 expired on ExpiredCodeException", async () => {
    confirmSignUp.mockResolvedValue({ ok: false, code: "ExpiredCodeException", message: "" });
    const res = await POST(req(valid));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("expired");
  });

  it("401 when sign-in after confirm fails", async () => {
    confirmSignUp.mockResolvedValue({ ok: true, data: undefined });
    initiateAuth.mockResolvedValue({ ok: false, code: "NotAuthorizedException", message: "" });
    const res = await POST(req(valid));
    expect(res.status).toBe(401);
  });

  it("400 on invalid body", async () => {
    const res = await POST(req({ email: "a@b.com", code: "123456" }));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/api/v1/auth/confirm/route.test.ts`
Expected: FAIL — `Failed to resolve import "./route"`.

- [ ] **Step 3: Write the implementation**

Create `src/app/api/v1/auth/confirm/route.ts`:

```ts
/**
 * POST /api/v1/auth/confirm — confirm a new account AND sign it in.
 *
 * ConfirmSignUp(code) → InitiateAuth(USER_PASSWORD_AUTH) → verify id_token →
 * set the httpOnly session cookie. The password is carried from the client
 * (entered during sign-up) so we can mint a session immediately. Node runtime.
 */
import { NextResponse } from "next/server";
import { authConfigured, verifyIdToken } from "@/lib/auth/cognito";
import { confirmSignUp, initiateAuth } from "@/lib/auth/cognitoIdp";
import { setSessionCookies } from "@/lib/auth/session";
import { confirmSchema } from "@/validation/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!authConfigured()) {
    return NextResponse.json({ ok: false, error: "Authentication is not configured." }, { status: 503 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = confirmSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  }
  const { email, password, code } = parsed.data;

  const confirmed = await confirmSignUp({ email, code });
  if (!confirmed.ok) {
    if (confirmed.code === "CodeMismatchException") {
      return NextResponse.json({ ok: false, error: "code_mismatch" }, { status: 400 });
    }
    if (confirmed.code === "ExpiredCodeException") {
      return NextResponse.json({ ok: false, error: "expired" }, { status: 400 });
    }
    if (confirmed.code === "NetworkError" || confirmed.code === "Timeout") {
      return NextResponse.json(
        { ok: false, error: "We couldn't reach the verification service. Please try again." },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { ok: false, error: "We couldn't confirm that code. Please try again." },
      { status: 400 },
    );
  }

  const auth = await initiateAuth({ email, password });
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: "invalid_credentials" }, { status: 401 });
  }

  try {
    await verifyIdToken(auth.data.idToken);
  } catch {
    return NextResponse.json(
      { ok: false, error: "We couldn't verify your session. Please try signing in." },
      { status: 401 },
    );
  }

  await setSessionCookies({ id_token: auth.data.idToken, refresh_token: auth.data.refreshToken });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/app/api/v1/auth/confirm/route.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/v1/auth/confirm
git commit -m "feat(auth): POST /api/v1/auth/confirm verify code + establish session"
```

---

## Task 5: `POST /api/v1/auth/signin`

**Files:**
- Create: `src/app/api/v1/auth/signin/route.ts`
- Test: `src/app/api/v1/auth/signin/route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/api/v1/auth/signin/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/cognito", () => ({
  authConfigured: vi.fn(() => true),
  verifyIdToken: vi.fn(async () => ({ sub: "s" })),
}));
vi.mock("@/lib/auth/cognitoIdp", () => ({ initiateAuth: vi.fn(), resendCode: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ setSessionCookies: vi.fn() }));
vi.mock("@/server/api/rateLimit", () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true, limit: 60, remaining: 59, reset: 0, retryAfter: 0 })),
  clientIdentifier: () => "ip:test",
  rateLimitHeaders: () => ({}),
}));

import { POST } from "./route";
import * as cognito from "@/lib/auth/cognito";
import * as idp from "@/lib/auth/cognitoIdp";
import * as session from "@/lib/auth/session";
import * as rl from "@/server/api/rateLimit";

const authConfigured = vi.mocked(cognito.authConfigured);
const initiateAuth = vi.mocked(idp.initiateAuth);
const resendCode = vi.mocked(idp.resendCode);
const setSessionCookies = vi.mocked(session.setSessionCookies);
const checkRateLimit = vi.mocked(rl.checkRateLimit);

function req(body: unknown) {
  return new Request("http://x/api/v1/auth/signin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const valid = { email: "a@b.com", password: "longenough" };

beforeEach(() => {
  authConfigured.mockReturnValue(true);
  initiateAuth.mockReset();
  resendCode.mockReset();
  setSessionCookies.mockReset();
  checkRateLimit.mockReturnValue({ allowed: true, limit: 60, remaining: 59, reset: 0, retryAfter: 0 });
});

describe("POST /api/v1/auth/signin", () => {
  it("signs in and sets the session cookie", async () => {
    initiateAuth.mockResolvedValue({ ok: true, data: { idToken: "id", accessToken: "ac", refreshToken: "rf" } });
    const res = await POST(req(valid));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(setSessionCookies).toHaveBeenCalledWith({ id_token: "id", refresh_token: "rf" });
  });

  it("returns unconfirmed and triggers a resend when the user isn't verified", async () => {
    initiateAuth.mockResolvedValue({ ok: false, code: "UserNotConfirmedException", message: "" });
    const res = await POST(req(valid));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, status: "unconfirmed" });
    expect(resendCode).toHaveBeenCalledWith({ email: "a@b.com" });
  });

  it("returns a uniform 401 on bad credentials (no enumeration)", async () => {
    initiateAuth.mockResolvedValue({ ok: false, code: "NotAuthorizedException", message: "" });
    const res = await POST(req(valid));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("invalid_credentials");
  });

  it("returns the same 401 for an unknown user", async () => {
    initiateAuth.mockResolvedValue({ ok: false, code: "UserNotFoundException", message: "" });
    const res = await POST(req(valid));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("invalid_credentials");
  });

  it("429s when rate limited", async () => {
    checkRateLimit.mockReturnValue({ allowed: false, limit: 60, remaining: 0, reset: 0, retryAfter: 5 });
    const res = await POST(req(valid));
    expect(res.status).toBe(429);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/api/v1/auth/signin/route.test.ts`
Expected: FAIL — `Failed to resolve import "./route"`.

- [ ] **Step 3: Write the implementation**

Create `src/app/api/v1/auth/signin/route.ts`:

```ts
/**
 * POST /api/v1/auth/signin — branded inline sign-in (server-only).
 *
 * InitiateAuth(USER_PASSWORD_AUTH) → verify id_token → set session cookie. On
 * an unverified account, returns status:"unconfirmed" and re-sends the code so
 * the UI can jump to code entry. Bad/unknown credentials collapse to a single
 * 401 (no account enumeration). Per-IP rate limited. Node runtime.
 */
import { NextResponse } from "next/server";
import { authConfigured, verifyIdToken } from "@/lib/auth/cognito";
import { initiateAuth, resendCode } from "@/lib/auth/cognitoIdp";
import { setSessionCookies } from "@/lib/auth/session";
import { signinSchema } from "@/validation/auth";
import { checkRateLimit, clientIdentifier, rateLimitHeaders } from "@/server/api/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!authConfigured()) {
    return NextResponse.json({ ok: false, error: "Authentication is not configured." }, { status: 503 });
  }

  const rl = checkRateLimit(clientIdentifier(req));
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many attempts. Please try again shortly." },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = signinSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  }
  const { email, password } = parsed.data;

  const auth = await initiateAuth({ email, password });
  if (!auth.ok) {
    if (auth.code === "UserNotConfirmedException") {
      await resendCode({ email });
      return NextResponse.json({ ok: true, status: "unconfirmed" });
    }
    if (auth.code === "NetworkError" || auth.code === "Timeout") {
      return NextResponse.json(
        { ok: false, error: "We couldn't reach the sign-in service. Please try again." },
        { status: 503 },
      );
    }
    // NotAuthorizedException / UserNotFoundException → uniform.
    return NextResponse.json({ ok: false, error: "invalid_credentials" }, { status: 401 });
  }

  try {
    await verifyIdToken(auth.data.idToken);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_credentials" }, { status: 401 });
  }

  await setSessionCookies({ id_token: auth.data.idToken, refresh_token: auth.data.refreshToken });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/app/api/v1/auth/signin/route.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/v1/auth/signin
git commit -m "feat(auth): POST /api/v1/auth/signin branded inline sign-in"
```

---

## Task 6: `POST /api/v1/auth/resend`

**Files:**
- Create: `src/app/api/v1/auth/resend/route.ts`
- Test: `src/app/api/v1/auth/resend/route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/api/v1/auth/resend/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/cognito", () => ({ authConfigured: vi.fn(() => true) }));
vi.mock("@/lib/auth/cognitoIdp", () => ({ resendCode: vi.fn() }));

import { POST } from "./route";
import * as cognito from "@/lib/auth/cognito";
import * as idp from "@/lib/auth/cognitoIdp";

const authConfigured = vi.mocked(cognito.authConfigured);
const resendCode = vi.mocked(idp.resendCode);

function req(body: unknown) {
  return new Request("http://x/api/v1/auth/resend", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  authConfigured.mockReturnValue(true);
  resendCode.mockReset();
});

describe("POST /api/v1/auth/resend", () => {
  it("returns ok on success", async () => {
    resendCode.mockResolvedValue({ ok: true, data: undefined });
    const res = await POST(req({ email: "a@b.com" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("429s on LimitExceededException", async () => {
    resendCode.mockResolvedValue({ ok: false, code: "LimitExceededException", message: "" });
    const res = await POST(req({ email: "a@b.com" }));
    expect(res.status).toBe(429);
  });

  it("400s on an invalid body", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/api/v1/auth/resend/route.test.ts`
Expected: FAIL — `Failed to resolve import "./route"`.

- [ ] **Step 3: Write the implementation**

Create `src/app/api/v1/auth/resend/route.ts`:

```ts
/**
 * POST /api/v1/auth/resend — re-send the email confirmation code.
 *
 * Forgiving by design: unknown errors still return ok so we never reveal
 * account state; only an explicit rate-limit surfaces a 429. Node runtime.
 */
import { NextResponse } from "next/server";
import { authConfigured } from "@/lib/auth/cognito";
import { resendCode } from "@/lib/auth/cognitoIdp";
import { resendSchema } from "@/validation/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!authConfigured()) {
    return NextResponse.json({ ok: false, error: "Authentication is not configured." }, { status: 503 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = resendSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  }

  const result = await resendCode(parsed.data);
  if (!result.ok && result.code === "LimitExceededException") {
    return NextResponse.json(
      { ok: false, error: "Please wait a moment before requesting another code." },
      { status: 429 },
    );
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/app/api/v1/auth/resend/route.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/v1/auth/resend
git commit -m "feat(auth): POST /api/v1/auth/resend confirmation code"
```

---

## Task 7: Add `refresh()` to `useAuth`

**Files:**
- Modify: `src/lib/auth/useAuth.ts`

No new test (the repo does not test hooks; `noUnusedLocals`-safe refactor verified by the existing suite + typecheck). The behavior change is additive: callers gain a `refresh()` that re-reads `/api/v1/auth/me`.

- [ ] **Step 1: Replace the file**

Overwrite `src/lib/auth/useAuth.ts` with:

```ts
"use client";

/**
 * Client hook that reads the current session from `GET /api/v1/auth/me`.
 *
 * Returns derived identity only ({ sub, email, name }) — NEVER tokens (those
 * stay in httpOnly cookies, server-side). `configured` reflects whether Cognito
 * SSO is wired at all. `refresh()` re-reads /me — call it after an inline
 * sign-in (AccountPanel) so dependent effects (e.g. the LOS hand-off) re-fire.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export interface AuthUser {
  sub: string;
  email?: string;
  name?: string;
}

export interface AuthState {
  /** True until the first /me response resolves. */
  loading: boolean;
  /** Whether Cognito SSO is configured on the server. */
  configured: boolean;
  /** Whether there is a valid session. */
  authenticated: boolean;
  user: AuthUser | null;
  /** Re-read /api/v1/auth/me (e.g. after an inline sign-in). */
  refresh: () => void;
}

interface MeResponse {
  authenticated: boolean;
  configured?: boolean;
  user?: AuthUser;
}

type ResolvedState = Omit<AuthState, "refresh">;

const SIGNED_OUT: ResolvedState = { loading: false, configured: false, authenticated: false, user: null };

export function useAuth(): AuthState {
  const [state, setState] = useState<ResolvedState>({
    loading: true,
    configured: false,
    authenticated: false,
    user: null,
  });
  const mounted = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/auth/me", { credentials: "same-origin", cache: "no-store" });
      const data = res.ok ? ((await res.json()) as MeResponse) : null;
      if (!mounted.current) return;
      setState(
        data
          ? {
              loading: false,
              configured: Boolean(data.configured),
              authenticated: Boolean(data.authenticated),
              user: data.user ?? null,
            }
          : SIGNED_OUT,
      );
    } catch {
      if (mounted.current) setState(SIGNED_OUT);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  return { ...state, refresh: () => void load() };
}
```

- [ ] **Step 2: Verify typecheck + existing suite still pass**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx vitest run`
Expected: all existing tests PASS (no test imports `useAuth`, so this only confirms nothing regressed).

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth/useAuth.ts
git commit -m "feat(auth): add useAuth().refresh() for post-inline-sign-in re-read"
```

---

## Task 8: AccountPanel client wrappers (`accountPanelClient.ts`)

**Files:**
- Create: `src/components/apply/steps/accountPanelClient.ts`
- Test: `src/components/apply/steps/accountPanelClient.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/components/apply/steps/accountPanelClient.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { signup, confirm, signin, resend } from "./accountPanelClient";

function fetcher(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

describe("accountPanelClient", () => {
  it("signup posts to the signup route and returns the parsed status", async () => {
    const f = fetcher(200, { ok: true, status: "code_sent" });
    const res = await signup({ email: "a@b.com", password: "x" }, f as unknown as typeof fetch);
    expect(res).toEqual({ ok: true, status: "code_sent" });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("/api/v1/auth/signup");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ email: "a@b.com", password: "x" });
  });

  it("confirm carries email, password, and code", async () => {
    const f = fetcher(200, { ok: true });
    await confirm({ email: "a@b.com", password: "pw", code: "123456" }, f as unknown as typeof fetch);
    expect(JSON.parse((f.mock.calls[0][1] as RequestInit).body as string)).toEqual({
      email: "a@b.com",
      password: "pw",
      code: "123456",
    });
  });

  it("signin surfaces the unconfirmed status", async () => {
    const f = fetcher(200, { ok: true, status: "unconfirmed" });
    expect(await signin({ email: "a@b.com", password: "x" }, f as unknown as typeof fetch)).toEqual({
      ok: true,
      status: "unconfirmed",
    });
  });

  it("returns a network error when fetch throws", async () => {
    const f = vi.fn(async () => {
      throw new Error("offline");
    });
    expect(await resend({ email: "a@b.com" }, f as unknown as typeof fetch)).toEqual({ ok: false, error: "network" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/apply/steps/accountPanelClient.test.ts`
Expected: FAIL — `Failed to resolve import "./accountPanelClient"`.

- [ ] **Step 3: Write the implementation**

Create `src/components/apply/steps/accountPanelClient.ts`:

```ts
/**
 * Browser-side typed wrappers for the /api/v1/auth/* routes used by
 * AccountPanel. The fetch impl is injectable so the request shaping + response
 * parsing can be unit-tested without a DOM. A thrown fetch (offline) collapses
 * to { ok:false, error:"network" }.
 */

export type SignupResponse = { ok: true; status: "code_sent" | "exists" } | { ok: false; error: string };
export type ConfirmResponse = { ok: true } | { ok: false; error: string };
export type SigninResponse = { ok: true; status?: "unconfirmed" } | { ok: false; error: string };
export type ResendResponse = { ok: true } | { ok: false; error: string };

type Fetcher = typeof fetch;

async function postJson<T extends { ok: boolean }>(url: string, body: unknown, fetcher: Fetcher): Promise<T> {
  try {
    const res = await fetcher(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      body: JSON.stringify(body),
    });
    return (await res.json().catch(() => ({ ok: false, error: "network" }))) as T;
  } catch {
    return { ok: false, error: "network" } as T;
  }
}

export function signup(
  input: { email: string; password: string; firstName?: string; lastName?: string },
  fetcher: Fetcher = fetch,
): Promise<SignupResponse> {
  return postJson<SignupResponse>("/api/v1/auth/signup", input, fetcher);
}

export function confirm(
  input: { email: string; password: string; code: string },
  fetcher: Fetcher = fetch,
): Promise<ConfirmResponse> {
  return postJson<ConfirmResponse>("/api/v1/auth/confirm", input, fetcher);
}

export function signin(
  input: { email: string; password: string },
  fetcher: Fetcher = fetch,
): Promise<SigninResponse> {
  return postJson<SigninResponse>("/api/v1/auth/signin", input, fetcher);
}

export function resend(input: { email: string }, fetcher: Fetcher = fetch): Promise<ResendResponse> {
  return postJson<ResendResponse>("/api/v1/auth/resend", input, fetcher);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/apply/steps/accountPanelClient.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/apply/steps/accountPanelClient.ts src/components/apply/steps/accountPanelClient.test.ts
git commit -m "feat(apply): typed client wrappers for branded auth routes"
```

---

## Task 9: Add React component test infrastructure (RTL + jsdom)

**Files:**
- Modify: `package.json` (devDependencies)
- Modify: `vitest.config.ts` (include glob)

The repo has no component-test infra today. We add it without disturbing the node-environment tests by keeping `environment: "node"` as the default and putting `// @vitest-environment jsdom` on each `.test.tsx`.

- [ ] **Step 1: Install dev dependencies**

Run:
```bash
npm install -D @testing-library/react@^16 @testing-library/user-event@^14 @testing-library/jest-dom@^6 jsdom
```
Expected: installs succeed; `package.json` devDependencies updated.

- [ ] **Step 2: Broaden the Vitest include glob to `.test.tsx`**

In `vitest.config.ts`, change the `include` line:

```ts
    include: ["src/**/*.test.ts"],
```
to:
```ts
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
```
Leave `environment: "node"` and the `server-only` alias unchanged.

- [ ] **Step 3: Verify the existing suite still passes under the broadened glob**

Run: `npx vitest run`
Expected: all existing node tests PASS (no `.test.tsx` files exist yet, so the glob change is inert until Task 10).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore(test): add RTL + jsdom and allow .test.tsx component tests"
```

---

## Task 10: `AccountPanel.tsx` (inline auth state machine)

**Files:**
- Create: `src/components/apply/steps/AccountPanel.tsx`
- Test: `src/components/apply/steps/AccountPanel.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/apply/steps/AccountPanel.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("./accountPanelClient", () => ({
  signup: vi.fn(),
  confirm: vi.fn(),
  signin: vi.fn(),
  resend: vi.fn(),
}));

import { AccountPanel } from "./AccountPanel";
import * as client from "./accountPanelClient";

const signup = vi.mocked(client.signup);
const confirm = vi.mocked(client.confirm);
const signin = vi.mocked(client.signin);

afterEach(cleanup);
beforeEach(() => {
  signup.mockReset();
  confirm.mockReset();
  signin.mockReset();
});

describe("AccountPanel", () => {
  it("walks signup → code → authed", async () => {
    const user = userEvent.setup();
    signup.mockResolvedValue({ ok: true, status: "code_sent" });
    confirm.mockResolvedValue({ ok: true });
    const onAuthed = vi.fn();
    render(<AccountPanel initialEmail="a@b.com" onAuthed={onAuthed} />);

    await user.type(screen.getByLabelText("Create a password"), "Passw0rd!");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    const codeInput = await screen.findByLabelText("Verification code");
    await user.type(codeInput, "123456");
    await user.click(screen.getByRole("button", { name: /verify/i }));

    expect(confirm).toHaveBeenCalledWith({ email: "a@b.com", password: "Passw0rd!", code: "123456" });
    expect(onAuthed).toHaveBeenCalledTimes(1);
  });

  it("locks the email field in signup mode", () => {
    render(<AccountPanel initialEmail="a@b.com" onAuthed={vi.fn()} />);
    expect(screen.getByLabelText("Email")).toHaveAttribute("readonly");
  });

  it("switches to sign in when the account already exists", async () => {
    const user = userEvent.setup();
    signup.mockResolvedValue({ ok: true, status: "exists" });
    render(<AccountPanel initialEmail="a@b.com" onAuthed={vi.fn()} />);

    await user.type(screen.getByLabelText("Create a password"), "whatever1");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByRole("button", { name: /sign in & continue/i })).toBeInTheDocument();
    expect(screen.getByText(/already have an account/i)).toBeInTheDocument();
  });

  it("routes an unconfirmed sign-in to code entry", async () => {
    const user = userEvent.setup();
    signin.mockResolvedValue({ ok: true, status: "unconfirmed" });
    render(<AccountPanel initialEmail="a@b.com" onAuthed={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /^sign in$/i }));
    await user.type(screen.getByLabelText("Password"), "Passw0rd!");
    await user.click(screen.getByRole("button", { name: /sign in & continue/i }));

    expect(await screen.findByLabelText("Verification code")).toBeInTheDocument();
  });

  it("shows the invalid-credentials message on a failed sign-in", async () => {
    const user = userEvent.setup();
    signin.mockResolvedValue({ ok: false, error: "invalid_credentials" });
    render(<AccountPanel initialEmail="a@b.com" onAuthed={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /^sign in$/i }));
    await user.type(screen.getByLabelText("Password"), "wrongpass");
    await user.click(screen.getByRole("button", { name: /sign in & continue/i }));

    expect(await screen.findByText(/email or password is incorrect/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/apply/steps/AccountPanel.test.tsx`
Expected: FAIL — `Failed to resolve import "./AccountPanel"`.

- [ ] **Step 3: Write the implementation**

Create `src/components/apply/steps/AccountPanel.tsx`:

```tsx
"use client";

import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { signup, confirm, signin, resend } from "./accountPanelClient";

type Mode = "signup" | "code" | "signin";

const INPUT =
  "h-12 w-full rounded-lg border-[1.5px] border-line bg-white px-4 text-[16px] text-ink outline-none focus:border-green-600";
const PRIMARY =
  "flex h-[58px] w-full items-center justify-center gap-2 rounded-lg bg-green-600 text-[17px] font-bold text-white transition-colors hover:bg-green-700 disabled:opacity-60";
const LINK = "font-semibold text-green-700 underline";

/**
 * Inline branded sign-up / sign-in for the apply-finish screen. Email is
 * pre-filled from the funnel and locked in signup/code mode so the LOS hand-off
 * ownership match (signed-in email === lead email) always holds. On confirm /
 * sign-in success it calls onAuthed() — the parent then refreshes useAuth and
 * the hand-off effect fires.
 */
export function AccountPanel({
  initialEmail,
  initialFirstName,
  initialLastName,
  onAuthed,
}: {
  initialEmail: string;
  initialFirstName?: string;
  initialLastName?: string;
  onAuthed: () => void;
}) {
  const [mode, setMode] = useState<Mode>("signup");
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const emailLocked = mode !== "signin" && Boolean(initialEmail);

  function reset() {
    setError(null);
    setNotice(null);
  }

  async function onSignupSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    reset();
    const res = await signup({ email, password, firstName: initialFirstName, lastName: initialLastName });
    setPending(false);
    if (res.ok && res.status === "code_sent") {
      setMode("code");
      setNotice("We emailed you a 6-digit code.");
      return;
    }
    if (res.ok && res.status === "exists") {
      setMode("signin");
      setNotice("You already have an account — please sign in.");
      return;
    }
    if (!res.ok) setError(res.error === "network" ? "Network error — please try again." : res.error);
  }

  async function onConfirmSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    reset();
    const res = await confirm({ email, password, code });
    setPending(false);
    if (res.ok) {
      onAuthed();
      return;
    }
    setError(
      res.error === "code_mismatch"
        ? "That code didn't match. Check it and try again."
        : res.error === "expired"
          ? "That code expired. Tap “Resend code”."
          : res.error === "network"
            ? "Network error — please try again."
            : res.error,
    );
  }

  async function onSigninSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    reset();
    const res = await signin({ email, password });
    setPending(false);
    if (res.ok && res.status === "unconfirmed") {
      setMode("code");
      setNotice("Your email isn't verified yet — we sent a new code.");
      return;
    }
    if (res.ok) {
      onAuthed();
      return;
    }
    setError(
      res.error === "invalid_credentials"
        ? "Email or password is incorrect."
        : res.error === "network"
          ? "Network error — please try again."
          : res.error,
    );
  }

  async function onResend() {
    setPending(true);
    reset();
    const res = await resend({ email });
    setPending(false);
    setNotice(res.ok ? "A new code is on its way." : "Couldn't resend just now — try again.");
  }

  return (
    <div className="space-y-3">
      {mode === "signup" && (
        <form onSubmit={onSignupSubmit} className="space-y-3" aria-label="Create your account">
          <label className="block">
            <span className="mb-1 block text-[13px] font-semibold text-ink">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              readOnly={emailLocked}
              required
              autoComplete="email"
              className={`${INPUT} ${emailLocked ? "bg-paper-2 text-muted" : ""}`}
            />
          </label>
          {emailLocked && <p className="text-[13px] text-muted">We&apos;ll use the email from your application.</p>}
          <label className="block">
            <span className="mb-1 block text-[13px] font-semibold text-ink">Create a password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              className={INPUT}
            />
          </label>
          <button type="submit" disabled={pending} className={PRIMARY}>
            {pending && <Loader2 className="size-5 animate-spin" aria-hidden="true" />}
            Create account &amp; continue
          </button>
          <p className="text-center text-[14px] text-muted">
            Already have an account?{" "}
            <button
              type="button"
              className={LINK}
              onClick={() => {
                setMode("signin");
                reset();
              }}
            >
              Sign in
            </button>
          </p>
        </form>
      )}

      {mode === "code" && (
        <form onSubmit={onConfirmSubmit} className="space-y-3" aria-label="Enter your verification code">
          <label className="block">
            <span className="mb-1 block text-[13px] font-semibold text-ink">Verification code</span>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              className={INPUT}
            />
          </label>
          <button type="submit" disabled={pending} className={PRIMARY}>
            {pending && <Loader2 className="size-5 animate-spin" aria-hidden="true" />}
            Verify &amp; continue
          </button>
          <p className="text-center text-[14px] text-muted">
            Didn&apos;t get it?{" "}
            <button type="button" className={LINK} onClick={onResend} disabled={pending}>
              Resend code
            </button>
          </p>
        </form>
      )}

      {mode === "signin" && (
        <form onSubmit={onSigninSubmit} className="space-y-3" aria-label="Sign in">
          <label className="block">
            <span className="mb-1 block text-[13px] font-semibold text-ink">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className={INPUT}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[13px] font-semibold text-ink">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className={INPUT}
            />
          </label>
          <button type="submit" disabled={pending} className={PRIMARY}>
            {pending && <Loader2 className="size-5 animate-spin" aria-hidden="true" />}
            Sign in &amp; continue
          </button>
          <div className="flex items-center justify-between text-[14px]">
            <button
              type="button"
              className={LINK}
              onClick={() => {
                setMode("signup");
                reset();
              }}
            >
              Create an account
            </button>
            {/* Forgot-password is a v2 fast-follow (ForgotPassword + ConfirmForgotPassword). */}
            <span className="text-muted/70" aria-disabled="true" title="Coming soon">
              Forgot password?
            </span>
          </div>
        </form>
      )}

      {notice && (
        <p className="text-[14px] text-green-800" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="text-[14px] text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/apply/steps/AccountPanel.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/apply/steps/AccountPanel.tsx src/components/apply/steps/AccountPanel.test.tsx
git commit -m "feat(apply): inline branded AccountPanel (signup/code/signin)"
```

---

## Task 11: `OfficerContactCard.tsx`

**Files:**
- Create: `src/components/apply/steps/OfficerContactCard.tsx`
- Test: `src/components/apply/steps/OfficerContactCard.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/apply/steps/OfficerContactCard.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { OfficerContactCard } from "./OfficerContactCard";

afterEach(cleanup);

describe("OfficerContactCard", () => {
  it("renders tel/sms/mailto links from the officer's real contact info", () => {
    render(
      <OfficerContactCard
        officer={{
          name: "Zachary Zink",
          nmls: "451924",
          photo: "/officers/zachary-zink.webp",
          email: "zachary.zink@msfg.us",
          phone: "(720) 838-1246",
        }}
      />,
    );
    expect(screen.getByRole("link", { name: /call/i })).toHaveAttribute("href", "tel:+17208381246");
    expect(screen.getByRole("link", { name: /text/i })).toHaveAttribute("href", "sms:+17208381246");
    expect(screen.getByRole("link", { name: /email/i })).toHaveAttribute("href", "mailto:zachary.zink@msfg.us");
    expect(screen.getByText("NMLS #451924")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/apply/steps/OfficerContactCard.test.tsx`
Expected: FAIL — `Failed to resolve import "./OfficerContactCard"`.

- [ ] **Step 3: Write the implementation**

Create `src/components/apply/steps/OfficerContactCard.tsx`:

```tsx
"use client";

import { Phone, MessageSquare, Mail } from "lucide-react";
import { telDigits } from "@/content/officers";

const ACTION =
  "flex flex-1 flex-col items-center gap-1 rounded-lg border-[1.5px] border-line bg-white py-3 text-[13px] font-semibold text-ink transition-colors hover:bg-paper-2";

/** Inline "reach your chosen loan officer" card: photo + name + NMLS, with
 *  direct Call / Text / Email actions using the officer's real phone/email. */
export function OfficerContactCard({
  officer,
}: {
  officer: { name: string; nmls: string; photo: string; email: string; phone: string };
}) {
  const tel = telDigits(officer.phone);
  return (
    <div className="rounded-lg border-[1.5px] border-line bg-paper-2 p-4">
      <div className="mb-3 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={officer.photo} alt="" className="size-12 rounded-full object-cover" />
        <div>
          <p className="text-[15px] font-bold text-ink">{officer.name}</p>
          <p className="text-[13px] text-muted">NMLS #{officer.nmls}</p>
        </div>
      </div>
      <div className="flex gap-2.5">
        <a href={`tel:${tel}`} className={ACTION}>
          <Phone className="size-5 text-green-600" aria-hidden="true" />
          Call
        </a>
        <a href={`sms:${tel}`} className={ACTION}>
          <MessageSquare className="size-5 text-green-600" aria-hidden="true" />
          Text
        </a>
        <a href={`mailto:${officer.email}`} className={ACTION}>
          <Mail className="size-5 text-green-600" aria-hidden="true" />
          Email
        </a>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/apply/steps/OfficerContactCard.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/components/apply/steps/OfficerContactCard.tsx src/components/apply/steps/OfficerContactCard.test.tsx
git commit -m "feat(apply): inline officer Call/Text/Email contact card"
```

---

## Task 12: Officer data plumbing (`email` + `phone`)

**Files:**
- Modify: `src/components/apply/steps/OfficerStep.tsx` (widen `ApplyOfficer`)
- Modify: `src/app/apply/[intent]/page.tsx` (map `email`/`phone`)

These two change together (adding required fields to `ApplyOfficer` forces the only constructor, `page.tsx`, to populate them), so they ship as one task to keep the build green.

- [ ] **Step 1: Widen the `ApplyOfficer` type**

In `src/components/apply/steps/OfficerStep.tsx`, change:

```ts
export type ApplyOfficer = {
  slug: string;
  name: string;
  title: string;
  nmls: string;
  states: string[];
  photo: string;
};
```
to:
```ts
export type ApplyOfficer = {
  slug: string;
  name: string;
  title: string;
  nmls: string;
  states: string[];
  photo: string;
  /** Work email — drives the finish-screen officer contact card (mailto:). */
  email: string;
  /** Display phone — drives the finish-screen Call/Text actions (tel:/sms:). */
  phone: string;
};
```

- [ ] **Step 2: Populate `email`/`phone` in the apply page**

In `src/app/apply/[intent]/page.tsx`, change the officers map:

```ts
  const officers: ApplyOfficer[] = (await listOfficers()).map((o) => ({
    slug: o.slug,
    name: o.name,
    title: o.title,
    nmls: o.nmls,
    states: o.states,
    photo: o.photo,
  }));
```
to:
```ts
  const officers: ApplyOfficer[] = (await listOfficers()).map((o) => ({
    slug: o.slug,
    name: o.name,
    title: o.title,
    nmls: o.nmls,
    states: o.states,
    photo: o.photo,
    email: o.email,
    phone: o.phone,
  }));
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

> **Contingency:** if tsc reports that `o.email`/`o.phone` don't exist on the `listOfficers()` return type, open `src/server/officers/officers.ts` and ensure the returned roster shape includes `email` and `phone` (the bundled `OFFICERS` fallback in `@/content/officers` already has both; the DB projection/mapping may need those columns added). Re-run tsc until clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/apply/steps/OfficerStep.tsx src/app/apply/[intent]/page.tsx
git commit -m "feat(apply): carry officer email/phone through the apply roster"
```

---

## Task 13: Integrate into `FinishStep.tsx`

**Files:**
- Modify: `src/components/apply/steps/FinishStep.tsx` (full replace)

- [ ] **Step 1: Replace the file**

Overwrite `src/components/apply/steps/FinishStep.tsx` with:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, CalendarDays, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth/useAuth";
import { APP_URL } from "@/lib/auth/appLink";
import { AccountPanel } from "./AccountPanel";
import { OfficerContactCard } from "./OfficerContactCard";
import type { Intent } from "@/content/flows";
import type { LeadContact } from "@/lib/leads";

/**
 * Two-door finish. Door 1 — continue the application: a signed-in borrower
 * triggers the LOS hand-off and deep-links into the app; a new / anonymous
 * borrower gets the inline branded AccountPanel (create account or sign in)
 * right here — no redirect to the AWS Hosted UI. Door 2 — reach the chosen
 * loan officer directly (Call / Text / Email), or book time when none was
 * picked. Account recognition happens here, never mid-funnel.
 */
export function FinishStep({
  contact,
  leadId,
  shortName,
  calendarHref,
  officer,
}: {
  intent: Intent;
  contact: LeadContact | null;
  leadId: string | null;
  shortName: string;
  calendarHref: string;
  /** Officer the user chose in the preceding step, if any (null = no preference). */
  officer?: {
    slug: string;
    name: string;
    nmls: string;
    photo: string;
    email: string;
    phone: string;
  } | null;
}) {
  const auth = useAuth();
  const fired = useRef(false);
  const [handoff, setHandoff] = useState<"idle" | "sending" | "done">("idle");
  const [appId, setAppId] = useState<string | null>(null);

  useEffect(() => {
    if (fired.current || auth.loading || !auth.configured || !auth.authenticated || !contact) return;
    fired.current = true;
    setHandoff("sending");
    const controller = new AbortController();
    fetch("/api/v1/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
      body: JSON.stringify({ leadId: leadId ?? undefined }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.applicationId) setAppId(String(d.applicationId));
      })
      .catch(() => {})
      .finally(() => setHandoff("done"));
    return () => controller.abort();
    // Fire exactly once when auth resolves to authenticated — including after
    // an inline sign-in via AccountPanel → auth.refresh(). Body is just
    // { leadId }; the server rebuilds the application from the persisted lead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.loading, auth.configured, auth.authenticated, contact]);

  // Show the inline branded auth panel only when auth is wired AND the user is
  // signed out AND we have funnel contact (the panel pre-fills + locks email).
  const showAccountPanel = auth.configured && !auth.authenticated && !!contact;

  const continueHref = appId ? `${APP_URL}/applications/${appId}` : APP_URL;
  const continueLabel = `Continue in the ${shortName} app`;

  if (auth.loading) {
    return (
      <div className="flex min-h-[160px] items-center justify-center text-muted" role="status" aria-live="polite">
        <Loader2 className="size-6 animate-spin" aria-hidden="true" />
        <span className="sr-only">Loading…</span>
      </div>
    );
  }

  return (
    <>
      {(officer || (auth.authenticated && auth.user?.email)) && (
        <div className="-mt-1 mb-6 space-y-1 text-[16px] text-muted">
          {officer && (
            <p>
              You&apos;ll be working with <span className="font-semibold text-ink">{officer.name}</span>.
            </p>
          )}
          {auth.authenticated && auth.user?.email && (
            <p>
              Welcome back, <span className="font-semibold text-ink">{auth.user.email}</span> — pick up right where you
              left off.
            </p>
          )}
        </div>
      )}

      {showAccountPanel ? (
        <AccountPanel
          initialEmail={contact?.email ?? ""}
          initialFirstName={contact?.firstName}
          initialLastName={contact?.lastName}
          onAuthed={() => auth.refresh()}
        />
      ) : (
        <a
          href={continueHref}
          className="flex h-[66px] w-full items-center justify-center gap-2.5 rounded-lg bg-green-600 text-[18px] font-bold text-white [box-shadow:0_3px_0_#0a3a2a,var(--shadow-3d)] transition-[transform,background,box-shadow] duration-150 hover:-translate-y-0.5 hover:bg-green-700 hover:[box-shadow:0_5px_0_#0a3a2a,var(--shadow-pop)] active:translate-y-px"
        >
          {continueLabel}
          <ArrowRight className="size-5" strokeWidth={2.2} aria-hidden="true" />
        </a>
      )}

      <div className="my-[18px] flex items-center gap-3.5 text-[13px] text-muted before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">
        or
      </div>

      {officer ? (
        <OfficerContactCard officer={officer} />
      ) : (
        <a
          href={calendarHref || "/loan-officers"}
          className="flex h-16 w-full items-center justify-center gap-2.5 rounded-lg border-[1.5px] border-line bg-white text-[16px] font-bold text-ink shadow-3d transition-colors duration-150 hover:bg-paper-2"
        >
          <CalendarDays className="size-5 text-green-600" strokeWidth={2} aria-hidden="true" />
          Talk to a loan officer
        </a>
      )}

      <div className="mt-4 min-h-[18px] text-[13px] text-muted" aria-live="polite">
        {handoff === "sending" && "Saving your application…"}
      </div>
    </>
  );
}
```

> Note: `intent` stays in the prop type (the `Wizard` passes it) but is no longer destructured/used — the old sign-in redirect that consumed it is replaced by `AccountPanel`. Keeping it in the type avoids touching the `Wizard` call site; not destructuring it avoids an unused-variable error.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (Confirms `Wizard`’s `officer={chosenOfficer}` still satisfies the widened prop — `chosenOfficer` is an `ApplyOfficer`, which now has `email`/`phone`; and `contact.email/firstName/lastName` exist on `LeadContact`.)

- [ ] **Step 3: Run the full test suite**

Run: `npx vitest run`
Expected: all tests PASS (route, schema, IDP, client, AccountPanel, OfficerContactCard, plus existing).

- [ ] **Step 4: Commit**

```bash
git add src/components/apply/steps/FinishStep.tsx
git commit -m "feat(apply): inline branded auth + officer contact on the finish step"
```

---

## Task 14: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `npx vitest run`
Expected: all tests pass, including the new IDP/route/schema/client/component tests.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Lint (if configured)**

Run: `npm run lint`
Expected: no new errors. (If `lint` isn’t a script, skip.)

- [ ] **Step 4: Production build (SSG determinism guard)**

Run: `npm run build`
Expected: build succeeds; `/apply/[intent]` still pre-renders. (No `Date.now()`/`new Date()` was added at module/render scope.)

- [ ] **Step 5: Manual preview smoke (preview tools)**

Start the dev server (`preview_start`), open `/apply/buy`, complete the funnel to the finish step **signed out**, and confirm:
- the inline `AccountPanel` renders (no redirect to the AWS Hosted UI), email pre-filled and locked;
- "Already have an account? Sign in" toggles to the sign-in form;
- when an officer was chosen, the Call/Text/Email card shows their real number/email (`tel:`/`sms:`/`mailto:` hrefs).

Use `preview_console_logs` / `preview_network` to confirm `POST /api/v1/auth/*` calls fire and no client errors appear. (Live Cognito calls require the ops prerequisites above; against a dev pool without `USER_PASSWORD_AUTH` the routes return mapped errors — the UI wiring is still verifiable.)

- [ ] **Step 6: Final state**

No commit needed (verification only). The branch is ready for `superpowers:requesting-code-review` / a PR.

---

## Spec coverage check

| Spec requirement | Task(s) |
| --- | --- |
| `cognitoIdp.ts` fetch-based IDP client (SignUp/ConfirmSignUp/InitiateAuth/ResendConfirmationCode, SecretHash, typed results, no SDK) | 1 |
| `POST /signup` (code_sent / exists / invalid-password) | 3 |
| `POST /confirm` (confirm + sign in, set session; code_mismatch / expired) | 4 |
| `POST /signin` (session; unconfirmed→resend; uniform 401) | 5 |
| `POST /resend` | 6 |
| 503 when `!authConfigured()`; zod validation; per-IP rate-limit on signin+signup | 3, 5, 6 (503+zod all routes; rate-limit signin/signup) |
| Tokens in httpOnly cookie, never to browser; id_token verified before session | 4, 5 (`verifyIdToken` → `setSessionCookies`) |
| `AccountPanel` inline state machine; email pre-filled + locked; resend; disabled forgot-password | 10 |
| `FinishStep` renders AccountPanel (unauth) / continue (auth); `onAuthed`→refresh→hand-off | 7, 13 |
| Officer CTA → inline Call/Text/Email card | 11, 13 |
| Officer data plumbing (`email`/`phone` on `ApplyOfficer`, page map, FinishStep prop) | 12, 13 |
| Route tests (signup→code_sent/exists; confirm→session; signin→session/unconfirmed; bad/expired code; invalid creds) | 3–6 |
| `AccountPanel` component test (signup→code→authed; exists→signin; signin→unconfirmed→code) | 10 |
| Cognito ops prerequisites (USER_PASSWORD_AUTH + self-service signup) | documented (non-code) |
| Fast-follow: branded forgot-password | out of scope (inert link present, Task 10) |
