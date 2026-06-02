/**
 * POST /api/v1/leads — public lead intake from the apply wizard.
 *
 * Validates the body against the lead contract, captures it (Postgres = SOR,
 * GHL = best-effort), and returns the lead id. Never surfaces a CRM failure
 * to the caller. Always runs per-request on Node (Prisma needs the Node
 * runtime; force-dynamic prevents any static caching of this handler).
 */
import { NextResponse } from "next/server";
import { leadInputSchema } from "@/validation/lead";
import { captureLead } from "@/server/leads/leadService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = leadInputSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const { leadId, syncStatus } = await captureLead(parsed.data);
    return NextResponse.json({ ok: true, leadId, syncStatus });
  } catch (err) {
    // Capture should not throw, but if Postgres itself is down we must still
    // respond cleanly (and log for ops). Do not leak internals to the client.
    console.error("[/api/v1/leads] capture failed:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
