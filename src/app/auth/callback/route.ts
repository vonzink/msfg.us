/**
 * GET /auth/callback — Cognito OIDC redirect handler (SECURITY-CRITICAL).
 *
 * Steps (any failure → clear cookies + redirect to "/?auth=error", never trust
 * partial state):
 *   1. Read the short-lived PKCE handshake cookie (codeVerifier/state/nonce/
 *      returnTo). Missing → reject.
 *   2. Surface any provider error param (?error=...) → reject.
 *   3. Verify the returned `state` EXACTLY equals the stored state (CSRF).
 *   4. Exchange `code` + `code_verifier` at /oauth2/token.
 *   5. Verify the id_token (signature/iss/aud/exp/token_use + `nonce` match).
 *   6. Set httpOnly session cookies, clear the PKCE cookie, 302 to `returnTo`.
 *
 * Node runtime.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authConfigured, exchangeCode, verifyIdToken } from "@/lib/auth/cognito";
import {
  readPkceCookie,
  setSessionCookies,
  clearPkceCookie,
  clearSessionCookies,
} from "@/lib/auth/session";
import { safeReturnTo } from "@/lib/auth/returnTo";
import { SITE } from "@/content/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Build an absolute URL on this site for a safe relative path. */
function siteUrl(path: string): string {
  return new URL(path, SITE.url).toString();
}

async function fail(reason: string): Promise<NextResponse> {
  console.warn(`[auth/callback] rejected: ${reason}`);
  await clearSessionCookies();
  return NextResponse.redirect(siteUrl("/?auth=error"));
}

export async function GET(req: NextRequest) {
  if (!authConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Authentication is not configured." },
      { status: 503 },
    );
  }

  const params = req.nextUrl.searchParams;

  // (2) Provider-side error (user denied, misconfig, etc.).
  const providerError = params.get("error");
  if (providerError) {
    return fail(`provider error: ${providerError}`);
  }

  // (1) Handshake cookie.
  const handshake = await readPkceCookie();
  if (!handshake) {
    return fail("missing or invalid PKCE handshake cookie");
  }

  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) {
    return fail("missing code or state");
  }

  // (3) CSRF: returned state must match the stored state exactly.
  if (state !== handshake.state) {
    return fail("state mismatch (possible CSRF)");
  }

  // (4) Code → tokens (PKCE verifier proves possession).
  let tokens;
  try {
    tokens = await exchangeCode(code, handshake.codeVerifier);
  } catch (err) {
    return fail(`token exchange failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!tokens.id_token) {
    return fail("token response missing id_token");
  }

  // (5) Verify the id_token, including the nonce minted for THIS sign-in.
  try {
    await verifyIdToken(tokens.id_token, handshake.nonce);
  } catch (err) {
    return fail(`id_token verification failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // (6) Establish the session, drop the handshake cookie, return the user.
  await setSessionCookies({
    id_token: tokens.id_token,
    refresh_token: tokens.refresh_token,
  });
  await clearPkceCookie();

  const dest = safeReturnTo(handshake.returnTo, "/");
  return NextResponse.redirect(siteUrl(dest));
}
