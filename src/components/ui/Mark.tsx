import { cn } from "@/lib/cn";

/**
 * The MSFG mark: a rounded house/peak glyph in a glowing emerald disc.
 * Original branding (not derived from any third party). When `glow` is set,
 * a soft radial halo is drawn behind it (used at hero scale).
 */
export function Mark({
  size = 30,
  glow = false,
  className,
  label,
}: {
  size?: number;
  glow?: boolean;
  className?: string;
  /** Accessible name for the glyph — the tenant short name. Threaded from a
   *  server parent (or a client parent's prop) so the mark is never hardcoded
   *  to a single brand. */
  label: string;
}) {
  return (
    <span
      className={cn("relative inline-block align-middle", className)}
      style={{ width: size, height: size }}
    >
      {glow && (
        <span
          aria-hidden
          className="absolute rounded-full"
          style={{
            inset: -14,
            background:
              "radial-gradient(circle, rgba(52,209,126,0.55), transparent 70%)",
            filter: "blur(6px)",
          }}
        />
      )}
      <svg
        width={size}
        height={size}
        viewBox="0 0 40 40"
        role="img"
        aria-label={label}
        style={{ position: "relative" }}
      >
        <defs>
          <radialGradient id="msfg-mark-grad" cx="50%" cy="35%" r="75%">
            <stop offset="0%" stopColor="#3CE588" />
            <stop offset="100%" stopColor="#129B57" />
          </radialGradient>
        </defs>
        <circle cx="20" cy="20" r="20" fill="url(#msfg-mark-grad)" />
        <path
          d="M20 10 L29 19 L29 30 L22.5 30 L22.5 24 L17.5 24 L17.5 30 L11 30 L11 19 Z"
          fill="#06251A"
        />
      </svg>
    </span>
  );
}
