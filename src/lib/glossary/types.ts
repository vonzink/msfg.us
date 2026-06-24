/** One glossary term and its definition. */
export type GlossaryTerm = {
  /** Display name, e.g. "1003 Form". */
  term: string;
  /** URL-safe slug, e.g. "1003-form". Used for ?term= deep links + ids. */
  slug: string;
  /** Plain-text definition (whitespace-collapsed). */
  definition: string;
};

/** A letter section, e.g. "A" / "#" (Numbers). */
export type GlossaryLetter = {
  /** Nav label: "#", "A" … "Z". */
  label: string;
  /** In-page anchor / section id: "num", "A" … "Z". */
  anchor: string;
  terms: GlossaryTerm[];
};
