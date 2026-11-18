import fs from "node:fs";
import path from "node:path";

/**
 * Serves the "Where the Money Goes" training page at /calculators/mbs.
 *
 * The page is plain HTML, CSS and JS generated from the msfg-calc repo into src/calculators/mbs/
 * by scripts/sync-where-the-money-goes.mjs. It is not React, so there is no page.tsx. This handler
 * reads those files at build time and Next emits each one as a static response, so nothing is read
 * from disk while the site is running.
 */
const DIR = path.join(process.cwd(), "src", "calculators", "mbs");

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

/** Every servable file under DIR, as a path relative to it ("js/utils.js"). */
function listFiles(dir = DIR): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(full);
    return TYPES[path.extname(entry.name)] ? [path.relative(DIR, full).split(path.sep).join("/")] : [];
  });
}

export const dynamic = "force-static";
/** Only the files listed below exist; any other path under /calculators/mbs is a 404. */
export const dynamicParams = false;

export function generateStaticParams() {
  // The empty path is /calculators/mbs itself, which serves index.html.
  return [{ path: [] as string[] }, ...listFiles().map((file) => ({ path: file.split("/") }))];
}

export async function GET(_req: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path: segments } = await params;
  const file = segments?.length ? segments.join("/") : "index.html";
  if (!listFiles().includes(file)) return new Response("Not found", { status: 404 });
  return new Response(fs.readFileSync(path.join(DIR, file)), {
    headers: { "Content-Type": TYPES[path.extname(file)] },
  });
}
