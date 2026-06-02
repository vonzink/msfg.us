/**
 * POST /api/v1/public/leads — partner lead intake. auth:"key+hmac".
 *
 * Requires a valid `x-api-key`. When the matched key has a configured secret,
 * a valid `x-signature: sha256=<hex>` HMAC over the raw body is ALSO required
 * (enforced by the withPublicApi wrapper). The body is validated with the same
 * `leadInputSchema` as the site's internal intake, then captured via
 * `captureLead` (Postgres = system-of-record, GHL = best-effort mirror).
 *
 * Returns { ok:true, data:{ leadId, syncStatus } }. When the public API is not
 * enabled (no MSFG_API_KEYS / no ApiKey rows) the wrapper returns 503 before
 * this handler runs.
 */
import { leadInputSchema } from "@/validation/lead";
import { captureLead } from "@/server/leads/leadService";
import { ok, fail, preflight, withPublicApi } from "@/server/api/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withPublicApi(
  async (_req, ctx) => {
    // Reuse the raw body the wrapper already read (needed for HMAC) — avoids a
    // second read of the consumed request stream.
    let json: unknown;
    try {
      json = ctx.rawBody ? JSON.parse(ctx.rawBody) : null;
    } catch {
      return fail(400, "Invalid JSON body");
    }

    const parsed = leadInputSchema.safeParse(json);
    if (!parsed.success) {
      return fail(400, "Validation failed: " + parsed.error.message);
    }

    try {
      const { leadId, syncStatus } = await captureLead(parsed.data);
      return ok({ leadId, syncStatus }, { status: 201 });
    } catch {
      // captureLead shouldn't throw, but if Postgres is down respond cleanly.
      return fail(500, "Lead capture failed");
    }
  },
  { auth: "key+hmac", rateLimit: true },
);

export const OPTIONS = preflight;
