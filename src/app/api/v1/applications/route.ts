import { NextResponse } from "next/server";
import { getLeadById } from "@/server/leads/leadService";
import { OFFICERS } from "@/content/officers";
import { applicationHandoffSchema } from "@/validation/lead";
import { serverEnv } from "@/lib/env";
import { buildHandoffPayload, mintHandoffToken } from "@/server/integrations/los/handoffToken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resolveOfficerName(slug: unknown): { name: string; slug: string } | null {
  if (typeof slug !== "string" || !slug) return null;
  const o = OFFICERS.find((x) => x.slug === slug);
  return o ? { name: o.name, slug: o.slug } : null;
}

/**
 * POST /api/v1/applications — funnel hand-off. Mints a short-TTL signed token carrying a NON-SENSITIVE
 * summary of the lead (no income/credit/SSN). The borrower authenticates + the loan is created later at
 * the app's /continue page. Capability-based on the unguessable leadId; the token contents are non-sensitive.
 * SECURITY follow-up: bind the lead to the browser session + rate-limit (tracked separately).
 */
export async function POST(req: Request) {
  let json: unknown;
  try { json = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = applicationHandoffSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  }
  const lead = await getLeadById(parsed.data.leadId);
  if (!lead) return NextResponse.json({ ok: false, error: "Lead not found" }, { status: 404 });

  const officer = resolveOfficerName(
    (lead.answers as { fields?: Record<string, unknown> })?.fields?.loanOfficer,
  );
  const payload = buildHandoffPayload(lead as never, officer);
  const secret = serverEnv.HANDOFF_TOKEN_SECRET ?? "local-unsigned-dev-secret";
  const handoffToken = await mintHandoffToken(payload, secret);

  return NextResponse.json({ ok: true, handoffToken },
    { headers: { "Cache-Control": "no-store" } });
}
