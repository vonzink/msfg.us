import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { buildLegalStrip, DEFAULT_TENANT_CONFIG } from "@/content/site";

vi.mock("@/server/tenant/config", () => ({ getTenantConfig: async () => DEFAULT_TENANT_CONFIG }));

import { PrintLetterhead } from "./PrintLetterhead";

it("heads a printed calculator page with the company and its licensing line, and shows nothing on screen", async () => {
  const html = renderToStaticMarkup(await PrintLetterhead());
  expect(html).toMatch(/^<div[^>]*class="[^"]*hidden[^"]*print:block/);
  expect(html).toContain(DEFAULT_TENANT_CONFIG.brand.legalName);
  expect(html).toContain(buildLegalStrip(DEFAULT_TENANT_CONFIG).replace(/&/g, "&amp;"));
});
