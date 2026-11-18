import { buildLegalStrip } from "@/content/site";
import { getTenantConfig } from "@/server/tenant/config";

/**
 * The top of a printed calculator page: the company's name and its licensing line, from tenant
 * config. Hidden on screen, where the site header and footer carry the same information.
 */
export async function PrintLetterhead() {
  const config = await getTenantConfig();
  return (
    <div className="mb-4 hidden border-b-2 border-ink pb-2 print:block">
      <p className="text-[16px] font-extrabold tracking-[-0.01em]">{config.brand.legalName}</p>
      <p className="mt-0.5 text-[8.5px] leading-snug text-muted">{buildLegalStrip(config)}</p>
    </div>
  );
}
