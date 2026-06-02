/**
 * Open-redirect-safe `returnTo` sanitizer (shared by the login route and any
 * UI that builds a `?returnTo=` link).
 *
 * Only a SAME-ORIGIN, relative path is honored. Anything that could escape the
 * origin — an absolute URL (`https://evil.com`), a protocol-relative URL
 * (`//evil.com`), a backslash trick (`/\evil.com`), or a non-path value — is
 * rejected and the caller's fallback (default `/`) is used instead. This blocks
 * classic open-redirect phishing through the auth callback.
 */
export function safeReturnTo(value: string | null | undefined, fallback = "/"): string {
  if (!value) return fallback;
  // Must be a root-relative path.
  if (!value.startsWith("/")) return fallback;
  // Reject protocol-relative (`//host`) and backslash-normalized (`/\host`)
  // forms that browsers may treat as absolute.
  if (value.startsWith("//") || value.startsWith("/\\")) return fallback;
  // Reject any embedded scheme or control chars.
  if (/[\x00-\x1f]/.test(value) || value.includes("://")) return fallback;
  return value;
}
