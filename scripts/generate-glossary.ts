/**
 * Generate src/content/glossary.ts from scripts/glossary-source/glossary-terms.md.
 * Run: npx tsx scripts/generate-glossary.ts  (or: npm run glossary:generate)
 * The app renders the generated module; markdown is never read at runtime.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseGlossary } from "../src/lib/glossary/parse";

const SRC = join(process.cwd(), "scripts/glossary-source/glossary-terms.md");
const OUT = join(process.cwd(), "src/content/glossary.ts");

const data = parseGlossary(readFileSync(SRC, "utf8"));
const termCount = data.reduce((n, s) => n + s.terms.length, 0);

const file = `// GENERATED FILE — do not edit by hand.
// Source: scripts/glossary-source/glossary-terms.md
// Regenerate: npm run glossary:generate
import type { GlossaryLetter } from "@/lib/glossary/types";

export type { GlossaryTerm, GlossaryLetter } from "@/lib/glossary/types";

export const GLOSSARY: GlossaryLetter[] = ${JSON.stringify(data, null, 2)};
`;

writeFileSync(OUT, file, "utf8");
console.log(`Wrote ${OUT}: ${data.length} sections, ${termCount} terms`);
