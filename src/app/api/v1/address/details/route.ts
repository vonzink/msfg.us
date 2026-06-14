import { NextResponse } from "next/server";
import { getAddressProvider } from "@/server/integrations/address";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id") ?? "";
  const token = url.searchParams.get("t") ?? undefined;
  const provider = getAddressProvider();
  if (!provider || !id) return NextResponse.json({ configured: Boolean(provider), address: null });
  const address = await provider.details(id, token);
  return NextResponse.json({ configured: true, address });
}
