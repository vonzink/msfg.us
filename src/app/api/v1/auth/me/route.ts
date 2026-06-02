/**
 * GET /api/v1/auth/me — current session probe for client UI.
 *
 * Returns `{ authenticated: boolean, user?: { sub, email, name } }`. NEVER
 * returns tokens. Used by the apply wizard's account step and the nav to show
 * signed-in state. When auth is not configured it simply reports
 * `authenticated: false` (no error), so client code can call it unconditionally.
 *
 * Node runtime; never cached (per-request session read).
 */
import { NextResponse } from "next/server";
import { authConfigured } from "@/lib/auth/cognito";
import { getSession } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!authConfigured()) {
    return NextResponse.json(
      { authenticated: false, configured: false },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const user = await getSession();
  return NextResponse.json(
    user
      ? { authenticated: true, configured: true, user }
      : { authenticated: false, configured: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
