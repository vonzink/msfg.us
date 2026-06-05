import { describe, it, expect, vi } from "vitest";

// Stub @/lib/env so Zod doesn't demand DATABASE_URL etc. in the test process.
vi.mock("@/lib/env", () => ({
  serverEnv: new Proxy({} as Record<string, string>, {
    get(_t, prop: string) {
      // Return the fixed test KEK only for TENANT_SECRETS_KEY.
      if (prop === "TENANT_SECRETS_KEY") {
        // 32 bytes of 0x42 as base64
        return Buffer.alloc(32, 0x42).toString("base64");
      }
      return undefined;
    },
  }),
}));

import { secretStore, EnvelopeAesSecretStore } from "./secretStore";

describe("EnvelopeAesSecretStore", () => {
  it("seal → open round-trips to the original plaintext", () => {
    const plain = "sk-test-secret-value";
    const blob = secretStore.seal(plain);
    expect(secretStore.open(blob)).toBe(plain);
  });

  it("two seals of the same plaintext produce different iv and ciphertext", () => {
    const plain = "same-input";
    const a = secretStore.seal(plain);
    const b = secretStore.seal(plain);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("tampering ciphertext makes open() throw", () => {
    const blob = secretStore.seal("value");
    const tampered = { ...blob, ciphertext: Buffer.alloc(20, 0xff).toString("base64") };
    expect(() => secretStore.open(tampered)).toThrow();
  });

  it("tampering authTag makes open() throw", () => {
    const blob = secretStore.seal("value");
    const tampered = { ...blob, authTag: Buffer.alloc(16, 0xaa).toString("base64") };
    expect(() => secretStore.open(tampered)).toThrow();
  });
});

// Key-validation tests: each needs a fresh module registry + a different env mock.
// We use vi.resetModules() + dynamic import() so the module-level `secretStore`
// singleton is constructed with the desired (bad) key for each case.

describe("EnvelopeAesSecretStore — missing key", () => {
  it("throws /TENANT_SECRETS_KEY/ when key is absent", async () => {
    vi.resetModules();
    vi.doMock("@/lib/env", () => ({
      serverEnv: new Proxy({} as Record<string, string>, {
        get() { return undefined; },
      }),
    }));
    const { EnvelopeAesSecretStore: Fresh } = await import("./secretStore");
    const store = new Fresh();
    expect(() => store.seal("x")).toThrow(/TENANT_SECRETS_KEY/);
    vi.doUnmock("@/lib/env");
  });
});

describe("EnvelopeAesSecretStore — wrong-size key", () => {
  it("throws /32 bytes/ when key decodes to 16 bytes", async () => {
    vi.resetModules();
    vi.doMock("@/lib/env", () => ({
      serverEnv: {
        TENANT_SECRETS_KEY: Buffer.alloc(16, 0x01).toString("base64"),
      },
    }));
    const { EnvelopeAesSecretStore: Fresh } = await import("./secretStore");
    const store = new Fresh();
    expect(() => store.seal("x")).toThrow(/32 bytes/);
    vi.doUnmock("@/lib/env");
  });
});
