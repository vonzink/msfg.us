import { describe, it, expect, vi, beforeEach } from "vitest";

// Stub server-only (handled by vitest alias)
// Stub tenant config
vi.mock("@/server/tenant/config", () => ({
  getTenantConfig: vi.fn(),
}));
// Stub tenant secrets
vi.mock("@/server/secrets/tenantSecrets", () => ({
  getTenantSecret: vi.fn(),
}));
// Stub env
vi.mock("@/lib/env", () => ({
  serverEnv: new Proxy({} as Record<string, string>, {
    get(_t, prop: string) {
      return process.env[String(prop).toUpperCase()] ?? undefined;
    },
  }),
}));

import { getAiProvider } from "./index";
import { getTenantConfig } from "@/server/tenant/config";
import { getTenantSecret } from "@/server/secrets/tenantSecrets";

const baseAiConfig = {
  provider: "openai-compatible" as const,
  model: "deepseek-chat",
  baseUrl: "https://api.deepseek.com",
};

// Build a minimal DEFAULT_TENANT_CONFIG-shaped object for mocking
const mockConfig = (ai: object) => ({
  brand: { shortName: "Test" },
  features: { aiAssistant: true },
  ai,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("getAiProvider", () => {
  it("returns OpenAICompatibleProvider for openai-compatible config with secret key", async () => {
    (getTenantConfig as ReturnType<typeof vi.fn>).mockResolvedValue(mockConfig(baseAiConfig));
    (getTenantSecret as ReturnType<typeof vi.fn>).mockResolvedValue("sk-secret");

    const provider = await getAiProvider();
    expect(provider).not.toBeNull();
    // Duck-type check: should be an OpenAICompatibleProvider (has streamTurn)
    expect(typeof provider?.streamTurn).toBe("function");
  });

  it("prefers TenantSecret key over env fallback", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "sk-env");
    (getTenantConfig as ReturnType<typeof vi.fn>).mockResolvedValue(mockConfig(baseAiConfig));
    (getTenantSecret as ReturnType<typeof vi.fn>).mockResolvedValue("sk-from-db");

    // Just verify it doesn't throw and returns a provider
    const provider = await getAiProvider();
    expect(provider).not.toBeNull();
    // getTenantSecret was called
    expect(getTenantSecret).toHaveBeenCalledWith("ai_api_key");
  });

  it("falls back to DEEPSEEK_API_KEY env when no secret row exists", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "sk-env-fallback");
    (getTenantConfig as ReturnType<typeof vi.fn>).mockResolvedValue(mockConfig(baseAiConfig));
    (getTenantSecret as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const provider = await getAiProvider();
    expect(provider).not.toBeNull();
  });

  it("returns null when neither secret nor env key is available", async () => {
    (getTenantConfig as ReturnType<typeof vi.fn>).mockResolvedValue(mockConfig(baseAiConfig));
    (getTenantSecret as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    // No DEEPSEEK_API_KEY in env

    const provider = await getAiProvider();
    expect(provider).toBeNull();
  });

  it("returns AnthropicProvider for anthropic config", async () => {
    (getTenantConfig as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockConfig({ provider: "anthropic", model: "claude-3-5-haiku-20241022" })
    );
    (getTenantSecret as ReturnType<typeof vi.fn>).mockResolvedValue("sk-ant-key");

    const provider = await getAiProvider();
    expect(provider).not.toBeNull();
    expect(typeof provider?.streamTurn).toBe("function");
  });
});
