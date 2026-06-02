/**
 * GET /api/v1/public/loan-officers — public, open (auth:"none"), rate-limited.
 *
 * Returns ONLY public-facing officer fields: name, nmls, city, state,
 * languages, specialties, and rating. Internal fields (scheduleHref,
 * calendarId, textHref, ghlContactId, etc.) are deliberately OMITTED.
 */
import { OFFICERS, type Officer } from "@/content/officers";
import { ok, preflight, withPublicApi } from "@/server/api/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Project an officer down to its public fields only. */
function publicOfficer(o: Officer) {
  return {
    name: o.name,
    nmls: o.nmls,
    city: o.city,
    state: o.state,
    languages: o.languages,
    specialties: o.specialties,
    rating: { average: o.rating.avg, count: o.rating.count },
  };
}

export const GET = withPublicApi(
  () =>
    ok(
      { loanOfficers: OFFICERS.map(publicOfficer) },
      { headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" } },
    ),
  { auth: "none", rateLimit: true },
);

export const OPTIONS = preflight;
