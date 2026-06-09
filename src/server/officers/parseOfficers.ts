import type { Officer } from "@/content/officers";

/** Slug from a display name: drop credential suffix, hyphenate. */
export function slugify(name: string): string {
  return name
    .split(",")[0]
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Italic placeholder used in the roster when an officer has no individual bio. */
const NO_BIO_PLACEHOLDER = /^_no bio/i;

function field(label: string, block: string): string | null {
  const safe = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = block.match(new RegExp(`\\*\\*${safe}:\\*\\*\\s*(.+)`));
  return m ? m[1].trim() : null;
}

/**
 * Parse the MSFG roster markdown into Officer records. Officer blocks are H2
 * sections (`## Name`); the H1 title and any preamble are ignored. A block
 * without an NMLS line is skipped (defensive against stray sections).
 */
export function parseOfficerMarkdown(md: string): Officer[] {
  // Prepend a newline so an officer block at column 0 (no H1/preamble) still splits.
  const blocks = ("\n" + md).split(/\n##\s+/).slice(1);
  const officers: Officer[] = [];
  for (const raw of blocks) {
    const block = raw.trim();
    const name = block.split("\n")[0].trim();
    const nmls = field("NMLS", block);
    if (!name || !nmls) continue;

    const states = (field("Licensed", block) ?? "")
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

    const photo = block.match(/!\[[^\]]*\]\(([^)]+)\)/);

    let bio: string[] = [];
    const bioStart = block.indexOf("**Bio:**");
    if (bioStart !== -1) {
      const after = block.slice(bioStart + "**Bio:**".length);
      const end = after.indexOf("**Apply Now:**");
      bio = (end === -1 ? after : after.slice(0, end))
        .split(/\n\s*\n/)
        .map((p) => p.replace(/\s+/g, " ").trim())
        .filter((p) => p && !NO_BIO_PLACEHOLDER.test(p));
    }

    officers.push({
      slug: slugify(name),
      name,
      title: field("Title", block) ?? "",
      nmls,
      email: field("Email", block) ?? "",
      phone: field("Phone", block) ?? "",
      states,
      photo: photo ? photo[1].trim() : "",
      bio,
      applyHref: field("Apply Now", block) ?? "",
    });
  }
  return officers;
}
