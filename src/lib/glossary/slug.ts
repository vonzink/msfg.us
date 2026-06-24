/**
 * URL-safe slug for a glossary term.
 * Rule: lowercase → drop punctuation (keep spaces & hyphens)
 *       → spaces to hyphens → collapse repeats → trim.
 * Keeps intra-word hyphens ("co-borrower") but removes parens/commas/periods.
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    // Drop punctuation and any non-ASCII (no term name relies on accents),
    // keeping spaces and intra-word hyphens.
    .replace(/[^a-z0-9\s-]+/g, "")
    .trim()
    .replace(/\s+/g, "-") // spaces → hyphens
    .replace(/-+/g, "-") // collapse repeats
    .replace(/^-+|-+$/g, ""); // trim hyphens
}
