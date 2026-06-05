import { NextResponse, type NextRequest } from "next/server";

// Edge middleware: no DB. In shared mode it forwards the host as x-tenant-slug
// for the Node-side resolver; in dedicated mode it does nothing (TENANT_SLUG wins).
export function middleware(req: NextRequest) {
  if ((process.env.TENANT_MODE ?? "dedicated") === "dedicated") {
    return NextResponse.next();
  }
  const host = req.headers.get("host")?.toLowerCase().replace(/:\d+$/, "").replace(/^www\./, "");
  const res = NextResponse.next();
  if (host) res.headers.set("x-tenant-slug", host);
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
