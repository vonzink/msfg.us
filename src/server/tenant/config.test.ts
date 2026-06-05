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

import { parseTenantConfig, tenantOrigin } from "./config";
import { DEFAULT_TENANT_CONFIG } from "@/content/site";

beforeEach(() => {
  vi.unstubAllEnvs();
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
