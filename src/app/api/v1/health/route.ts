/**
 * GET /api/v1/health — liveness + DB connectivity probe.
 * Returns 200 {ok,db:"up"} when Postgres answers `SELECT 1`; 503
 * {ok:false,db:"down"} otherwise. Never throws — a down DB is a normal,
 * reportable state for a health check.
 */
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await getDb().$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, db: "up" });
  } catch (err) {
    console.error("[/api/v1/health] db check failed:", err);
    return NextResponse.json(
      { ok: false, db: "down" },
      { status: 503 },
    );
  }
}
