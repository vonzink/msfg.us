/**
 * GET /api/v1/public/programs — public, open (auth:"none"), rate-limited, CORS.
 *
 * Returns the loan programs from the category config (CATS): each program's
 * category, name, blurb, and "best for" audience. Flattened across the buy /
 * refi / equity categories.
 */
import { CATS, type CategoryKey } from "@/content/categories";
import { ok, preflight, withPublicApi } from "@/server/api/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Flatten CATS into a list of public program records. */
function listPrograms() {
  const out: Array<{
    category: CategoryKey;
    intent: string;
    name: string;
    blurb: string;
    bestFor: string;
  }> = [];
  (Object.keys(CATS) as CategoryKey[]).forEach((category) => {
    const cat = CATS[category];
    for (const program of cat.opts) {
      out.push({
        category,
        intent: cat.intent,
        name: program.title,
        blurb: program.desc,
        bestFor: program.audience,
      });
    }
  });
  return out;
}

export const GET = withPublicApi(
  () =>
    ok(
      { programs: listPrograms() },
      { headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" } },
    ),
  { auth: "none", rateLimit: true },
);

export const OPTIONS = preflight;
