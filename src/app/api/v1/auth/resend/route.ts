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
