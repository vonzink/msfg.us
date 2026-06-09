import Link from "next/link";
import { requireRole } from "@/server/admin/access";
import { SEO_ROUTES } from "./routes";

export default async function SeoIndexPage() {
  await requireRole("EDITOR");

  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 text-2xl font-extrabold">Per-page SEO</h1>
      <ul className="grid gap-2">
        {SEO_ROUTES.map(({ path, label }) => (
          <li key={path}>
            <Link
              href={`/admin/seo/edit?path=${encodeURIComponent(path)}`}
              className="flex items-center justify-between rounded-md border border-line bg-paper px-4 py-3 text-[15px] font-semibold text-ink hover:border-spring hover:text-spring transition-colors"
            >
              <span>{label}</span>
              <span className="font-normal text-muted text-[13px]">{path}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
