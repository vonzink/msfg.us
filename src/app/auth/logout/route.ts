/**
 * GET /auth/logout — clear local session cookies, then redirect through the
 * Cognito `/logout` endpoint so the Hosted UI session is also terminated.
 * Cognito then bounces the user to the registered sign-out URL
 * (AUTH_LOGOUT_REDIRECT_URI, default ${SITE.url}).
 *
 * When auth is not configured we still best-effort clear cookies and send the
 * user home, so the link is harmless in an unconfigured deploy.
 *
 * Node runtime.
 */
import { NextResponse } from "next/server";
import { authConfigured, buildLogoutUrl } from "@/lib/auth/cognito";
import { clearSessionCookies } from "@/lib/auth/session";
import { SITE } from "@/content/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // Always clear local cookies first.
  await clearSessionCookies();

  if (!authConfigured()) {
    return NextResponse.redirect(SITE.url);
  }

  return NextResponse.redirect(buildLogoutUrl());
}
