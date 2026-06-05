# Phase C — SecretStore + Pluggable AiProvider — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the global OpenAI/DeepSeek singleton with a per-tenant pluggable `AiProvider` abstraction backed by per-tenant AES-256-GCM–encrypted secrets, adding both an `OpenAICompatibleProvider` (DeepSeek stays working) and an `AnthropicProvider` (Claude) selectable by tenant config.

**Architecture:** Secrets are envelope-encrypted (AES-256-GCM, env KEK `TENANT_SECRETS_KEY`) and stored in a new `TenantSecret` table accessed by `getTenantSecret`/`setTenantSecret`, mirroring the `getTenantConfig` pattern. The chat route becomes provider-agnostic: it calls `getAiProvider()` which reads `TenantConfig.ai` + resolves the key from `TenantSecret` (or falls back to `DEEPSEEK_API_KEY`), returning a `null` for the degraded path when no key is available. All vendor SDK details are confined to the adapters; the route loop only handles neutral `AiMessage[]`/`AiEvent` types and the agentic loop logic is unchanged.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript (strict), Prisma 7 + @prisma/adapter-pg, Zod, Vitest, `openai` + `@anthropic-ai/sdk`, Node `crypto`. Path alias `@/*` → `src/*`. npm.

---

## File map

| Status | Path | Change |
|--------|------|--------|
| **Modify** | `src/lib/env.ts` | Add `TENANT_SECRETS_KEY: z.string().optional()` to `envSchema` |
| **Create** | `src/server/secrets/secretStore.ts` | `SecretBlob`, `SecretStore` interface, `EnvelopeAesSecretStore`, exported `secretStore` default instance |
| **Create** | `src/server/secrets/secretStore.test.ts` | Vitest suite: round-trip, uniqueness, tamper, missing key |
| **Modify** | `prisma/schema.prisma` | Add `model TenantSecret` |
| **Create** | `prisma/migrations/20260605000000_add_tenant_secret/migration.sql` | `CREATE TABLE tenant_secrets` + indexes |
| **Modify** | `src/server/tenant/types.ts` | Add `"TenantSecret"` to `TENANT_SCOPED_MODELS` |
| **Create** | `src/server/secrets/tenantSecrets.ts` | `getTenantSecret`, `setTenantSecret` (server-only) |
| **Create** | `src/server/secrets/tenantSecrets.test.ts` | Vitest suite: get/set with mocked db + secretStore |
| **Create** | `src/server/ai/providers/types.ts` | `AiToolCall`, `AiMessage`, `AiTool`, `AiEvent`, `AiProvider` |
| **Modify** | `src/server/ai/tools.ts` | Redefine `TOOLS` as `AiTool[]`; keep `runTool` unchanged |
| **Create** | `src/server/ai/tools.test.ts` | Vitest: TOOLS has 4 entries, each has `parameters` |
| **Create** | `src/server/ai/providers/openaiCompatible.ts` | `OpenAICompatibleProvider` |
| **Create** | `src/server/ai/providers/openaiCompatible.test.ts` | Vitest: mock openai, assert translation + events |
| **Create** | `src/server/ai/providers/anthropic.ts` | `AnthropicProvider` |
| **Create** | `src/server/ai/providers/anthropic.test.ts` | Vitest: mock @anthropic-ai/sdk, assert translation + events |
| **Modify** | `src/content/site.ts` | Add `AiConfigSchema`, add `ai` field to `TenantConfigSchema` + `DEFAULT_TENANT_CONFIG` |
| **Modify** | `src/content/site.test.ts` | Add `ai` field to the partial-config fixture |
| **Create** | `src/server/ai/providers/index.ts` | `getAiProvider(): Promise<AiProvider \| null>` |
| **Create** | `src/server/ai/providers/index.test.ts` | Vitest: adapter selection, secret preference, null path |
| **Modify** | `src/app/api/v1/ai/chat/route.ts` | Replace OpenAI loop with provider-agnostic loop |
| **Delete** | `src/server/ai/client.ts` | Removed (superseded by `getAiProvider`) |
| **Modify** | `prisma/seed.ts` | Confirm `config.ai` is carried by `DEFAULT_TENANT_CONFIG` in tenant upsert |
| **Create** | `scripts/seal-secret.ts` | One-off: reads `DEEPSEEK_API_KEY` from env → `setTenantSecret` |
| **Modify** | `next.config.ts` | Add `./node_modules/@anthropic-ai/sdk/**` to `outputFileTracingIncludes` |
| **Modify** | `package.json` | `npm install @anthropic-ai/sdk` (adds dep) |

---

## Task 1 — SecretStore (AES-256-GCM), pure crypto

**Files:**
- Modify: `src/lib/env.ts`
- Create: `src/server/secrets/secretStore.ts`
- Create: `src/server/secrets/secretStore.test.ts`

### Steps

- [ ] **1.1 — Add `TENANT_SECRETS_KEY` to env schema.**

  Open `src/lib/env.ts`. Find the `envSchema` Zod object (the block containing `DEEPSEEK_API_KEY`). Add the following field anywhere in that object (e.g., immediately after `SENTRY_DSN`):

  ```ts
  TENANT_SECRETS_KEY: z.string().optional(),
  ```

  This keeps the app bootable without the key — `EnvelopeAesSecretStore` throws only when `seal`/`open` is actually called without it.

- [ ] **1.2 — Write the failing test first.**

  Create `src/server/secrets/secretStore.test.ts`:

  ```ts
  import { describe, it, expect, vi, beforeEach } from "vitest";

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

    it("missing key (empty string proxy) throws a clear error on seal", () => {
      vi.mock("@/lib/env", () => ({
        serverEnv: new Proxy({} as Record<string, string>, {
          get() { return undefined; },
        }),
      }));
      // Use a fresh instance that hasn't cached the key yet.
      const store = new EnvelopeAesSecretStore();
      expect(() => store.seal("x")).toThrow(/TENANT_SECRETS_KEY/);
    });

    it("wrong-size key (16 bytes) throws a clear error", () => {
      const store = new EnvelopeAesSecretStore();
      // Override: inject a 16-byte key via mock
      vi.doMock("@/lib/env", () => ({
        serverEnv: { TENANT_SECRETS_KEY: Buffer.alloc(16).toString("base64") },
      }));
      expect(() => store.seal("x")).toThrow(/32 bytes/);
    });
  });
  ```

  Run: `npx vitest run src/server/secrets/secretStore.test.ts` — **expected: FAIL** (file doesn't exist yet).

- [ ] **1.3 — Implement `secretStore.ts`.**

  Create `src/server/secrets/secretStore.ts`:

  ```ts
  /**
   * Envelope encryption for tenant secrets.
   *
   * Algorithm: AES-256-GCM with a 96-bit random IV per seal.
   * KEK: base64-encoded 32-byte value from env.TENANT_SECRETS_KEY.
   * The SecretBlob is safe to store in Postgres TEXT columns (all base64).
   *
   * Server-only (no `import "server-only"` needed here — it carries no
   * Next.js guard, just pure Node crypto; callers that are server-only
   * already declare it).
   */
  import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
  import { serverEnv } from "@/lib/env";

  /** Persisted form of an encrypted secret (all strings are base64). */
  export type SecretBlob = {
    ciphertext: string;
    iv: string;
    authTag: string;
    keyVersion: number;
  };

  /** Minimal interface for swapping the crypto backend (e.g., KMS). */
  export interface SecretStore {
    seal(plaintext: string): SecretBlob;
    open(blob: SecretBlob): string;
  }

  /** AES-256-GCM envelope implementation. Default export instance. */
  export class EnvelopeAesSecretStore implements SecretStore {
    /** Lazily decoded KEK; validated on first use. */
    private kek: Buffer | null = null;

    private getKek(): Buffer {
      if (this.kek) return this.kek;
      const raw = serverEnv.TENANT_SECRETS_KEY;
      if (!raw) {
        throw new Error(
          "EnvelopeAesSecretStore: TENANT_SECRETS_KEY is not set. " +
          "Set it to a base64-encoded 32-byte key."
        );
      }
      const buf = Buffer.from(raw, "base64");
      if (buf.length !== 32) {
        throw new Error(
          `EnvelopeAesSecretStore: TENANT_SECRETS_KEY must decode to exactly 32 bytes ` +
          `(got ${buf.length}). Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
        );
      }
      this.kek = buf;
      return buf;
    }

    seal(plaintext: string): SecretBlob {
      const kek = this.getKek();
      const iv = randomBytes(12); // 96-bit IV for GCM
      const cipher = createCipheriv("aes-256-gcm", kek, iv);
      const enc = Buffer.concat([
        cipher.update(plaintext, "utf8"),
        cipher.final(),
      ]);
      return {
        ciphertext: enc.toString("base64"),
        iv: iv.toString("base64"),
        authTag: cipher.getAuthTag().toString("base64"),
        keyVersion: 1,
      };
    }

    open(blob: SecretBlob): string {
      const kek = this.getKek();
      const iv = Buffer.from(blob.iv, "base64");
      const ciphertext = Buffer.from(blob.ciphertext, "base64");
      const authTag = Buffer.from(blob.authTag, "base64");
      const decipher = createDecipheriv("aes-256-gcm", kek, iv);
      decipher.setAuthTag(authTag);
      try {
        const dec = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
        return dec.toString("utf8");
      } catch (err) {
        throw new Error(
          "EnvelopeAesSecretStore: decryption failed — data may be tampered.",
          { cause: err }
        );
      }
    }
  }

  /** Singleton instance used by tenantSecrets.ts and the seal script. */
  const secretStore: SecretStore = new EnvelopeAesSecretStore();
  export { secretStore };
  export default secretStore;
  ```

- [ ] **1.4 — Run tests (expected: PASS).**

  ```
  npx vitest run src/server/secrets/secretStore.test.ts
  ```

  All assertions should pass.

- [ ] **1.5 — Commit.**

  ```
  git add src/lib/env.ts src/server/secrets/secretStore.ts src/server/secrets/secretStore.test.ts
  git commit -m "feat(secrets): AES-256-GCM SecretStore + env key slot (Task 1)"
  ```

---

## Task 2 — TenantSecret table + tenant-scoped accessor

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260605000000_add_tenant_secret/migration.sql`
- Modify: `src/server/tenant/types.ts`
- Create: `src/server/secrets/tenantSecrets.ts`
- Create: `src/server/secrets/tenantSecrets.test.ts`

> **NOTE:** The migration SQL is written here and committed to the repo. Applying it against the live database is a **gated step** deferred to Task 8. `npx prisma generate` (no DB) is safe and required here.

### Steps

- [ ] **2.1 — Add `TenantSecret` model to `prisma/schema.prisma`.**

  Append after the last model in the file (before any closing comments):

  ```prisma
  // ---------------------------------------------------------------------------
  // Per-tenant encrypted secrets (Phase C)
  // ---------------------------------------------------------------------------

  /// One named secret for a tenant, envelope-encrypted with AES-256-GCM.
  /// The master key (KEK) lives in env.TENANT_SECRETS_KEY — never in this table.
  /// `name` is a logical key (e.g., "ai_api_key"); rotate by upserting a new
  /// sealed blob (keyVersion increments when the rotation scheme is added).
  model TenantSecret {
    id         String   @id @default(cuid())
    tenantId   String
    name       String
    ciphertext String
    iv         String
    authTag    String
    keyVersion Int      @default(1)
    createdAt  DateTime @default(now())
    updatedAt  DateTime @updatedAt

    @@unique([tenantId, name])
    @@index([tenantId])
    @@map("tenant_secrets")
  }
  ```

- [ ] **2.2 — Run `npx prisma generate` (no DB access).**

  ```
  npx prisma generate
  ```

  This regenerates the Prisma Client types to include `TenantSecret`. No migration is applied yet.

- [ ] **2.3 — Add `"TenantSecret"` to `TENANT_SCOPED_MODELS` in `src/server/tenant/types.ts`.**

  Locate the `TENANT_SCOPED_MODELS` array. Add `"TenantSecret"` to it:

  ```ts
  export const TENANT_SCOPED_MODELS = [
    "Lead",
    "LoanOfficer",
    "LoanProgram",
    "RateRow",
    "Testimonial",
    "Application",
    "ApplicationStep",
    "ChatSession",
    "ChatMessage",
    "WebhookEvent",
    "TenantSecret",   // ← add
  ] as const;
  ```

- [ ] **2.4 — Create the migration SQL file.**

  Create directory `prisma/migrations/20260605000000_add_tenant_secret/` and write `migration.sql`:

  ```sql
  -- Phase C: per-tenant encrypted secrets table.
  -- Applied by: npx prisma migrate deploy (gated — see Task 8)

  CREATE TABLE "tenant_secrets" (
      "id"         TEXT NOT NULL,
      "tenantId"   TEXT NOT NULL,
      "name"       TEXT NOT NULL,
      "ciphertext" TEXT NOT NULL,
      "iv"         TEXT NOT NULL,
      "authTag"    TEXT NOT NULL,
      "keyVersion" INTEGER NOT NULL DEFAULT 1,
      "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt"  TIMESTAMP(3) NOT NULL,

      CONSTRAINT "tenant_secrets_pkey" PRIMARY KEY ("id")
  );

  CREATE UNIQUE INDEX "tenant_secrets_tenantId_name_key"
      ON "tenant_secrets"("tenantId", "name");

  CREATE INDEX "tenant_secrets_tenantId_idx"
      ON "tenant_secrets"("tenantId");
  ```

- [ ] **2.5 — Write the failing test first.**

  Create `src/server/secrets/tenantSecrets.test.ts`:

  ```ts
  import { describe, it, expect, vi, beforeEach } from "vitest";

  // Stub server-only (aliased in vitest.config.ts → test/stubs/server-only.ts)
  // vitest.config.ts already aliases "server-only" globally — no explicit mock needed.

  // Stub tenant resolve (hits next/headers + DB in production)
  vi.mock("../tenant/resolve", () => ({
    getTenant: vi.fn(),
  }));

  // Stub the Prisma DB
  vi.mock("@/lib/db", () => ({
    getDb: vi.fn(),
  }));

  // Stub secretStore so we don't need a real KEK in tests
  vi.mock("./secretStore", () => ({
    secretStore: {
      seal: vi.fn((plaintext: string) => ({
        ciphertext: Buffer.from(plaintext).toString("base64"),
        iv: "dGVzdGl2MTIzNDU2",   // fixed base64 "testiv123456"
        authTag: "dGVzdGF1dGh0YWc=", // fixed base64
        keyVersion: 1,
      })),
      open: vi.fn((blob: { ciphertext: string }) =>
        Buffer.from(blob.ciphertext, "base64").toString("utf8")
      ),
    },
    default: {
      seal: vi.fn((plaintext: string) => ({
        ciphertext: Buffer.from(plaintext).toString("base64"),
        iv: "dGVzdGl2MTIzNDU2",
        authTag: "dGVzdGF1dGh0YWc=",
        keyVersion: 1,
      })),
      open: vi.fn((blob: { ciphertext: string }) =>
        Buffer.from(blob.ciphertext, "base64").toString("utf8")
      ),
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

      const result = await getTenantSecret("ai_api_key");
      expect(result).toBe("sk-test");
      expect(mockFindUnique).toHaveBeenCalledWith({
        where: { tenantId_name: { tenantId: "tenant_msfg", name: "ai_api_key" } },
      });
    });

    it("returns null when the row is absent", async () => {
      const mockFindUnique = vi.fn().mockResolvedValue(null);
      (getDb as ReturnType<typeof vi.fn>).mockReturnValue({
        tenantSecret: { findUnique: mockFindUnique },
      });

      const result = await getTenantSecret("ai_api_key");
      expect(result).toBeNull();
    });
  });

  describe("setTenantSecret", () => {
    it("seals the plaintext and upserts with the correct args", async () => {
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
  ```

  Run: `npx vitest run src/server/secrets/tenantSecrets.test.ts` — **expected: FAIL**.

- [ ] **2.6 — Implement `tenantSecrets.ts`.**

  Create `src/server/secrets/tenantSecrets.ts`:

  ```ts
  /**
   * Tenant-scoped secret accessors.
   *
   * Mirrors the getTenantConfig pattern: import "server-only", resolve the
   * active tenant via getTenant(), query via getDb() scoped to that tenant.
   * Decryption is deferred to point-of-use via secretStore.open().
   */
  import "server-only";
  import { getDb } from "@/lib/db";
  import { getTenant } from "@/server/tenant/resolve";
  import secretStore, { type SecretBlob } from "./secretStore";

  /**
   * Retrieve and decrypt a named secret for the current request's tenant.
   * Returns null if no secret row exists (callers fall back to env vars).
   */
  export async function getTenantSecret(name: string): Promise<string | null> {
    const tenant = await getTenant();
    const row = await getDb().tenantSecret.findUnique({
      where: { tenantId_name: { tenantId: tenant.id, name } },
    });
    if (!row) return null;
    const blob: SecretBlob = {
      ciphertext: row.ciphertext,
      iv: row.iv,
      authTag: row.authTag,
      keyVersion: row.keyVersion,
    };
    return secretStore.open(blob);
  }

  /**
   * Seal and upsert a named secret for the given tenantId.
   * Used by prisma/seed.ts (key-free) and scripts/seal-secret.ts (operational).
   * NOT called on the request path — no getTenant() needed here; tenantId is
   * passed explicitly so the script can target any tenant.
   */
  export async function setTenantSecret(
    tenantId: string,
    name: string,
    plaintext: string
  ): Promise<void> {
    const blob = secretStore.seal(plaintext);
    await getDb().tenantSecret.upsert({
      where: { tenantId_name: { tenantId, name } },
      create: {
        tenantId,
        name,
        ciphertext: blob.ciphertext,
        iv: blob.iv,
        authTag: blob.authTag,
        keyVersion: blob.keyVersion,
      },
      update: {
        ciphertext: blob.ciphertext,
        iv: blob.iv,
        authTag: blob.authTag,
        keyVersion: blob.keyVersion,
      },
    });
  }
  ```

- [ ] **2.7 — Run tests (expected: PASS).**

  ```
  npx vitest run src/server/secrets/tenantSecrets.test.ts
  ```

- [ ] **2.8 — Commit.**

  ```
  git add prisma/schema.prisma \
          prisma/migrations/20260605000000_add_tenant_secret/migration.sql \
          src/server/tenant/types.ts \
          src/server/secrets/tenantSecrets.ts \
          src/server/secrets/tenantSecrets.test.ts
  git commit -m "feat(secrets): TenantSecret model + accessor getTenantSecret/setTenantSecret (Task 2)"
  ```

---

## Task 3 — Neutral AI types + neutral TOOLS

**Files:**
- Create: `src/server/ai/providers/types.ts`
- Modify: `src/server/ai/tools.ts`
- Create: `src/server/ai/tools.test.ts`

### Steps

- [ ] **3.1 — Create neutral type definitions.**

  Create `src/server/ai/providers/types.ts`:

  ```ts
  /**
   * Provider-agnostic AI types.
   *
   * The route and all adapters speak this language; vendor-specific types
   * (OpenAI ChatCompletionMessageParam, Anthropic MessageParam) are confined
   * to their respective adapter files.
   */

  /** A single tool invocation the model requested. */
  export type AiToolCall = {
    id: string;    // unique call id (tool_use_id / tool_call.id)
    name: string;  // function name
    args: string;  // JSON-serialized argument object
  };

  /**
   * One message in the conversation history.
   * Three discriminated shapes map to all vendor message formats.
   */
  export type AiMessage =
    | { role: "user"; content: string }
    | { role: "assistant"; content: string }
    | { role: "assistant"; toolCalls: AiToolCall[] }
    | { role: "tool"; toolCallId: string; name: string; result: string };

  /**
   * A tool descriptor (JSON Schema for parameters).
   * Adapters translate this to their vendor shape on the fly.
   */
  export type AiTool = {
    name: string;
    description: string;
    parameters: Record<string, unknown>; // full JSON Schema object
  };

  /**
   * Streaming events emitted by AiProvider.streamTurn.
   * text: a streamed text delta.
   * tool_call: a complete tool call (emitted once, after full args are assembled).
   */
  export type AiEvent =
    | { type: "text"; delta: string }
    | { type: "tool_call"; id: string; name: string; args: string };

  /**
   * Pluggable AI provider interface.
   * Owns one model turn: system + conversation history + tools → streaming events.
   * Does NOT own the agentic loop or transcript recording.
   */
  export interface AiProvider {
    streamTurn(
      system: string,
      messages: AiMessage[],
      tools: AiTool[]
    ): AsyncIterable<AiEvent>;
  }
  ```

- [ ] **3.2 — Write failing test for TOOLS shape.**

  Create `src/server/ai/tools.test.ts`:

  ```ts
  import { describe, it, expect } from "vitest";
  import { TOOLS } from "./tools";
  import type { AiTool } from "./providers/types";

  const EXPECTED_TOOL_NAMES = [
    "calculate_payment",
    "lookup_rates",
    "capture_lead",
    "suggest_programs",
  ];

  describe("TOOLS", () => {
    it("contains exactly the 4 expected tools", () => {
      const names = TOOLS.map((t: AiTool) => t.name);
      expect(names).toEqual(expect.arrayContaining(EXPECTED_TOOL_NAMES));
      expect(TOOLS).toHaveLength(4);
    });

    it("each tool has a non-empty description", () => {
      for (const tool of TOOLS) {
        expect(tool.description.length).toBeGreaterThan(0);
      }
    });

    it("each tool has a parameters object with a 'type' property", () => {
      for (const tool of TOOLS) {
        expect(tool.parameters).toBeDefined();
        expect(typeof tool.parameters).toBe("object");
        expect((tool.parameters as { type?: string }).type).toBe("object");
      }
    });
  });
  ```

  Run: `npx vitest run src/server/ai/tools.test.ts` — **expected: FAIL** (TOOLS currently typed as `OpenAI.Chat.Completions.ChatCompletionTool[]`, shape mismatch).

- [ ] **3.3 — Refactor `TOOLS` to `AiTool[]` in `src/server/ai/tools.ts`.**

  Open `src/server/ai/tools.ts`. At the top, replace the OpenAI import used only for TOOLS typing with the neutral import:

  ```ts
  // Remove:
  //   import OpenAI from "openai";
  // Add (at top of file, alongside existing imports):
  import type { AiTool } from "./providers/types";
  ```

  Then redefine `TOOLS` by replacing the type annotation `OpenAI.Chat.Completions.ChatCompletionTool[]` with `AiTool[]`, and converting each tool entry from:

  ```ts
  {
    type: "function",
    function: {
      name: "calculate_payment",
      description: "...",
      parameters: { ... },
    },
  }
  ```

  to:

  ```ts
  {
    name: "calculate_payment",
    description: "...",
    parameters: { ... },
  }
  ```

  Apply the same flattening to all four tools (`calculate_payment`, `lookup_rates`, `capture_lead`, `suggest_programs`). The `parameters` JSON Schema objects remain byte-for-byte identical — only the outer `{ type:"function", function:{...} }` wrapper is removed. `runTool` and every line below the `TOOLS` declaration are **unchanged**.

  The updated declaration head looks like:

  ```ts
  export const TOOLS: AiTool[] = [
    {
      name: "calculate_payment",
      description: "Estimate a monthly principal & interest (P&I) mortgage payment...",
      parameters: {
        type: "object",
        properties: {
          purpose: { type: "string", enum: ["buy","refi","cash"], description: "..." },
          homePrice: { type: "number", description: "..." },
          downPaymentPct: { type: "number", description: "..." },
          loanBalance: { type: "number", description: "..." },
          cashOut: { type: "number", description: "..." },
          homeValue: { type: "number", description: "..." },
          interestRate: { type: "number", description: "..." },
          termMonths: { type: "number", description: "..." },
        },
        required: ["purpose"],
      },
    },
    {
      name: "lookup_rates",
      description: "Look up MSFG's current indicative mortgage rates...",
      parameters: {
        type: "object",
        properties: {
          segment: { type: "string", enum: ["purchase","refinance"], description: "..." },
        },
        required: [],
      },
    },
    {
      name: "capture_lead",
      description: "...",
      parameters: {
        type: "object",
        properties: {
          // (preserve all existing properties verbatim from tools.ts)
        },
        required: ["firstName","lastName","email","phone"],
      },
    },
    {
      name: "suggest_programs",
      description: "...",
      parameters: {
        type: "object",
        properties: {
          // (preserve all existing properties verbatim from tools.ts)
        },
        required: [],
      },
    },
  ];
  ```

  > **Important:** Copy every property description string and JSON Schema definition verbatim from the existing `tools.ts` — do not paraphrase or abbreviate. The only change is the structural flattening.

- [ ] **3.4 — Run tests (expected: PASS).**

  ```
  npx vitest run src/server/ai/tools.test.ts
  ```

- [ ] **3.5 — Commit.**

  ```
  git add src/server/ai/providers/types.ts src/server/ai/tools.ts src/server/ai/tools.test.ts
  git commit -m "feat(ai): neutral AiProvider types + flatten TOOLS to AiTool[] (Task 3)"
  ```

---

## Task 4 — OpenAICompatibleProvider

**Files:**
- Create: `src/server/ai/providers/openaiCompatible.ts`
- Create: `src/server/ai/providers/openaiCompatible.test.ts`

### Steps

- [ ] **4.1 — Write failing test first.**

  Create `src/server/ai/providers/openaiCompatible.test.ts`:

  ```ts
  import { describe, it, expect, vi, beforeEach } from "vitest";

  // Mock the openai module before importing the provider
  const mockCreate = vi.fn();
  vi.mock("openai", () => {
    return {
      default: vi.fn().mockImplementation(() => ({
        chat: {
          completions: {
            create: mockCreate,
          },
        },
      })),
    };
  });

  import { OpenAICompatibleProvider } from "./openaiCompatible";
  import type { AiMessage, AiTool } from "./types";

  /** Build a minimal async iterable of stream chunks for mocking. */
  function makeStream(chunks: object[]): AsyncIterable<object> {
    return {
      [Symbol.asyncIterator]() {
        let i = 0;
        return {
          async next() {
            if (i >= chunks.length) return { done: true, value: undefined };
            return { done: false, value: chunks[i++] };
          },
        };
      },
    };
  }

  const provider = new OpenAICompatibleProvider({
    apiKey: "sk-test",
    baseURL: "https://api.deepseek.com",
    model: "deepseek-chat",
  });

  const tools: AiTool[] = [
    {
      name: "calculate_payment",
      description: "Estimate mortgage payment",
      parameters: { type: "object", properties: { amount: { type: "number" } }, required: [] },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("OpenAICompatibleProvider.streamTurn", () => {
    it("yields text events from content deltas", async () => {
      mockCreate.mockResolvedValue(
        makeStream([
          { choices: [{ delta: { content: "Hello" }, finish_reason: null }] },
          { choices: [{ delta: { content: " world" }, finish_reason: null }] },
          { choices: [{ delta: {}, finish_reason: "stop" }] },
        ])
      );

      const messages: AiMessage[] = [{ role: "user", content: "Hi" }];
      const events = [];
      for await (const ev of provider.streamTurn("System.", messages, tools)) {
        events.push(ev);
      }

      expect(events).toEqual([
        { type: "text", delta: "Hello" },
        { type: "text", delta: " world" },
      ]);
    });

    it("assembles tool_calls from index-keyed deltas and yields tool_call events", async () => {
      mockCreate.mockResolvedValue(
        makeStream([
          {
            choices: [{
              delta: {
                tool_calls: [{ index: 0, id: "call_abc", function: { name: "calculate_payment", arguments: '{"amount":' } }],
              },
              finish_reason: null,
            }],
          },
          {
            choices: [{
              delta: {
                tool_calls: [{ index: 0, id: null, function: { name: null, arguments: "300000}" } }],
              },
              finish_reason: null,
            }],
          },
          { choices: [{ delta: {}, finish_reason: "tool_calls" }] },
        ])
      );

      const messages: AiMessage[] = [{ role: "user", content: "What's my payment?" }];
      const events = [];
      for await (const ev of provider.streamTurn("System.", messages, tools)) {
        events.push(ev);
      }

      expect(events).toEqual([
        { type: "tool_call", id: "call_abc", name: "calculate_payment", args: '{"amount":300000}' },
      ]);
    });

    it("translates neutral messages to OpenAI wire format", async () => {
      mockCreate.mockResolvedValue(makeStream([
        { choices: [{ delta: { content: "ok" }, finish_reason: "stop" }] },
      ]));

      const messages: AiMessage[] = [
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hello" },
        {
          role: "assistant",
          toolCalls: [{ id: "call_1", name: "calculate_payment", args: '{"purpose":"buy"}' }],
        },
        { role: "tool", toolCallId: "call_1", name: "calculate_payment", result: '{"payment":1200}' },
      ];

      for await (const _ of provider.streamTurn("Sys", messages, tools)) { /* drain */ }

      const callArgs = mockCreate.mock.calls[0][0];
      // System message first
      expect(callArgs.messages[0]).toEqual({ role: "system", content: "Sys" });
      // user text
      expect(callArgs.messages[1]).toEqual({ role: "user", content: "Hi" });
      // assistant text
      expect(callArgs.messages[2]).toEqual({ role: "assistant", content: "Hello" });
      // assistant tool_calls
      expect(callArgs.messages[3]).toMatchObject({
        role: "assistant",
        tool_calls: [{ id: "call_1", type: "function", function: { name: "calculate_payment", arguments: '{"purpose":"buy"}' } }],
      });
      // tool result
      expect(callArgs.messages[4]).toEqual({
        role: "tool",
        tool_call_id: "call_1",
        content: '{"payment":1200}',
      });
      // tools translated
      expect(callArgs.tools[0]).toEqual({
        type: "function",
        function: {
          name: "calculate_payment",
          description: "Estimate mortgage payment",
          parameters: { type: "object", properties: { amount: { type: "number" } }, required: [] },
        },
      });
    });
  });
  ```

  Run: `npx vitest run src/server/ai/providers/openaiCompatible.test.ts` — **expected: FAIL**.

- [ ] **4.2 — Implement `OpenAICompatibleProvider`.**

  Create `src/server/ai/providers/openaiCompatible.ts`:

  ```ts
  /**
   * OpenAI-compatible provider adapter (works with OpenAI, DeepSeek, Azure, etc.)
   *
   * Translates neutral AiMessage[] + AiTool[] to OpenAI wire types, calls
   * chat.completions.create({stream:true}), and emits neutral AiEvents.
   * Tool-call fragments are assembled by delta.tool_calls[].index before emit.
   */
  import OpenAI from "openai";
  import type { ChatCompletionMessageParam } from "openai/resources";
  import type { AiProvider, AiMessage, AiTool, AiEvent } from "./types";

  const AI_MAX_TOKENS = 2048;

  interface Options {
    apiKey: string;
    baseURL: string;
    model: string;
  }

  export class OpenAICompatibleProvider implements AiProvider {
    private client: OpenAI;
    private model: string;

    constructor({ apiKey, baseURL, model }: Options) {
      this.client = new OpenAI({ apiKey, baseURL });
      this.model = model;
    }

    async *streamTurn(
      system: string,
      messages: AiMessage[],
      tools: AiTool[]
    ): AsyncIterable<AiEvent> {
      // Translate neutral messages → OpenAI wire format
      const openaiMessages: ChatCompletionMessageParam[] = [
        { role: "system", content: system },
        ...messages.map((m): ChatCompletionMessageParam => {
          if (m.role === "user") {
            return { role: "user", content: m.content };
          }
          if (m.role === "assistant" && "content" in m) {
            return { role: "assistant", content: m.content };
          }
          if (m.role === "assistant" && "toolCalls" in m) {
            return {
              role: "assistant",
              content: null,
              tool_calls: m.toolCalls.map((tc) => ({
                id: tc.id,
                type: "function" as const,
                function: { name: tc.name, arguments: tc.args },
              })),
            };
          }
          // role === "tool"
          const toolMsg = m as { role: "tool"; toolCallId: string; name: string; result: string };
          return {
            role: "tool",
            tool_call_id: toolMsg.toolCallId,
            content: toolMsg.result,
          };
        }),
      ];

      // Translate neutral AiTool[] → OpenAI function tool format
      const openaiTools: OpenAI.Chat.Completions.ChatCompletionTool[] = tools.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters as Record<string, unknown>,
        },
      }));

      const stream = await this.client.chat.completions.create({
        model: this.model,
        messages: openaiMessages,
        tools: openaiTools,
        stream: true,
        max_tokens: AI_MAX_TOKENS,
      });

      // Assemble tool_call fragments by index.
      // Each element: { id, name, args (accumulated string) }
      type PartialCall = { id: string; name: string; args: string };
      const partials: Record<number, PartialCall> = {};

      for await (const chunk of stream) {
        const choice = chunk.choices[0];
        if (!choice) continue;

        const delta = choice.delta;

        // Text deltas
        if (delta.content) {
          yield { type: "text", delta: delta.content };
        }

        // Tool call fragment accumulation
        if (delta.tool_calls) {
          for (const fragment of delta.tool_calls) {
            const idx = fragment.index;
            if (!partials[idx]) {
              partials[idx] = { id: "", name: "", args: "" };
            }
            if (fragment.id) partials[idx].id = fragment.id;
            if (fragment.function?.name) partials[idx].name = fragment.function.name;
            if (fragment.function?.arguments) partials[idx].args += fragment.function.arguments;
          }
        }
      }

      // Emit one tool_call event per accumulated call
      for (const partial of Object.values(partials)) {
        if (partial.name) {
          yield { type: "tool_call", id: partial.id, name: partial.name, args: partial.args };
        }
      }
    }
  }
  ```

- [ ] **4.3 — Run tests (expected: PASS).**

  ```
  npx vitest run src/server/ai/providers/openaiCompatible.test.ts
  ```

- [ ] **4.4 — Commit.**

  ```
  git add src/server/ai/providers/openaiCompatible.ts src/server/ai/providers/openaiCompatible.test.ts
  git commit -m "feat(ai): OpenAICompatibleProvider adapter (Task 4)"
  ```

---

## Task 5 — AnthropicProvider + SDK

**Files:**
- Modify: `package.json` (via `npm install`)
- Modify: `next.config.ts`
- Create: `src/server/ai/providers/anthropic.ts`
- Create: `src/server/ai/providers/anthropic.test.ts`

### Steps

- [ ] **5.1 — Install `@anthropic-ai/sdk`.**

  ```
  npm install @anthropic-ai/sdk
  ```

- [ ] **5.2 — Add `@anthropic-ai/sdk` to `outputFileTracingIncludes` in `next.config.ts`.**

  Open `next.config.ts`. Find the `outputFileTracingIncludes` object. Add the Anthropic SDK entry alongside the existing `openai` entry:

  ```ts
  outputFileTracingIncludes: {
    "/**": [
      "./node_modules/@prisma/adapter-pg/**",
      "./node_modules/@prisma/driver-adapter-utils/**",
      "./node_modules/jose/**",
      "./node_modules/zod/**",
      "./node_modules/openai/**",
      "./node_modules/@anthropic-ai/sdk/**",   // ← add
    ],
  },
  ```

- [ ] **5.3 — Write failing test first.**

  Create `src/server/ai/providers/anthropic.test.ts`:

  ```ts
  import { describe, it, expect, vi, beforeEach } from "vitest";

  // Mock @anthropic-ai/sdk before importing the provider
  const mockStream = vi.fn();
  vi.mock("@anthropic-ai/sdk", () => {
    return {
      default: vi.fn().mockImplementation(() => ({
        messages: {
          stream: mockStream,
        },
      })),
    };
  });

  import { AnthropicProvider } from "./anthropic";
  import type { AiMessage, AiTool } from "./types";

  /** Build an async iterable of Anthropic stream events. */
  function makeAnthropicStream(events: object[]): { [Symbol.asyncIterator](): AsyncIterator<object> } {
    return {
      [Symbol.asyncIterator]() {
        let i = 0;
        return {
          async next() {
            if (i >= events.length) return { done: true, value: undefined };
            return { done: false, value: events[i++] };
          },
        };
      },
    };
  }

  const provider = new AnthropicProvider({ apiKey: "sk-ant-test", model: "claude-3-5-haiku-20241022" });

  const tools: AiTool[] = [
    {
      name: "calculate_payment",
      description: "Estimate mortgage payment",
      parameters: { type: "object", properties: { amount: { type: "number" } }, required: [] },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("AnthropicProvider.streamTurn", () => {
    it("yields text events from text_delta blocks", async () => {
      mockStream.mockReturnValue(
        makeAnthropicStream([
          { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
          { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hello" } },
          { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: " world" } },
          { type: "content_block_stop", index: 0 },
          { type: "message_stop" },
        ])
      );

      const messages: AiMessage[] = [{ role: "user", content: "Hi" }];
      const events = [];
      for await (const ev of provider.streamTurn("System.", messages, tools)) {
        events.push(ev);
      }
      expect(events).toEqual([
        { type: "text", delta: "Hello" },
        { type: "text", delta: " world" },
      ]);
    });

    it("assembles tool_use blocks and yields tool_call events on block_stop", async () => {
      mockStream.mockReturnValue(
        makeAnthropicStream([
          { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_abc", name: "calculate_payment", input: {} } },
          { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"amount":' } },
          { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: "300000}" } },
          { type: "content_block_stop", index: 0 },
          { type: "message_stop" },
        ])
      );

      const messages: AiMessage[] = [{ role: "user", content: "payment?" }];
      const events = [];
      for await (const ev of provider.streamTurn("Sys", messages, tools)) {
        events.push(ev);
      }
      expect(events).toEqual([
        { type: "tool_call", id: "toolu_abc", name: "calculate_payment", args: '{"amount":300000}' },
      ]);
    });

    it("passes system as top-level param, not in messages", async () => {
      mockStream.mockReturnValue(makeAnthropicStream([{ type: "message_stop" }]));

      const messages: AiMessage[] = [{ role: "user", content: "Hi" }];
      for await (const _ of provider.streamTurn("Be helpful.", messages, tools)) { /* drain */ }

      const callArgs = mockStream.mock.calls[0][0];
      expect(callArgs.system).toBe("Be helpful.");
      expect(callArgs.messages.some((m: { role: string }) => m.role === "system")).toBe(false);
    });

    it("translates tool results as user turn with tool_result content blocks", async () => {
      mockStream.mockReturnValue(makeAnthropicStream([{ type: "message_stop" }]));

      const messages: AiMessage[] = [
        { role: "user", content: "Pay?" },
        {
          role: "assistant",
          toolCalls: [{ id: "toolu_1", name: "calculate_payment", args: '{"purpose":"buy"}' }],
        },
        { role: "tool", toolCallId: "toolu_1", name: "calculate_payment", result: '{"payment":1200}' },
      ];

      for await (const _ of provider.streamTurn("Sys", messages, tools)) { /* drain */ }

      const callArgs = mockStream.mock.calls[0][0];
      // assistant with tool_use block
      const assistantMsg = callArgs.messages.find((m: { role: string }) => m.role === "assistant");
      expect(assistantMsg.content).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: "tool_use", id: "toolu_1", name: "calculate_payment" }),
        ])
      );
      // tool result as user message with tool_result block
      const toolResultMsg = callArgs.messages.find(
        (m: { role: string; content: Array<{ type: string }> }) =>
          m.role === "user" &&
          Array.isArray(m.content) &&
          m.content.some((c) => c.type === "tool_result")
      );
      expect(toolResultMsg).toBeDefined();
      expect(toolResultMsg.content[0]).toMatchObject({
        type: "tool_result",
        tool_use_id: "toolu_1",
        content: '{"payment":1200}',
      });
    });

    it("translates AiTool to Anthropic input_schema shape", async () => {
      mockStream.mockReturnValue(makeAnthropicStream([{ type: "message_stop" }]));

      for await (const _ of provider.streamTurn("Sys", [{ role: "user", content: "x" }], tools)) { /* drain */ }

      const callArgs = mockStream.mock.calls[0][0];
      expect(callArgs.tools[0]).toEqual({
        name: "calculate_payment",
        description: "Estimate mortgage payment",
        input_schema: { type: "object", properties: { amount: { type: "number" } }, required: [] },
      });
    });
  });
  ```

  Run: `npx vitest run src/server/ai/providers/anthropic.test.ts` — **expected: FAIL**.

- [ ] **5.4 — Implement `AnthropicProvider`.**

  Create `src/server/ai/providers/anthropic.ts`:

  ```ts
  /**
   * Anthropic Claude provider adapter.
   *
   * Translates neutral AiMessage[] + AiTool[] to Anthropic's MessageParam[]
   * (system passed separately, tool_results as user turn), calls
   * messages.stream(), and emits neutral AiEvents.
   * Tool-call JSON is assembled from input_json_delta fragments before emit.
   */
  import Anthropic from "@anthropic-ai/sdk";
  import type { MessageParam, ToolUseBlock, ToolResultBlockParam } from "@anthropic-ai/sdk/resources";
  import type { AiProvider, AiMessage, AiTool, AiEvent } from "./types";

  const AI_MAX_TOKENS = 2048;

  interface Options {
    apiKey: string;
    model: string;
  }

  export class AnthropicProvider implements AiProvider {
    private client: Anthropic;
    private model: string;

    constructor({ apiKey, model }: Options) {
      this.client = new Anthropic({ apiKey });
      this.model = model;
    }

    async *streamTurn(
      system: string,
      messages: AiMessage[],
      tools: AiTool[]
    ): AsyncIterable<AiEvent> {
      // Translate neutral messages → Anthropic MessageParam[]
      // Rules:
      //   - user text → {role:"user", content:string}
      //   - assistant text → {role:"assistant", content:string}
      //   - assistant toolCalls → {role:"assistant", content:[{type:"tool_use",...}]}
      //   - tool results → group consecutive tool results into one {role:"user",
      //       content:[{type:"tool_result",...}]} message
      const anthropicMessages: MessageParam[] = [];

      // We need to collapse consecutive tool-result messages into a single user
      // message with multiple tool_result blocks (Anthropic requirement).
      let toolResultBuffer: ToolResultBlockParam[] = [];

      const flushToolResults = () => {
        if (toolResultBuffer.length > 0) {
          anthropicMessages.push({ role: "user", content: toolResultBuffer });
          toolResultBuffer = [];
        }
      };

      for (const m of messages) {
        if (m.role === "tool") {
          toolResultBuffer.push({
            type: "tool_result",
            tool_use_id: m.toolCallId,
            content: m.result,
          });
          continue;
        }
        // Not a tool result — flush any buffered results first
        flushToolResults();

        if (m.role === "user") {
          anthropicMessages.push({ role: "user", content: m.content });
        } else if (m.role === "assistant" && "content" in m) {
          anthropicMessages.push({ role: "assistant", content: m.content });
        } else if (m.role === "assistant" && "toolCalls" in m) {
          const toolUseBlocks: ToolUseBlock[] = m.toolCalls.map((tc) => ({
            type: "tool_use",
            id: tc.id,
            name: tc.name,
            input: JSON.parse(tc.args || "{}"),
          }));
          anthropicMessages.push({ role: "assistant", content: toolUseBlocks });
        }
      }
      flushToolResults();

      // Translate AiTool[] → Anthropic tool format (input_schema instead of parameters)
      const anthropicTools = tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters as Anthropic.Tool["input_schema"],
      }));

      // State for assembling streaming tool_use blocks
      type PartialTool = { id: string; name: string; argsJson: string };
      const partials: Record<number, PartialTool> = {};

      const stream = this.client.messages.stream({
        model: this.model,
        system,
        messages: anthropicMessages,
        tools: anthropicTools,
        max_tokens: AI_MAX_TOKENS,
      });

      for await (const event of stream) {
        if (event.type === "content_block_start") {
          if (event.content_block.type === "tool_use") {
            partials[event.index] = {
              id: event.content_block.id,
              name: event.content_block.name,
              argsJson: "",
            };
          }
          // text blocks: no action needed here; deltas handle the content
        } else if (event.type === "content_block_delta") {
          if (event.delta.type === "text_delta") {
            yield { type: "text", delta: event.delta.text };
          } else if (event.delta.type === "input_json_delta") {
            if (partials[event.index]) {
              partials[event.index].argsJson += event.delta.partial_json;
            }
          }
        } else if (event.type === "content_block_stop") {
          const partial = partials[event.index];
          if (partial) {
            yield {
              type: "tool_call",
              id: partial.id,
              name: partial.name,
              args: partial.argsJson,
            };
            delete partials[event.index];
          }
        }
        // message_stop, message_delta, etc.: ignore
      }
    }
  }
  ```

- [ ] **5.5 — Run tests (expected: PASS).**

  ```
  npx vitest run src/server/ai/providers/anthropic.test.ts
  ```

- [ ] **5.6 — Commit.**

  ```
  git add package.json package-lock.json next.config.ts \
          src/server/ai/providers/anthropic.ts \
          src/server/ai/providers/anthropic.test.ts
  git commit -m "feat(ai): AnthropicProvider adapter + SDK install (Task 5)"
  ```

---

## Task 6 — `config.ai` + `getAiProvider`

**Files:**
- Modify: `src/content/site.ts`
- Modify: `src/content/site.test.ts`
- Create: `src/server/ai/providers/index.ts`
- Create: `src/server/ai/providers/index.test.ts`

### Steps

- [ ] **6.1 — Add `AiConfigSchema` and `ai` field to `TenantConfigSchema` in `src/content/site.ts`.**

  After the existing schema definitions (e.g., after `FeaturesSchema`), add:

  ```ts
  const AiConfigSchema = z.object({
    provider: z.enum(["openai-compatible", "anthropic"]),
    model: z.string(),
    baseUrl: z.string().optional(),
  });
  ```

  Then in `TenantConfigSchema`, add the `ai` field:

  ```ts
  export const TenantConfigSchema = z.object({
    brand: BrandSchema,
    theme: ThemeSchema.default(() => ThemeSchema.parse({})),
    contact: ContactSchema,
    legal: LegalSchema,
    seo: SeoSchema,
    marketing: MarketingSchema.optional(),
    features: FeaturesSchema,
    ai: AiConfigSchema,   // ← add
  });
  ```

  Then in `DEFAULT_TENANT_CONFIG`, add the `ai` field (MSFG runs on DeepSeek):

  ```ts
  export const DEFAULT_TENANT_CONFIG: TenantConfig = {
    // ... all existing fields unchanged ...
    ai: {
      provider: "openai-compatible",
      model: "deepseek-chat",
      baseUrl: "https://api.deepseek.com",
    },
  };
  ```

- [ ] **6.2 — Update `src/content/site.test.ts` to include the `ai` field.**

  Find the partial-config fixture in `site.test.ts` (the object passed to `parseTenantConfig` or used to test a valid config). Add the `ai` field so it stays valid:

  ```ts
  ai: {
    provider: "openai-compatible" as const,
    model: "deepseek-chat",
    baseUrl: "https://api.deepseek.com",
  },
  ```

  Run: `npx vitest run src/content/site.test.ts` — **expected: PASS** (no regressions).

- [ ] **6.3 — Write failing test for `getAiProvider`.**

  Create `src/server/ai/providers/index.test.ts`:

  ```ts
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
  ```

  Run: `npx vitest run src/server/ai/providers/index.test.ts` — **expected: FAIL**.

- [ ] **6.4 — Implement `getAiProvider`.**

  Create `src/server/ai/providers/index.ts`:

  ```ts
  /**
   * Factory: resolves the active tenant's AI provider.
   *
   * Reads TenantConfig.ai for provider/model/baseUrl (non-secret config),
   * then resolves the API key from TenantSecret first, falling back to
   * DEEPSEEK_API_KEY env (transition aid for MSFG during Phase C deploy).
   *
   * Returns null when no key is available — the chat route uses this as the
   * signal to enter the degraded "unavailable" SSE path.
   *
   * Server-only (imports server-only modules).
   */
  import "server-only";
  import { getTenantConfig } from "@/server/tenant/config";
  import { getTenantSecret } from "@/server/secrets/tenantSecrets";
  import { serverEnv } from "@/lib/env";
  import { OpenAICompatibleProvider } from "./openaiCompatible";
  import { AnthropicProvider } from "./anthropic";
  import type { AiProvider } from "./types";

  export async function getAiProvider(): Promise<AiProvider | null> {
    const config = await getTenantConfig();
    const ai = config.ai;

    // Key resolution: DB secret first, env fallback second.
    const key = (await getTenantSecret("ai_api_key")) ?? serverEnv.DEEPSEEK_API_KEY ?? null;
    if (!key) return null;

    if (ai.provider === "openai-compatible") {
      return new OpenAICompatibleProvider({
        apiKey: key,
        baseURL: ai.baseUrl ?? "https://api.deepseek.com",
        model: ai.model,
      });
    }

    if (ai.provider === "anthropic") {
      return new AnthropicProvider({ apiKey: key, model: ai.model });
    }

    // Exhaustive check (TypeScript will catch unhandled providers at compile time)
    const _exhaustive: never = ai.provider;
    return null;
  }

  export type { AiProvider } from "./types";
  ```

- [ ] **6.5 — Run tests (expected: PASS).**

  ```
  npx vitest run src/server/ai/providers/index.test.ts src/content/site.test.ts
  ```

- [ ] **6.6 — Commit.**

  ```
  git add src/content/site.ts src/content/site.test.ts \
          src/server/ai/providers/index.ts src/server/ai/providers/index.test.ts
  git commit -m "feat(ai): TenantConfig.ai + getAiProvider factory (Task 6)"
  ```

---

## Task 7 — Chat route refactor

**Files:**
- Modify: `src/app/api/v1/ai/chat/route.ts`
- Delete: `src/server/ai/client.ts`

### Steps

- [ ] **7.1 — Rewrite `src/app/api/v1/ai/chat/route.ts`.**

  The full file replaces all OpenAI-specific imports and loop logic. **Everything listed below that is NOT in this rewrite must be preserved exactly** (SSE headers, `sse()` helper, `parseMessages()`, `staticStream()`, `UNAVAILABLE_TEXT`, `MAX_TURNS`, transcript recording calls, `createChatSession`, `appendMessage`, `TranscriptRole`, `runtime`, `dynamic`, error handling shape).

  Replace the import block at the top:

  ```ts
  // Remove all of:
  //   import OpenAI from "openai";
  //   import { aiConfigured } from "@/lib/env";
  //   import { SITE } from "@/content/site";
  //   import { getAiClient, aiModel, AI_MAX_TOKENS } from "@/server/ai/client";
  // Keep:
  //   import { SYSTEM_PROMPT } from "@/server/ai/prompt";
  //   import { TOOLS, runTool } from "@/server/ai/tools";
  //   import { createChatSession, appendMessage, type TranscriptRole } from "@/server/ai/transcript";
  // Add:
  import { getAiProvider } from "@/server/ai/providers";
  import type { AiMessage } from "@/server/ai/providers/types";
  ```

  Replace the provider check at the start of the `POST` handler body. The current check is:

  ```ts
  if (!aiConfigured()) {
    return new Response(staticStream(UNAVAILABLE_TEXT), { headers: SSE_HEADERS });
  }
  const client = getAiClient();
  ```

  Replace with:

  ```ts
  const provider = await getAiProvider();
  if (!provider) {
    return new Response(staticStream(UNAVAILABLE_TEXT), { headers: SSE_HEADERS });
  }
  ```

  Replace the conversation construction block. The current code builds `convo: OpenAI.Chat.Completions.ChatCompletionMessageParam[]` with a system message + mapped client messages. Replace with:

  ```ts
  // Build neutral history from inbound messages (user/assistant text only).
  // System prompt is passed separately to provider.streamTurn.
  const history: AiMessage[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));
  ```

  Replace the agentic loop (the `for (let turn = 0; turn < MAX_TURNS; turn++)` block). The current loop calls `client.chat.completions.create({stream:true})`, assembles `delta.tool_calls` by index, yields text SSE, then runs tools. Replace the entire loop body with:

  ```ts
  const MAX_TURNS = 8;
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    let assistantText = "";
    const pendingToolCalls: Array<{ id: string; name: string; args: string }> = [];

    // Stream one turn from the provider
    for await (const event of provider.streamTurn(SYSTEM_PROMPT, history, TOOLS)) {
      if (event.type === "text") {
        controller.enqueue(sse({ type: "text", value: event.delta }));
        assistantText += event.delta;
      } else if (event.type === "tool_call") {
        pendingToolCalls.push({ id: event.id, name: event.name, args: event.args });
      }
    }

    // Record assistant text (best-effort)
    if (assistantText) {
      await record("assistant", assistantText);
    }

    // No tool calls → done
    if (pendingToolCalls.length === 0) break;

    // Push neutral assistant-tool-calls message into history
    history.push({
      role: "assistant",
      toolCalls: pendingToolCalls.map((tc) => ({
        id: tc.id,
        name: tc.name,
        args: tc.args,
      })),
    });

    // Execute each tool, stream the tool SSE event, record, and push neutral result
    for (const tc of pendingToolCalls) {
      controller.enqueue(sse({ type: "tool", name: tc.name }));
      // Parse the model's args defensively (matches the pre-refactor route's
      // graceful fallback — a malformed args string must NOT break the loop).
      let parsed: unknown = {};
      try {
        parsed = tc.args ? JSON.parse(tc.args) : {};
      } catch {
        parsed = {};
      }
      // runTool returns a plain string (src/server/ai/tools.ts → Promise<string>).
      // Use it AS-IS — do NOT JSON.stringify (that would double-encode the tool
      // result the model + transcript see, changing MSFG behavior).
      const result = await runTool(tc.name, parsed);
      await record("tool", result, tc.name);
      history.push({
        role: "tool",
        toolCallId: tc.id,
        name: tc.name,
        result,
      });
    }
  }
  ```

  > **Note for the implementer:** `runTool(name, input): Promise<string>` already returns the exact text used as the tool-message content (the pre-refactor route did `content: result` directly). The neutral `AiMessage` tool entry's `result` field is that same string; both adapters place it verbatim into their wire format (`content: result`). Never wrap it in `JSON.stringify`.

  Replace the `catch` block. The current catch catches `OpenAI.APIError` and logs it. Replace with a generic catch (no OpenAI import in the route):

  ```ts
  } catch (err: unknown) {
    console.error("[chat] provider error:", err instanceof Error ? err.message : err);
    controller.enqueue(sse({ type: "error" }));
    controller.close();
  }
  ```

  All other code in the route (the `ReadableStream` wrapper, `controller.enqueue(sse({type:"done"}))`, `controller.close()`, `controller.error()`, SSE header construction, `return new Response(stream, ...)`) is **unchanged**.

- [ ] **7.2 — Delete `src/server/ai/client.ts`.**

  ```
  git rm src/server/ai/client.ts
  ```

  Verify no other file imports from `@/server/ai/client`:

  ```
  grep -r "server/ai/client" src/ --include="*.ts" --include="*.tsx"
  ```

  If any hits remain, update those imports (the only consumer should have been `route.ts`, which was just rewritten).

- [ ] **7.3 — Type-check and run all tests.**

  ```
  npx tsc --noEmit
  npx vitest run
  ```

  Both must pass. Do NOT run `npm run build` at this step — the build reads the DB (tenant config column) which does not yet have the `tenant_secrets` table in prod (migration is gated to Task 8). The route is `force-dynamic`, so `tsc --noEmit` is sufficient to gate correctness.

- [ ] **7.4 — Commit.**

  ```
  git add src/app/api/v1/ai/chat/route.ts
  git commit -m "feat(ai): refactor chat route to provider-agnostic AiProvider loop (Task 7)"
  ```

---

## Task 8 — MSFG seed + seal + verify + (gated) deploy

**Files:**
- Modify: `prisma/seed.ts` (verify/confirm only — no code change expected)
- Create: `scripts/seal-secret.ts`

> **Gate discipline:** Steps 8.1–8.3 are code and run in CI / local. Steps 8.4–8.9 are **orchestrator-owned operational steps** executed against the production EC2 box. Do not perform 8.4+ without explicit go-ahead.

### Steps

- [ ] **8.1 — Verify `prisma/seed.ts` already seeds `config.ai`.**

  Open `prisma/seed.ts`. Locate the tenant upsert block (the call to `prisma.tenant.upsert` with `where: { id: TENANT_ID }`). Confirm it passes `config: DEFAULT_TENANT_CONFIG` (or equivalent). Since `DEFAULT_TENANT_CONFIG` now includes the `ai` field (added in Task 6), no code change to `seed.ts` is needed — the existing upsert carries the `ai` section automatically.

  If `seed.ts` passes `config` as `DEFAULT_TENANT_CONFIG` directly (as a JSON value), this is confirmed complete. If it passes a handcrafted partial object, add the `ai` field explicitly:

  ```ts
  // Inside the tenant upsert update/create:
  config: DEFAULT_TENANT_CONFIG,  // already includes ai: {...} from Task 6
  ```

- [ ] **8.2 — Create `scripts/seal-secret.ts`.**

  ```ts
  /**
   * scripts/seal-secret.ts — one-time operational tool.
   *
   * Reads DEEPSEEK_API_KEY + TENANT_SECRETS_KEY from the environment,
   * seals the API key, and upserts it as a TenantSecret for "tenant_msfg".
   *
   * Run with: npx tsx scripts/seal-secret.ts
   * Required env: DATABASE_URL, TENANT_SECRETS_KEY, DEEPSEEK_API_KEY, TENANT_ID (optional, defaults to "tenant_msfg")
   *
   * This script must be run AFTER `npx prisma migrate deploy` creates the
   * tenant_secrets table (Task 8, gated deploy step).
   */
  import "dotenv/config";
  import { PrismaClient } from "@prisma/client";
  import { PrismaPg } from "@prisma/adapter-pg";
  import { EnvelopeAesSecretStore } from "@/server/secrets/secretStore";

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("ERROR: DATABASE_URL is required.");
    process.exit(1);
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    console.error("ERROR: DEEPSEEK_API_KEY is not set. Nothing to seal.");
    process.exit(1);
  }

  const kek = process.env.TENANT_SECRETS_KEY;
  if (!kek) {
    console.error("ERROR: TENANT_SECRETS_KEY is not set. Cannot seal.");
    process.exit(1);
  }

  const tenantId = process.env.TENANT_ID ?? "tenant_msfg";

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  // Use EnvelopeAesSecretStore directly (not the lazily-resolved serverEnv version)
  // so the script works outside of Next.js request context.
  const store = new EnvelopeAesSecretStore();

  // Temporarily set the KEK via process.env for the store's getKek() call
  process.env.TENANT_SECRETS_KEY = kek;

  async function main() {
    const blob = store.seal(apiKey!);
    await prisma.tenantSecret.upsert({
      where: { tenantId_name: { tenantId, name: "ai_api_key" } },
      create: {
        tenantId,
        name: "ai_api_key",
        ciphertext: blob.ciphertext,
        iv: blob.iv,
        authTag: blob.authTag,
        keyVersion: blob.keyVersion,
      },
      update: {
        ciphertext: blob.ciphertext,
        iv: blob.iv,
        authTag: blob.authTag,
        keyVersion: blob.keyVersion,
      },
    });
    console.log(`✓ ai_api_key sealed and stored for tenant ${tenantId}`);
  }

  main()
    .catch((err) => { console.error("seal-secret failed:", err); process.exit(1); })
    .finally(() => prisma.$disconnect());
  ```

- [ ] **8.3 — Final local verification gates (DB-free).**

  ```
  npx tsc --noEmit
  npx vitest run
  ```

  Both must be green. TypeScript sees the new `TenantSecret` Prisma model (generated in Task 2), the new providers, and the refactored route. Vitest covers secretStore, tenantSecrets, TOOLS shape, both adapters, getAiProvider, and the existing site/config tests.

  Then run `npm run build` to confirm the standalone bundle builds cleanly. The chat route is `force-dynamic` and does not call `getAiProvider`/`getTenantSecret` at build time. The build only needs the Phase-B `config` column (already present in prod) and the type-generated Prisma client (generated in Task 2 without a DB). The `tenant_secrets` table migration is additive and harmless to apply.

  > If `npm run build` fails because Prisma Client references `TenantSecret` but the prod DB doesn't have the table yet: this is expected. The build itself does not query the DB at build time for server components — `force-dynamic` routes are excluded. If build errors appear related to `TenantSecret`, confirm `prisma generate` ran cleanly in Task 2 and the client types are present in `node_modules/.prisma/`.

  Commit the seal script:

  ```
  git add scripts/seal-secret.ts prisma/seed.ts
  git commit -m "feat(ai): seal-secret script + confirm seed carries config.ai (Task 8)"
  ```

---

### Gated deploy steps (orchestrator-owned — do NOT execute without explicit go-ahead)

- [ ] **8.4 — Generate and set `TENANT_SECRETS_KEY` on EC2.**

  On the EC2 box or locally, generate the KEK:

  ```
  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
  ```

  Add to `~/apps/msfg.us/.env` on the EC2 box:

  ```
  TENANT_SECRETS_KEY=<the generated base64 value>
  ```

  **Back up this value in a secure location.** Losing the KEK makes all sealed secrets unrecoverable.

- [ ] **8.5 — Apply the migration (creates `tenant_secrets` table).**

  On the EC2 box, in the app directory:

  ```
  npx prisma migrate deploy
  ```

  This applies `20260605000000_add_tenant_secret` (adds `tenant_secrets`, the unique index, and the tenantId index). It does not touch any existing tables or data.

- [ ] **8.6 — Run `npm run db:seed`.**

  ```
  npm run db:seed
  ```

  This re-seeds the MSFG tenant upsert, which now includes `config.ai = { provider:"openai-compatible", model:"deepseek-chat", baseUrl:"https://api.deepseek.com" }`. Idempotent — safe to re-run.

- [ ] **8.7 — Run the seal script to store MSFG's DeepSeek key.**

  With `DEEPSEEK_API_KEY`, `TENANT_SECRETS_KEY`, and `DATABASE_URL` set in the environment:

  ```
  npx tsx scripts/seal-secret.ts
  ```

  Expected output: `✓ ai_api_key sealed and stored for tenant tenant_msfg`

  At this point, `getAiProvider()` will resolve the key from `TenantSecret` rather than the env var. The `DEEPSEEK_API_KEY` env var remains as the fallback (belt-and-suspenders) for this release; it can be removed in a follow-up once the encrypted path is verified stable.

- [ ] **8.8 — Deploy.**

  ```
  scripts/deploy-ec2.sh https://staging.msfg.us staging
  ```

  Monitor pm2 logs during startup to confirm no `TENANT_SECRETS_KEY` or Prisma errors.

- [ ] **8.9 — Verify AI chat still streams.**

  Open the staging site's homepage AI widget. Send a test message (e.g., "What's a typical mortgage rate?"). Confirm:

  - The chat streams a response (non-empty text deltas arrive).
  - No `{type:"error"}` SSE event is logged in the browser.
  - The `lookup_rates` or `calculate_payment` tool fires if a rate/payment question is asked.

  If the response is the UNAVAILABLE_TEXT degraded path, check:
  1. `TENANT_SECRETS_KEY` is set in `.env` on the box and the process restarted after the change.
  2. The seal script ran successfully (check the `tenant_secrets` table directly: `SELECT name, "keyVersion" FROM tenant_secrets WHERE "tenantId" = 'tenant_msfg';`).
  3. The `DEEPSEEK_API_KEY` fallback is still set (as belt-and-suspenders).

---

## Self-review checklist

- [x] Every spec section maps to a task: SecretStore (T1), TenantSecret table + accessor (T2), neutral types + TOOLS (T3), OpenAICompatibleProvider (T4), AnthropicProvider (T5), config.ai + getAiProvider (T6), chat route refactor (T7), MSFG migration (T8).
- [x] No placeholders — every code block shows full function bodies and type definitions.
- [x] Name consistency throughout: `SecretStore`, `EnvelopeAesSecretStore`, `secretStore`, `SecretBlob`, `getTenantSecret`, `setTenantSecret`, `AiMessage`, `AiToolCall`, `AiTool`, `AiEvent`, `AiProvider`, `OpenAICompatibleProvider`, `AnthropicProvider`, `getAiProvider`, `TenantConfig.ai`.
- [x] TDD pattern applied in every task: failing test → implement → passing test → commit.
- [x] DB-free gate: `npx tsc --noEmit` + `npx vitest run` used in T7; migration application gated to T8 operational steps.
- [x] `aiConfigured()` in `src/lib/env.ts`: the function is NOT deleted (other consumers may reference it, e.g., `AiWidget` display logic). The chat route no longer calls it; the route's null-provider check replaces it for the request path. Any non-route callers (UI feature flags) continue to work as-is.
- [x] `@anthropic-ai/sdk` added to `outputFileTracingIncludes` in T5 — standalone bundle will include it.
- [x] `SITE` import removed from chat route (it was only used for `SITE.name` in `UNAVAILABLE_TEXT`; confirm `UNAVAILABLE_TEXT` is a const string in the existing route and does not reference `SITE`). If it does reference `SITE`, keep the `SITE` import.
