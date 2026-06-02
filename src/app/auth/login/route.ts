/**
 * GET /auth/login — start the Cognito Authorization-Code + PKCE sign-in.
 *
 * Mints PKCE (S256) + a random `state` (CSRF) + `nonce` (replay), stores them
 * (plus a sanitized same-origin `returnTo`) in a short-lived httpOnly cookie,
 * then 302-redirects to the Hosted UI `/oauth2/authorize` endpoint. When auth
 * is not configured, returns a clear 503 instead of redirecting.
 *
 * Node runtime (uses node:crypto via cognito helpers + cookie writes).
 */
import { NextResponse, type NextRequest } from "next/server";
import { authConfigured, createPkceMaterial, buildAuthorizeUrl } from "@/lib/auth/cognito";
import { setPkceCookie } from "@/lib/auth/session";
import { safeReturnTo } from "@/lib/auth/returnTo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!authConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Authentication is not configured." },
      { status: 503 },
    );
  }

  const returnTo = safeReturnTo(req.nextUrl.searchParams.get("returnTo"), "/");
  const pkce = createPkceMaterial();

  await setPkceCookie({
    codeVerifier: pkce.codeVerifier,
    state: pkce.state,
    nonce: pkce.nonce,
    returnTo,
  });

  const authorizeUrl = buildAuthorizeUrl({
    codeChallenge: pkce.codeChallenge,
    state: pkce.state,
    nonce: pkce.nonce,
  });

  return NextResponse.redirect(authorizeUrl);
}
