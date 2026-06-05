import { draftMode } from "next/headers";
import { redirect } from "next/navigation";
import { requireRole } from "@/server/admin/access";

/** Turn on Draft Mode for the current editor, then open the requested public path. */
export async function GET(request: Request) {
  await requireRole("EDITOR");
  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path") ?? "/";
  const dm = await draftMode();
  dm.enable();
  redirect(path.startsWith("/") ? path : "/");
}
