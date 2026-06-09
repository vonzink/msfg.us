import Link from "next/link";
import { requireRole } from "@/server/admin/access";
import { Mark } from "@/components/ui/Mark";

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/config", label: "Content & SEO" },
  { href: "/admin/config/history", label: "History" },
  { href: "/admin/seo", label: "Per-Page SEO" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireRole("VIEWER");
  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="grid grid-cols-[240px_1fr] max-[980px]:grid-cols-1">
        <aside className="border-r border-line bg-paper-2 p-5 max-[980px]:border-b max-[980px]:border-r-0">
          <div className="mb-6 flex items-center gap-2">
            <Mark size={26} label="Admin home" />
            <span className="font-bold">Admin</span>
          </div>
          <nav aria-label="Admin navigation" className="flex flex-col gap-1">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="rounded-md px-3 py-2 text-[15px] font-semibold hover:bg-line focus:outline-none focus-visible:ring-2 focus-visible:ring-spring"
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="mt-6 border-t border-line pt-4 text-[13px] text-muted">
            <div className="font-semibold text-ink">{ctx.user.name || ctx.user.email}</div>
            <div>{ctx.tenant.name}</div>
            <div className="uppercase tracking-wide">
              {ctx.isPlatformAdmin ? "Platform" : (ctx.role ?? "—")}
            </div>
            <a
              href="/auth/logout"
              className="mt-2 inline-block font-semibold text-spring-2 hover:underline"
            >
              Sign out
            </a>
          </div>
        </aside>
        <main className="p-8 max-[600px]:p-5">{children}</main>
      </div>
    </div>
  );
}
