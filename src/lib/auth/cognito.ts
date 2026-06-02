/**
 * AWS Cognito Hosted UI / OIDC helpers (SERVER-ONLY).
 *
 * Implements the Authorization-Code + PKCE (S256) flow against the user pool
 * shared with app.msfgco.com, plus strict id_token verification via the pool's
 * JWKS. Every secret is read through `@/lib/env` (lazy, zod-validated) so this
 * module never throws at import time; call sites guard with `authConfigured()`.
 *
 * Security posture:
 *  - PKCE S256 + a random `state` (CSRF) + a random `nonce` (replay) are
 *    generated per sign-in and round-tripped through short-lived httpOnly
 *    cookies (see `@/lib/auth/session`).
 *  - The id_token (NOT the access token — Cognito access tokens omit `email`)
 *    is verified for signature (JWKS/RS256), `iss`, `aud` (= client id), `exp`,
 *    `token_use === "id"`, and `nonce`. Any failure rejects the sign-in.
 *  - A confidential client sends `client_secret_basic` (HTTP Basic) on the
 *    token endpoint; a public client uses PKCE only.
 *
 * Endpoints (Hosted UI domain): `/oauth2/authorize`, `/oauth2/token`, `/logout`.
 * Verified against AWS Cognito developer-guide docs (token/authorize/logout/
 * PKCE/verify-JWT pages) — see the Phase 4 report.
 *
 * Node runtime only (uses `node:crypto` and is consumed by Node route handlers).
 */
import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { getCognitoConfig } from "@/lib/env";

export { authConfigured } from "@/lib/env";

/** Token-endpoint response (subset we consume). */
export interface CognitoTokens {
  id_token: string;
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
}

/** Verified id_token claims we care about. */
export interface IdTokenClaims extends JWTPayload {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  "cognito:username"?: string;
  token_use?: string;
}

/** PKCE + CSRF material generated at the start of a sign-in. */
export interface PkceMaterial {
  codeVerifier: string;
  codeChallenge: string;
  state: string;
  nonce: string;
}

/** base64url-encode a Buffer without padding (RFC 7636 / OIDC). */
function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Cryptographically-random URL-safe token of `bytes` entropy. */
function randomToken(bytes = 32): string {
  return base64url(randomBytes(bytes));
}

/**
 * Generate PKCE (S256) + a random `state` + `nonce`. The verifier is 32 bytes
 * of entropy (well within RFC 7636's 43–128 char range once base64url-encoded);
 * the challenge is base64url(SHA256(verifier)).
 */
export function createPkceMaterial(): PkceMaterial {
  const codeVerifier = randomToken(32);
  const codeChallenge = base64url(createHash("sha256").update(codeVerifier).digest());
  return {
    codeVerifier,
    codeChallenge,
    state: randomToken(32),
    nonce: randomToken(32),
  };
}

/**
 * Build the Hosted UI `/oauth2/authorize` URL for an Authorization-Code+PKCE
 * sign-in. The caller must persist `codeVerifier`/`state`/`nonce` (httpOnly
 * cookies) before redirecting, and verify `state`/`nonce` on callback.
 */
export function buildAuthorizeUrl(pkce: Pick<PkceMaterial, "codeChallenge" | "state" | "nonce">): string {
  const cfg = getCognitoConfig();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: cfg.clientId!,
    redirect_uri: cfg.redirectUri,
    scope: cfg.scopes,
    state: pkce.state,
    nonce: pkce.nonce,
    code_challenge_method: "S256",
    code_challenge: pkce.codeChallenge,
  });
  return `${cfg.hostedUiDomain}/oauth2/authorize?${params.toString()}`;
}

/** Hard timeout for token-endpoint calls (ms). */
const TOKEN_TIMEOUT_MS = 8_000;

/** Typed error for token-endpoint / OIDC failures. */
export class CognitoAuthError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly body?: string,
  ) {
    super(message);
    this.name = "CognitoAuthError";
  }
}

/**
 * Build the Authorization header + body for a token-endpoint request. A
 * confidential client (COGNITO_CLIENT_SECRET set) authenticates with
 * `client_secret_basic` (HTTP Basic); a public client omits the secret and
 * relies on PKCE. `client_id` is always included in the body (Cognito accepts
 * it in both auth modes).
 */
function tokenRequestInit(form: URLSearchParams): { headers: Record<string, string>; body: string } {
  const cfg = getCognitoConfig();
  form.set("client_id", cfg.clientId!);
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };
  if (cfg.clientSecret) {
    const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64");
    headers.Authorization = `Basic ${basic}`;
  }
  return { headers, body: form.toString() };
}

/** POST to the Hosted UI `/oauth2/token` endpoint with a hard timeout. */
async function postToken(form: URLSearchParams): Promise<CognitoTokens> {
  const cfg = getCognitoConfig();
  const { headers, body } = tokenRequestInit(form);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TOKEN_TIMEOUT_MS);
  try {
    const res = await fetch(`${cfg.hostedUiDomain}/oauth2/token`, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new CognitoAuthError(
        `Cognito /oauth2/token responded ${res.status}`,
        res.status,
        text.slice(0, 500),
      );
    }
    return (await res.json()) as CognitoTokens;
  } catch (err) {
    if (err instanceof CognitoAuthError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new CognitoAuthError(`Cognito /oauth2/token timed out after ${TOKEN_TIMEOUT_MS}ms`);
    }
    throw new CognitoAuthError(
      `Cognito /oauth2/token request failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Exchange an authorization `code` (+ PKCE `code_verifier`) for tokens. The
 * `redirect_uri` MUST match the one used in the authorize request.
 */
export function exchangeCode(code: string, codeVerifier: string): Promise<CognitoTokens> {
  const cfg = getCognitoConfig();
  const form = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    code_verifier: codeVerifier,
    redirect_uri: cfg.redirectUri,
  });
  return postToken(form);
}

/**
 * Exchange a `refresh_token` for fresh id/access tokens. Cognito does not
 * return a new refresh_token unless rotation is enabled, so callers should
 * fall back to the existing one when `refresh_token` is absent.
 */
export function refreshTokens(refreshToken: string): Promise<CognitoTokens> {
  const form = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  return postToken(form);
}

/**
 * Lazily-created, cached remote JWKS resolver. `createRemoteJWKSet` fetches the
 * pool's keys on demand, caches them by `kid`, and refreshes (rate-limited) when
 * an unknown `kid` appears (key rotation). One resolver per issuer is reused
 * across requests.
 */
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let jwksUri: string | null = null;

function getJwks(): ReturnType<typeof createRemoteJWKSet> {
  const cfg = getCognitoConfig();
  if (!jwks || jwksUri !== cfg.jwksUri) {
    jwks = createRemoteJWKSet(new URL(cfg.jwksUri));
    jwksUri = cfg.jwksUri;
  }
  return jwks;
}

/**
 * Verify a Cognito id_token: RS256 signature against the pool JWKS, `iss`
 * (issuer), `aud` (= our client id), and `exp` (with a small clock skew
 * tolerance). Additionally enforces `token_use === "id"` and — when an expected
 * nonce is supplied — that the token's `nonce` matches (replay protection).
 * Throws `CognitoAuthError` on any failure; never returns an unverified token.
 *
 * @param idToken raw JWT string from the token endpoint.
 * @param expectedNonce the nonce minted for this sign-in (callback path); omit
 *        when re-verifying an already-issued session token (no nonce to check).
 */
export async function verifyIdToken(
  idToken: string,
  expectedNonce?: string,
): Promise<IdTokenClaims> {
  const cfg = getCognitoConfig();
  let payload: JWTPayload;
  try {
    const result = await jwtVerify(idToken, getJwks(), {
      issuer: cfg.issuer,
      audience: cfg.clientId,
      // Cognito signs only RS256; pinning the alg blocks "alg":"none" / HS256
      // confusion attacks.
      algorithms: ["RS256"],
      clockTolerance: 5,
    });
    payload = result.payload;
  } catch (err) {
    throw new CognitoAuthError(
      `id_token verification failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (payload.token_use !== "id") {
    throw new CognitoAuthError(`id_token has unexpected token_use: ${String(payload.token_use)}`);
  }
  if (expectedNonce !== undefined && payload.nonce !== expectedNonce) {
    throw new CognitoAuthError("id_token nonce mismatch");
  }
  if (typeof payload.sub !== "string" || !payload.sub) {
    throw new CognitoAuthError("id_token missing sub");
  }

  return payload as IdTokenClaims;
}

/**
 * Build the Hosted UI `/logout` URL. Cognito clears its own session cookie and
 * then redirects to `logout_uri` (which must be a registered Allowed sign-out
 * URL on the app client). The caller is responsible for clearing the local
 * session cookies before redirecting here.
 */
export function buildLogoutUrl(): string {
  const cfg = getCognitoConfig();
  const params = new URLSearchParams({
    client_id: cfg.clientId!,
    logout_uri: cfg.logoutRedirectUri,
  });
  return `${cfg.hostedUiDomain}/logout?${params.toString()}`;
}

/** Convenience: derived config for callers that need the redirect URI, etc. */
export { getCognitoConfig };
