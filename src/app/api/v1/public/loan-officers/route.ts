/**
 * GET /api/v1/public/loan-officers — public, open (auth:"none"), rate-limited.
 *
 * Returns public-facing officer fields: name, title, nmls, license states,
 * phone, email, headshot, apply link, and bio. Internal/CRM fields
 * (ghlContactId, etc.) are deliberately OMITTED.
 */
import { OFFICERS, type Officer } from "@/content/officers";
import { ok, preflight, withPublicApi } from "@/server/api/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Project an officer down to its public fields only. */
function publicOfficer(o: Officer) {
  return {
    name: o.name,
    title: o.title,
    nmls: o.nmls,
    states: o.states,
    phone: o.phone,
    email: o.email,
    photo: o.photo,
    applyUrl: o.applyHref,
    bio: o.bio,
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
