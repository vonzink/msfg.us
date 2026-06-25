import type { GlossaryLetter } from "./types";
import { slugify } from "./slug";

const SECTION_RE = /^##\s+(.+?)\s*\{#([^}]+)\}\s*$/; // "## A {#A}"
const TERM_RE = /^###\s+(.+?)\s*$/; //                  "### Term"

/** "# (Numbers)" → "#"; "A" → "A". */
function sectionLabel(raw: string): string {
  const t = raw.trim();
  return t.startsWith("#") ? "#" : t;
}

/**
 * Parse glossary markdown into letter sections.
 * - `## Label {#anchor}` starts a section.
 * - `### Term` starts a term; subsequent non-heading lines are its definition.
 * - Repeated terms (same slug within a section) are deduped, keeping the
 *   longer definition (the source has a truncated duplicate "Interest rate").
 */
export function parseGlossary(markdown: string): GlossaryLetter[] {
  const lines = markdown.split(/\r?\n/);
  const sections: GlossaryLetter[] = [];
  let section: GlossaryLetter | null = null;
  let pending: { term: string; lines: string[] } | null = null;

  const flush = () => {
    if (!section || !pending) return;
    const definition = pending.lines.join(" ").replace(/\s+/g, " ").trim();
    const slug = slugify(pending.term);
    const existing = section.terms.find((t) => t.slug === slug);
    if (existing) {
      if (definition.length > existing.definition.length) existing.definition = definition;
    } else {
      section.terms.push({ term: pending.term.trim(), slug, definition });
    }
    pending = null;
  };

  for (const line of lines) {
    const sec = SECTION_RE.exec(line);
    if (sec) {
      flush();
      section = { label: sectionLabel(sec[1]), anchor: sec[2].trim(), terms: [] };
      sections.push(section);
      continue;
    }
    const term = TERM_RE.exec(line);
    if (term) {
      flush();
      pending = { term: term[1], lines: [] };
      continue;
    }
    if (pending) pending.lines.push(line);
  }
  flush();
  return sections;
}
