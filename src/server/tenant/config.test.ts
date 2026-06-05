import { describe, it, expect, vi, beforeEach } from "vitest";

// resolve.ts pulls next/headers + the DB; we only exercise the pure parse +
// origin logic here, so stub the modules config.ts imports.
vi.mock("./resolve", () => ({ getTenant: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));
// serverEnv validates DATABASE_URL which isn't present in tests; mock it so
// tenantOrigin can read TENANT_MODE from process.env without triggering Zod.
vi.mock("@/lib/env", () => ({
  serverEnv: new Proxy({} as Record<string, string>, {
    get(_t, prop: string) {
      return process.env[prop.toUpperCase()] ?? (prop === "TENANT_MODE" ? "dedicated" : undefined);
    },
  }),
}));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
}));
vi.mock("next/headers", () => ({
  draftMode: vi.fn(async () => ({ isEnabled: false })),
}));
vi.mock("@/server/cms/versioning", () => ({
  getPublishedData: vi.fn(),
  getDraftData: vi.fn(),
}));
vi.mock("@/server/cms/cache", () => ({ configTag: (id: string) => `t:${id}:config` }));

import { parseTenantConfig, tenantOrigin, getTenantConfig } from "./config";
import { DEFAULT_TENANT_CONFIG } from "@/content/site";
import { getTenant } from "./resolve";
import { getPublishedData, getDraftData } from "@/server/cms/versioning";
import { draftMode } from "next/headers";

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("parseTenantConfig", () => {
  it("returns DEFAULT when config is null", () => {
    expect(parseTenantConfig(null)).toEqual(DEFAULT_TENANT_CONFIG);
  });

  it("returns DEFAULT when config is invalid", () => {
    expect(parseTenantConfig({ brand: { shortName: 123 } })).toEqual(
      DEFAULT_TENANT_CONFIG,
    );
  });

  it("parses a valid config and fills theme defaults", () => {
    const valid = {
      ...DEFAULT_TENANT_CONFIG,
      brand: { ...DEFAULT_TENANT_CONFIG.brand, shortName: "Acme" },
    };
    const parsed = parseTenantConfig(valid);
    expect(parsed.brand.shortName).toBe("Acme");
    expect(parsed.theme.green800).toBe("#0b3d30");
  });
});

describe("tenantOrigin", () => {
  it("dedicated mode prefers NEXT_PUBLIC_SITE_URL", () => {
    vi.stubEnv("TENANT_MODE", "dedicated");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://msfg.us");
    expect(tenantOrigin({ domains: ["example.com"] })).toBe("https://msfg.us");
  });

  it("dedicated mode falls back to the first domain when no env URL", () => {
    vi.stubEnv("TENANT_MODE", "dedicated");
    expect(tenantOrigin({ domains: ["acme.com"] })).toBe("https://acme.com");
  });

  it("dedicated mode falls back to msfg.us when nothing else", () => {
    vi.stubEnv("TENANT_MODE", "dedicated");
    expect(tenantOrigin({ domains: [] })).toBe("https://msfg.us");
  });

  it("shared mode uses https + the first domain", () => {
    vi.stubEnv("TENANT_MODE", "shared");
    expect(tenantOrigin({ domains: ["acme.com"] })).toBe("https://acme.com");
  });

  it("shared mode falls back to msfg.us when no domains", () => {
    vi.stubEnv("TENANT_MODE", "shared");
    expect(tenantOrigin({ domains: [] })).toBe("https://msfg.us");
  });
});

describe("getTenantConfig", () => {
  it("returns parsed published config when not in draft mode", async () => {
    (getTenant as any).mockResolvedValue({ id: "tenant_msfg", slug: "msfg", name: "MSFG" });
    (draftMode as any).mockResolvedValue({ isEnabled: false });
    (getPublishedData as any).mockResolvedValue({
      ...DEFAULT_TENANT_CONFIG,
      brand: { ...DEFAULT_TENANT_CONFIG.brand, shortName: "Pub" },
    });
    const cfg = await getTenantConfig();
    expect(cfg.brand.shortName).toBe("Pub");
    expect(getDraftData).not.toHaveBeenCalled();
  });

  it("returns the draft config when draft mode is enabled", async () => {
    (getTenant as any).mockResolvedValue({ id: "tenant_msfg", slug: "msfg", name: "MSFG" });
    (draftMode as any).mockResolvedValue({ isEnabled: true });
    (getDraftData as any).mockResolvedValue({
      ...DEFAULT_TENANT_CONFIG,
      brand: { ...DEFAULT_TENANT_CONFIG.brand, shortName: "Draft" },
    });
    const cfg = await getTenantConfig();
    expect(cfg.brand.shortName).toBe("Draft");
  });

  it("falls back to DEFAULT when no published revision exists", async () => {
    (getTenant as any).mockResolvedValue({ id: "tenant_msfg", slug: "msfg", name: "MSFG" });
    (draftMode as any).mockResolvedValue({ isEnabled: false });
    (getPublishedData as any).mockResolvedValue(null);
    const cfg = await getTenantConfig();
    expect(cfg).toEqual(DEFAULT_TENANT_CONFIG);
  });
});
