import Link from "next/link";
import { requireRole } from "@/server/admin/access";

export default async function AdminDashboard() {
  const ctx = await requireRole("VIEWER");
  return (
    <div>
      <h1 className="text-2xl font-extrabold">Dashboard</h1>
      <p className="mt-2 text-muted">
        {ctx.user.email} · {ctx.tenant.name} ·{" "}
        {ctx.isPlatformAdmin ? "Platform admin" : (ctx.role ?? "no role")}
      </p>
      <div className="mt-6 grid grid-cols-2 gap-4 max-[600px]:grid-cols-1">
        <Link
          href="/admin/config"
          className="rounded-lg border border-line bg-paper p-5 shadow-card transition-shadow hover:shadow-pop"
        >
          <div className="font-bold">Content &amp; SEO</div>
          <div className="mt-1 text-[14px] text-muted">
            Edit branding, contact, SEO strings, and feature flags.
          </div>
        </Link>
        <Link
          href="/admin/config/history"
          className="rounded-lg border border-line bg-paper p-5 shadow-card transition-shadow hover:shadow-pop"
        >
          <div className="font-bold">History</div>
          <div className="mt-1 text-[14px] text-muted">Review and roll back published versions.</div>
        </Link>
      </div>
    </div>
  );
}
