/**
 * GET|POST /api/internal/retry-ghl — Vercel Cron retry sweep.
 *
 * Re-dispatches leads stuck in PENDING/FAILED (with bounded attempts) to GHL.
 * If CRON_SECRET is set, callers must present `Authorization: Bearer <secret>`
 * (Vercel Cron sends this automatically when configured). When unset, the
 * endpoint is open — intended only for non-production/dev. Both verbs are
 * supported because Vercel Cron issues GET while manual triggers often POST.
 */
import { NextResponse } from "next/server";
import { getTenantDb } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { dispatchToGhl } from "@/server/leads/leadService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 50;

function authorized(req: Request): boolean {
  const secret = serverEnv.CRON_SECRET;
  if (!secret) return true; // no secret configured → open (dev only)
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

async function run(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Tenant-scoped read so it matches the per-row dispatchToGhl (which resolves
  // the same tenant): the sweep only ever sees the resolved tenant's leads —
  // never another tenant's PII pushed through the wrong CRM credentials. In
  // dedicated mode that's the pinned tenant; in shared mode it's the tenant of
  // this cron request. A fan-out across ALL tenants (loop tenants → scoped
  // sweep each) is a later platform concern, not needed while MSFG is dedicated.
  const db = await getTenantDb();
  const pending = await db.lead.findMany({
    where: {
      syncStatus: { in: ["FAILED", "PENDING"] },
      syncAttempts: { lt: MAX_ATTEMPTS },
    },
    orderBy: { createdAt: "asc" },
    take: BATCH_SIZE,
  });

  let synced = 0;
  let failed = 0;
  let skipped = 0;
  for (const lead of pending) {
    const updated = await dispatchToGhl(lead);
    if (updated.syncStatus === "SYNCED") synced++;
    else if (updated.syncStatus === "SKIPPED") skipped++;
    else failed++;
  }

  return NextResponse.json({
    ok: true,
    processed: pending.length,
    synced,
    failed,
    skipped,
  });
}

export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  return run(req);
}
