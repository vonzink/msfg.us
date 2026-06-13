import { NextResponse } from "next/server";
import { getAddressProvider } from "@/server/integrations/address";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const token = url.searchParams.get("t") ?? undefined;
  const provider = getAddressProvider();
  if (!provider) return NextResponse.json({ configured: false, suggestions: [] });
  const suggestions = await provider.suggest(q, token);
  return NextResponse.json({ configured: true, suggestions });
}
