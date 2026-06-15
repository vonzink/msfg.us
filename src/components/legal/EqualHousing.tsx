/** Equal Housing Opportunity mark — a house outline with the equal sign, the
 *  standard fair-housing symbol. Token-colored via `currentColor` so it inherits
 *  the surrounding text color (e.g. `text-muted`). Approximates the official HUD
 *  mark; a brand-approved asset can replace it later without touching callers. */
export function EqualHousing({
  size = 28,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="Equal Housing Opportunity"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      <title>Equal Housing Opportunity</title>
      <path d="M7 31 L32 10 L57 31" />
      <path d="M14 28 V53 H50 V28" />
      <line x1="24" y1="36" x2="40" y2="36" />
      <line x1="24" y1="44" x2="40" y2="44" />
    </svg>
  );
}
