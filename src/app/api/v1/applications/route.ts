/**
 * POST /api/v1/applications — apply-wizard completion hand-off (auth-gated).
 *
 * Called by the wizard AFTER the lead is captured, only when the user is
 * signed in. Reads the session server-side (the id_token lives in an httpOnly
 * cookie — it is NEVER sent by the client), then best-effort forwards the
 * application to the LOS (app.msfgco.com) with that id_token as a Bearer.
 *
 * Contract:
 *  - 401 if not authenticated (no session) — the client only calls this when
 *    `/api/v1/auth/me` says authenticated, so this is a guard, not a UX path.
 *  - When LOS is unconfigured the hand-off is skipped and we still return 200
 *    `{ ok: true, handoff: "skipped" }` so the wizard's "continue in app" CTA
 *    still appears (the shared Cognito session makes app.msfgco.com SSO work
 *    regardless of whether this site forwarded the application).
 *  - Never leaks tokens; never throws to the client.
 *
 * Node runtime; never cached.
 */
import { NextResponse } from "next/server";
import { authConfigured } from "@/lib/auth/cognito";
import { getSession, getIdToken } from "@/lib/auth/session";
import { createLoanApplication } from "@/server/integrations/los/losClient";
import { applicationHandoffSchema } from "@/validation/lead";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!authConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Authentication is not configured." },
      { status: 503 },
    );
  }

  const user = await getSession();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = applicationHandoffSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const idToken = await getIdToken();
  if (!idToken) {
    // Session said authenticated but the token vanished mid-request — treat as
    // unauthenticated rather than calling the LOS without a Bearer.
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  const input = parsed.data;
  const result = await createLoanApplication(idToken, {
    intent: input.intent,
    cognitoSub: user.sub,
    contact: input.contact,
    answers: input.answers,
    location: input.location,
    leadId: input.leadId,
    idempotencyKey: input.idempotencyKey,
    source: input.source ?? "apply-wizard",
  });

  // The hand-off is best-effort. We always report 200 with the outcome so the
  // wizard can show the "continue in the MSFG app" CTA; failures are logged
  // server-side and do not block the user.
  const handoff = result.skipped ? "skipped" : result.ok ? "ok" : "failed";
  return NextResponse.json(
    { ok: true, handoff, applicationId: result.applicationId ?? null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
