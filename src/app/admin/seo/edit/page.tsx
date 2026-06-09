import { notFound } from "next/navigation";
import { requireRole } from "@/server/admin/access";
import { getDraftData, getPublishedData } from "@/server/cms/versioning";
import { parsePageSeo } from "@/server/cms/seo";
import { isSeoRoute, SEO_ROUTES } from "../routes";
import { SeoEditor } from "../SeoEditor";

interface Props {
  searchParams: Promise<{ path?: string }>;
}

export default async function SeoEditPage({ searchParams }: Props) {
  const { path } = await searchParams;

  if (!path || !isSeoRoute(path)) {
    notFound();
  }

  const ctx = await requireRole("EDITOR");

  const draft = await getDraftData(ctx.tenant.id, "PAGE_SEO", path);
  const published = await getPublishedData(ctx.tenant.id, "PAGE_SEO", path);

  const initial = parsePageSeo(draft ?? published ?? {});
  const route = SEO_ROUTES.find((r) => r.path === path)!;

  return (
    <SeoEditor
      path={path}
      label={route.label}
      initial={initial}
      hasDraft={draft != null}
    />
  );
}
