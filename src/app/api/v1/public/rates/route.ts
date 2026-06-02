/**
 * GET /api/v1/public/rates — public, open (auth:"none"), rate-limited, CORS.
 *
 * Returns today's purchase + refinance rate rows (product, rate, apr, points,
 * and an estimated monthly P&I on RATES_PRINCIPAL via monthlyPayment) plus the
 * `updatedAt` display string. Cache-friendly: short s-maxage so partners/CDNs
 * can cache the relatively-static rate table without hammering the origin.
 */
import { RATE_DATA, RATES_PRINCIPAL, RATES_UPDATED } from "@/content/rates";
import { monthlyPayment } from "@/lib/finance";
import { ok, preflight, withPublicApi } from "@/server/api/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Shape a single rate row for the public payload. */
function shapeRow(row: (typeof RATE_DATA)["purchase"][number]) {
  return {
    product: row.product,
    subLabel: row.subLabel,
    rate: row.rate,
    apr: row.apr,
    points: row.points,
    applyIntent: row.applyIntent,
    termMonths: row.termMonths,
    estimatedMonthly: Math.round(
      monthlyPayment(RATES_PRINCIPAL, row.rate, row.termMonths),
    ),
  };
}

export const GET = withPublicApi(
  (req) =>
    ok(
      {
        updatedAt: RATES_UPDATED,
        principal: RATES_PRINCIPAL,
        currency: "USD",
        purchase: RATE_DATA.purchase.map(shapeRow),
        refinance: RATE_DATA.refinance.map(shapeRow),
      },
      {
        headers: {
          "Cache-Control": "public, max-age=60, s-maxage=300",
        },
      },
    ),
  { auth: "none", rateLimit: true },
);

export const OPTIONS = preflight;
