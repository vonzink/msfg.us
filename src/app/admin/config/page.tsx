import { requireRole } from "@/server/admin/access";
import { getDraftData, getPublishedData } from "@/server/cms/versioning";
import { parseTenantConfig } from "@/server/tenant/config";
import { ConfigEditor } from "./ConfigEditor";

export default async function ConfigPage() {
  const ctx = await requireRole("EDITOR");
  const draft = await getDraftData(ctx.tenant.id, "CONFIG", "default");
  const published = await getPublishedData(ctx.tenant.id, "CONFIG", "default");
  const config = parseTenantConfig(draft ?? published ?? null);
  return <ConfigEditor initialConfig={config} hasDraft={draft != null} />;
}
