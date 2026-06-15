import { NAV, FOOTER_COLUMNS, type NavLink } from "@/content/nav";

export type SiteMapGroup = { heading: string; links: { label: string; href: string }[] };

const APPLY: NavLink[] = [
  { label: "Start a purchase application", href: "/apply/buy" },
  { label: "Start a refinance application", href: "/apply/refi" },
  { label: "Start a home-equity application", href: "/apply/cash" },
];

const LEGAL: NavLink[] = [
  { label: "Licensing & Disclosures", href: "/licensing" },
  { label: "Privacy Notice (GLBA)", href: "/privacy-notice" },
  { label: "Privacy Policy", href: "/privacy-policy" },
  { label: "Terms of Use", href: "/terms" },
  { label: "Accessibility Statement", href: "/accessibility" },
  { label: "NMLS Consumer Access", href: "/nmls-consumer-access" },
];

/** Keep only internal, real destinations — drop externals, the bare-home
 *  placeholder, the Coming Soon catch-all, and in-page anchors (e.g. the
 *  "/#services" nav link is the home page, not a distinct route); de-dupe by
 *  href. */
function clean(links: NavLink[]): { label: string; href: string }[] {
  const seen = new Set<string>();
  const out: { label: string; href: string }[] = [];
  for (const l of links) {
    if (l.href.startsWith("http")) continue;
    if (l.href === "/" || l.href === "/coming-soon") continue;
    if (l.href.includes("#")) continue;
    if (seen.has(l.href)) continue;
    seen.add(l.href);
    out.push({ label: l.label, href: l.href });
  }
  return out;
}

/** Human-readable site map, derived from the nav + footer config so it can't go
 *  stale. Home is prepended explicitly (clean() strips "/" from NAV-derived
 *  links so it isn't duplicated); legal + apply are curated lists. */
export function buildSiteMap(): SiteMapGroup[] {
  const explore = [
    { label: "Home", href: "/" },
    ...clean(NAV.map((n) => ({ label: n.label, href: n.href }))),
  ];
  const resources = clean(FOOTER_COLUMNS.flatMap((c) => c.links));
  return [
    { heading: "Explore", links: explore },
    { heading: "Apply", links: clean(APPLY) },
    { heading: "Resources", links: resources },
    { heading: "Legal & Compliance", links: clean(LEGAL) },
  ].filter((g) => g.links.length > 0);
}
