import { draftMode } from "next/headers";
import { redirect } from "next/navigation";

/** Exit Draft Mode and return to the editor. */
export async function GET() {
  const dm = await draftMode();
  dm.disable();
  redirect("/admin/config");
}
