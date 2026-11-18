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
