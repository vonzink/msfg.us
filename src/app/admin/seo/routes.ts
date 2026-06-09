/** Routes whose SEO is editable in the CMS. Keys are the canonical path used as
 *  the PAGE_SEO editable key (must match the paths passed to buildMetadata). */
export const SEO_ROUTES: { path: string; label: string }[] = [
  { path: "/", label: "Home" },
  { path: "/buy", label: "Buy" },
  { path: "/refinance", label: "Refinance" },
  { path: "/home-equity", label: "Home Equity" },
  { path: "/rates", label: "Rates" },
  { path: "/loan-officers", label: "Loan Officers" },
];

export function isSeoRoute(path: string): boolean {
  return SEO_ROUTES.some((r) => r.path === path);
}
