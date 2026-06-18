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
