import { draftMode } from "next/headers";
import { redirect } from "next/navigation";
import { requireRole } from "@/server/admin/access";

/** Turn on Draft Mode for the current editor, then open the requested public path. */
export async function GET(request: Request) {
  await requireRole("EDITOR");
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("path") ?? "/";
  // Only allow an internal absolute path — reject protocol-relative ("//evil.com")
  // and backslash ("/\evil.com") targets that browsers resolve to external hosts.
  const path =
    raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\")
      ? raw
      : "/";
  const dm = await draftMode();
  dm.enable();
  redirect(path);
}
