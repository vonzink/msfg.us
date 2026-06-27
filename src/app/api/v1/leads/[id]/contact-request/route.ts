import { NextResponse } from "next/server";
import { contactRequestSchema } from "@/validation/lead";
import {
  recordContactRequest,
  syncContactRequestTag,
  getLeadById,
} from "@/server/leads/leadService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/leads/{id}/contact-request — off-ramp "ask my officer to reach
 * out" handler. Tenant-scoped via leadService. Postgres is the system-of-record;
 * the GHL tag is best-effort and never blocks the response.
 *
 *   400 — bad JSON / schema failure
 *   404 — missing or cross-tenant lead
 *   422 — TCPA gate: call|text + a recaptured (non-empty) phone + !consentTcpa
 *   200 — { ok: true }
 *
 * No PII in logs: at most leadId + channel + ok/fail.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = contactRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  }
  const { channel, phone, consentTcpa } = parsed.data;

  // TCPA hard gate (server-side enforcement). A recaptured (non-empty) phone on
  // a call/text request requires affirmative consent. Email is exempt. Reject
  // BEFORE any write or CRM tag.
  const hasRecapturedPhone = typeof phone === "string" && phone.trim() !== "";
  if ((channel === "call" || channel === "text") && hasRecapturedPhone && consentTcpa !== true) {
    return NextResponse.json({ ok: false, error: "consent_required" }, { status: 422 });
  }

  try {
    const result = await recordContactRequest(id, { channel, phone, consentTcpa });
    if (!result.ok) {
      const status = result.reason === "not_found" ? 404 : 422;
      return NextResponse.json({ ok: false, error: result.reason }, { status });
    }

    // Fire the GHL tag only when this channel is newly requested (idempotent —
    // a same-channel double-click does not duplicate the tag). Best-effort:
    // re-read the lead and sync; swallow everything so the client never waits.
    if (result.channelWasNew) {
      try {
        const lead = await getLeadById(id);
        if (lead) await syncContactRequestTag(lead, channel);
      } catch {
        // syncContactRequestTag already swallows; this guards the re-read.
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`[/api/v1/leads/${id}/contact-request] failed for channel=${channel}`);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
