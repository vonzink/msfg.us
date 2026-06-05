import { describe, it, expect, vi, beforeEach } from "vitest";

// Stub server-only (aliased in vitest.config.ts → test/stubs/server-only.ts)
// Stub tenant resolve + db
vi.mock("../tenant/resolve", () => ({ getTenant: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));
// Stub secretStore so we can inspect seal/open calls without needing a real key
vi.mock("./secretStore", () => ({
  secretStore: {
    seal: vi.fn(),
    open: vi.fn(),
  },
  default: {
    seal: vi.fn(),
    open: vi.fn(),
  },
}));

import { getTenantSecret, setTenantSecret } from "./tenantSecrets";
import { getTenant } from "../tenant/resolve";
import { getDb } from "@/lib/db";
import { secretStore } from "./secretStore";

const mockTenant = { id: "tenant_msfg", slug: "msfg", name: "MSFG" };

beforeEach(() => {
  vi.clearAllMocks();
  (getTenant as ReturnType<typeof vi.fn>).mockResolvedValue(mockTenant);
});

describe("getTenantSecret", () => {
  it("returns the decrypted plaintext when the row exists", async () => {
    const fakeRow = {
      ciphertext: Buffer.from("sk-test").toString("base64"),
      iv: "dGVzdGl2MTIzNDU2",
      authTag: "dGVzdGF1dGh0YWc=",
      keyVersion: 1,
    };
    const mockFindUnique = vi.fn().mockResolvedValue(fakeRow);
    (getDb as ReturnType<typeof vi.fn>).mockReturnValue({
      tenantSecret: { findUnique: mockFindUnique },
    });
    (secretStore.open as ReturnType<typeof vi.fn>).mockReturnValue("sk-test");

    const result = await getTenantSecret("ai_api_key");
    expect(result).toBe("sk-test");
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { tenantId_name: { tenantId: "tenant_msfg", name: "ai_api_key" } },
    });
    expect(secretStore.open).toHaveBeenCalledWith(fakeRow);
  });

  it("returns null when the row is absent", async () => {
    const mockFindUnique = vi.fn().mockResolvedValue(null);
    (getDb as ReturnType<typeof vi.fn>).mockReturnValue({
      tenantSecret: { findUnique: mockFindUnique },
    });

    const result = await getTenantSecret("ai_api_key");
    expect(result).toBeNull();
    expect(secretStore.open).not.toHaveBeenCalled();
  });
});

describe("setTenantSecret", () => {
  it("seals the plaintext and upserts with the correct args", async () => {
    const fakeBlob = {
      ciphertext: "c2stcmVhbC1rZXk=",
      iv: "aXZibG9i",
      authTag: "YXV0aFRhZw==",
      keyVersion: 1,
    };
    (secretStore.seal as ReturnType<typeof vi.fn>).mockReturnValue(fakeBlob);
    const mockUpsert = vi.fn().mockResolvedValue({});
    (getDb as ReturnType<typeof vi.fn>).mockReturnValue({
      tenantSecret: { upsert: mockUpsert },
    });

    await setTenantSecret("tenant_msfg", "ai_api_key", "sk-real-key");

    expect(secretStore.seal).toHaveBeenCalledWith("sk-real-key");
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId_name: { tenantId: "tenant_msfg", name: "ai_api_key" } },
        create: expect.objectContaining({ tenantId: "tenant_msfg", name: "ai_api_key" }),
        update: expect.objectContaining({ keyVersion: 1 }),
      })
    );
  });
});
