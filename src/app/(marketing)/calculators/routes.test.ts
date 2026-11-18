import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_TENANT_CONFIG } from "@/content/site";

// A tenant can switch a calculator off in its config. Its page must then be "not found", and the
// landing page must go too when nothing is left.
const settings = vi.hoisted(() => ({ disabled: [] as string[] }));
vi.mock("@/server/tenant/config", () => ({
  getTenantConfig: async () => ({
    ...DEFAULT_TENANT_CONFIG,
    calculators: { ...DEFAULT_TENANT_CONFIG.calculators, disabled: settings.disabled },
  }),
}));

import MortgagePage from "./mortgage/page";
import InvestmentPage from "./investment/page";
import LandingPage from "./page";

const NOT_FOUND = /NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/;
const outcome = (page: () => Promise<unknown>) =>
  page().then(() => "renders", (e: { digest?: string; message?: string }) => (NOT_FOUND.test(`${e.digest} ${e.message}`) ? "not found" : `error: ${e.message}`));

describe("switched-off calculators", () => {
  beforeEach(() => { settings.disabled = []; });

  it("renders every page when nothing is switched off", async () => {
    expect(await outcome(MortgagePage)).toBe("renders");
    expect(await outcome(InvestmentPage)).toBe("renders");
    expect(await outcome(LandingPage)).toBe("renders");
  });

  it("makes only the switched-off calculator not found", async () => {
    settings.disabled = ["mortgage"];
    expect(await outcome(MortgagePage)).toBe("not found");
    expect(await outcome(InvestmentPage)).toBe("renders");
    expect(await outcome(LandingPage)).toBe("renders");
  });

  it("makes the landing page not found when every calculator is off", async () => {
    settings.disabled = ["mortgage", "investment"];
    expect(await outcome(LandingPage)).toBe("not found");
  });
});
