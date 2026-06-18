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
