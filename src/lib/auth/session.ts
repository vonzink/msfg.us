/**
 * Server-side session over httpOnly cookies (SERVER-ONLY).
 *
 * The session is the Cognito id_token, kept in an httpOnly + Secure (in prod) +
 * SameSite=Lax cookie. Tokens NEVER touch localStorage or client JS. `/api/v1/
 * auth/me` exposes only the derived `{ sub, email, name }` — never the token.
 *
 * `getSession()` re-verifies the stored id_token on every read (signature +
 * iss/aud + exp), so an expired or tampered cookie yields `null` rather than a
 * trusted identity. We do NOT blindly trust the cookie; the only thing the
 * cookie buys us is avoiding a round-trip to Cognito on each request — the
 * cryptographic checks still run locally against the cached JWKS.
 *
 * Cookies (all prefixed `msfg_`):
 *  - `msfg_id_token`   — the verified id_token (the session). httpOnly.
 *  - `msfg_refresh`    — Cognito refresh_token, for silent renewal. httpOnly.
 *  - `msfg_pkce`       — short-lived JSON {codeVerifier,state,nonce,returnTo}
 *                        set at /auth/login, consumed+cleared at /auth/callback.
 *
 * Node runtime only (consumed by Node route handlers via next/headers cookies).
 */
import { cookies } from "next/headers";
import { verifyIdToken, type IdTokenClaims } from "@/lib/auth/cognito";

/** Cookie names — single source of truth. */
export const COOKIE = {
  idToken: "msfg_id_token",
  refresh: "msfg_refresh",
  pkce: "msfg_pkce",
} as const;

/** Are we serving over HTTPS? Secure cookies require it; relax only in dev. */
function isSecure(): boolean {
  return process.env.NODE_ENV === "production";
}

/** Default lifetime of the session/refresh cookies (30 days, in seconds). */
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;
/** PKCE handshake cookie lifetime — just long enough to complete sign-in. */
const PKCE_MAX_AGE = 60 * 10;

/** Shared hardening applied to every auth cookie. */
function baseCookieOptions() {
  return {
    httpOnly: true,
    secure: isSecure(),
    sameSite: "lax" as const,
    path: "/",
  };
}

/** The authenticated user surface (no tokens). */
export interface SessionUser {
  sub: string;
  email?: string;
  name?: string;
}

/** Map verified id_token claims to the public user shape. */
function toUser(claims: IdTokenClaims): SessionUser {
  return {
    sub: claims.sub,
    email: typeof claims.email === "string" ? claims.email : undefined,
    name:
      typeof claims.name === "string"
        ? claims.name
        : typeof claims["cognito:username"] === "string"
          ? (claims["cognito:username"] as string)
          : undefined,
  };
}

/**
 * Read + verify the current session. Returns `{ sub, email, name }` when a
 * valid, unexpired id_token cookie is present; `null` otherwise. Verification
 * (signature + iss/aud + exp) runs on every call — a stale or forged cookie is
 * rejected. No nonce check here (nonce is a one-time sign-in concern).
 */
export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const idToken = store.get(COOKIE.idToken)?.value;
  if (!idToken) return null;
  try {
    const claims = await verifyIdToken(idToken);
    return toUser(claims);
  } catch {
    // Expired/invalid/tampered → treat as signed-out. (Silent refresh is
    // handled explicitly by callers that hold the refresh cookie.)
    return null;
  }
}

/** Raw id_token for server-to-server calls (e.g. the LOS hand-off). Unverified
 *  convenience read — callers that need identity should use getSession(). */
export async function getIdToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE.idToken)?.value ?? null;
}

/** Raw refresh_token, if present (for silent renewal). */
export async function getRefreshToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE.refresh)?.value ?? null;
}

/**
 * Persist a session from a freshly-exchanged token set. The id_token cookie is
 * the session; the refresh_token (when returned) is stored separately for
 * silent renewal. Both are httpOnly + Secure(prod) + SameSite=Lax.
 */
export async function setSessionCookies(tokens: {
  id_token: string;
  refresh_token?: string;
}): Promise<void> {
  const store = await cookies();
  store.set(COOKIE.idToken, tokens.id_token, {
    ...baseCookieOptions(),
    maxAge: SESSION_MAX_AGE,
  });
  if (tokens.refresh_token) {
    store.set(COOKIE.refresh, tokens.refresh_token, {
      ...baseCookieOptions(),
      maxAge: SESSION_MAX_AGE,
    });
  }
}

/** Clear every auth cookie (logout / failed callback cleanup). */
export async function clearSessionCookies(): Promise<void> {
  const store = await cookies();
  for (const name of [COOKIE.idToken, COOKIE.refresh, COOKIE.pkce]) {
    // Overwrite with an expired empty cookie (same path) to delete reliably.
    store.set(name, "", { ...baseCookieOptions(), maxAge: 0 });
  }
}

/** The PKCE/state/nonce handshake payload stored between login and callback. */
export interface PkceCookiePayload {
  codeVerifier: string;
  state: string;
  nonce: string;
  /** Same-origin relative path to return to after sign-in (open-redirect safe). */
  returnTo: string;
}

/** Store the PKCE handshake in a short-lived httpOnly cookie. */
export async function setPkceCookie(payload: PkceCookiePayload): Promise<void> {
  const store = await cookies();
  store.set(COOKIE.pkce, JSON.stringify(payload), {
    ...baseCookieOptions(),
    maxAge: PKCE_MAX_AGE,
  });
}

/** Read + parse the PKCE handshake cookie (null if missing/corrupt). */
export async function readPkceCookie(): Promise<PkceCookiePayload | null> {
  const store = await cookies();
  const raw = store.get(COOKIE.pkce)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PkceCookiePayload>;
    if (
      typeof parsed.codeVerifier === "string" &&
      typeof parsed.state === "string" &&
      typeof parsed.nonce === "string" &&
      typeof parsed.returnTo === "string"
    ) {
      return parsed as PkceCookiePayload;
    }
    return null;
  } catch {
    return null;
  }
}

/** Delete just the PKCE handshake cookie (after a successful callback). */
export async function clearPkceCookie(): Promise<void> {
  const store = await cookies();
  store.set(COOKIE.pkce, "", { ...baseCookieOptions(), maxAge: 0 });
}
