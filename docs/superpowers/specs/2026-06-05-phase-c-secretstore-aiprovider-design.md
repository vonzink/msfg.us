# Design: Phase C — SecretStore + pluggable AiProvider

**Status:** Approved (design) · **Scope:** Phase C, slice 1 of the platform "Providers & integrations" phase · **Date:** 2026-06-05
**Builds on:** Phase A (tenant scoping) + Phase B (`TenantConfig` JSON on `Tenant`, `getTenantConfig()`). Platform design: `2026-06-04-multi-tenant-platform-design.md` §4 (AI providers) + §Security (secrets).

## Context

The AI assistant is hardwired to DeepSeek: `src/server/ai/client.ts` builds a singleton `OpenAI` client from global env (`DEEPSEEK_API_KEY`/`DEEPSEEK_BASE_URL`/`DEEPSEEK_MODEL`), and `src/app/api/v1/ai/chat/route.ts` runs a manual agentic tool loop in OpenAI's wire format. To run different AI providers per tenant — and to stop storing provider keys as global env — Phase C introduces two interfaces: a **`SecretStore`** (AES-256-GCM envelope encryption) and a **pluggable `AiProvider`** with OpenAI-compatible (OpenAI/DeepSeek) and Anthropic (Claude) adapters, selected per tenant from config. MSFG stays on `deepseek-chat`, behaving **identically**.

**Decomposition note:** the platform doc's "Phase C" also migrates GHL/Cognito/LOS creds into encrypted secrets. That is deferred to a focused **C2** (same `SecretStore` + config patterns, mostly mechanical). This spec is **SecretStore + AiProvider only**.

## Goals / Non-goals

**Goals:**
- A `SecretStore` interface + `EnvelopeAesSecretStore` (AES-256-GCM, env KEK) and a tenant-scoped secret accessor.
- An `AiProvider` interface with **two real adapters** (OpenAI-compatible, Anthropic) so the abstraction is proven, not theoretical.
- Per-tenant AI selection from `TenantConfig.ai` (provider/model/baseUrl); the key resolved from `SecretStore` with an env fallback.
- The chat route becomes provider-agnostic with **zero behavior change for MSFG** (same SSE protocol, tools, guardrails, transcript recording, degraded path).

**Non-goals (later):** GHL/Cognito/LOS cred migration (**C2**); the RAG `KnowledgeRetriever`; a KMS `SecretStore` backend; key-rotation tooling/UX (the `keyVersion` column ships, the rotation workflow does not); per-tenant tool sets or system prompts (shared for now).

## Decisions locked

| Decision | Choice |
|---|---|
| Loop ownership | **Route owns the agentic loop; provider normalizes one turn.** A neutral `AiMessage[]` history; `provider.streamTurn(...)` yields normalized events. |
| Adapters | Build **both** `OpenAICompatibleProvider` (OpenAI/DeepSeek) and `AnthropicProvider` (Claude) now. |
| Secrets crypto | **AES-256-GCM** envelope, env KEK `TENANT_SECRETS_KEY` (base64 32 bytes), pure Node `crypto`, persist `{ciphertext, iv, authTag, keyVersion}`. |
| Key resolution | Key = `TenantSecret` named `ai_api_key`, opened via `SecretStore`; **env fallback** (`DEEPSEEK_API_KEY`) when absent, so MSFG never breaks mid-migration. |
| MSFG migration | Add `TENANT_SECRETS_KEY`; seal MSFG's DeepSeek key into a `TenantSecret`; seed `config.ai` = deepseek. Env fallback is the safety net. |
| AI config home | A new `ai` section on the Phase B `TenantConfig` (non-secret: provider/model/baseUrl). |

## Architecture

### 1. SecretStore (AES-256-GCM) — `src/server/secrets/`
- **`SecretStore` interface:** `seal(plaintext: string) → SecretBlob` and `open(blob: SecretBlob) → string`, where `SecretBlob = { ciphertext: string; iv: string; authTag: string; keyVersion: number }` (all base64). Pure crypto — no tenant, no DB.
- **`EnvelopeAesSecretStore`** (default): Node `crypto` `aes-256-gcm`. `seal` → random 96-bit IV, `createCipheriv`, capture `getAuthTag()`. `open` → `createDecipheriv` + `setAuthTag` (throws on tamper — authenticated). KEK = `base64Decode(env.TENANT_SECRETS_KEY)` (must be 32 bytes; validated on first use). `keyVersion` starts at `1`; a future `_V2` key + re-seal enables rotation. Never log plaintext.
- **`TenantSecret` table:** `(id, tenantId, name, ciphertext, iv, authTag, keyVersion, createdAt, updatedAt)`, `@@unique([tenantId, name])`, `@@index([tenantId])`. Tenant-owned (added to `TENANT_SCOPED_MODELS` for defense-in-depth).
- **Tenant-scoped accessor — `src/server/secrets/tenantSecrets.ts`:** `getTenantSecret(name) → Promise<string | null>` resolves the active tenant (`getTenant()`), queries `TenantSecret` by explicit `{ tenantId, name }` via `getDb()` (mirrors how `getTenantConfig` reads the row), and `open`s it (returns `null` if absent). `setTenantSecret(tenantId, name, plaintext)` seals + upserts (used by seed/rotate; not request-path). Decrypt only at point of use.

### 2. `AiProvider` interface + adapters — `src/server/ai/providers/`
- **Neutral types (`types.ts`):**
  - `AiMessage = { role:"user"|"assistant", content:string } | { role:"assistant", toolCalls: AiToolCall[] } | { role:"tool", toolCallId:string, name:string, result:string }`, `AiToolCall = { id:string; name:string; args:string }`.
  - `AiTool = { name:string; description:string; parameters: Record<string, unknown> }` (JSON Schema).
  - `AiEvent = { type:"text"; delta:string } | { type:"tool_call"; id:string; name:string; args:string }`.
  - `interface AiProvider { streamTurn(system: string, messages: AiMessage[], tools: AiTool[]): AsyncIterable<AiEvent> }`.
- **`OpenAICompatibleProvider`** (`openaiCompatible.ts`): ctor `{ apiKey, baseURL, model }`. Translates neutral history → `ChatCompletionMessageParam[]` (system + text + assistant-with-`tool_calls` + `role:"tool"` results), tools → `{type:"function",function:{...}}`. Streams `chat.completions.create({stream:true})`; maps `delta.content` → text events and assembles `delta.tool_calls` (by index) → emits a `tool_call` event per call at stream end.
- **`AnthropicProvider`** (`anthropic.ts`): `@anthropic-ai/sdk`. ctor `{ apiKey, model }`. Translates neutral history → Anthropic `MessageParam[]` (`system` passed separately; assistant `tool_use` blocks; tool results as a `user` message with `tool_result` blocks), tools → `{name,description,input_schema}`. Streams `messages.stream(...)`; maps `content_block_delta` `text_delta` → text events and `input_json_delta` → accumulates tool args, emitting a `tool_call` event on `content_block_stop` of a `tool_use` block.
- Each adapter is a pure translator (no loop, no recording) → unit-testable by feeding a neutral convo and asserting the request it builds + the events it yields.

### 3. AI config + `getAiProvider(tenant)`
- **`TenantConfig.ai`** (added to `TenantConfigSchema` in `src/content/site.ts`): `{ provider: "openai-compatible" | "anthropic"; model: string; baseUrl?: string }`. `DEFAULT_TENANT_CONFIG.ai = { provider:"openai-compatible", model:"deepseek-chat", baseUrl:"https://api.deepseek.com" }`.
- **`getAiProvider()`** (`providers/index.ts`): reads `getTenantConfig().ai`; resolves the key via `getTenantSecret("ai_api_key")`, falling back to `serverEnv.DEEPSEEK_API_KEY`. Returns `null` when no key (drives the route's degraded path). For `"openai-compatible"` → `OpenAICompatibleProvider({apiKey, baseURL: ai.baseUrl, model: ai.model})`; for `"anthropic"` → `AnthropicProvider({apiKey, model: ai.model})`.
- The route's degraded path keys off `getAiProvider()` returning `null` (no key from secret or env) rather than the sync env-only `aiConfigured()`; any remaining non-request-path uses of `aiConfigured()` are revisited in the plan.

### 4. Chat route refactor — `src/app/api/v1/ai/chat/route.ts`
Replace the OpenAI-specific loop with a provider-agnostic one:
1. `const provider = await getAiProvider();` — `null` → existing degraded SSE path.
2. Build neutral `history: AiMessage[]` from the inbound user/assistant messages.
3. Loop (≤ `MAX_TURNS`): `for await (const ev of provider.streamTurn(SYSTEM_PROMPT, history, TOOLS))` → text events stream to SSE + accumulate; `tool_call` events collect. Record assistant text. If no tool calls → break. Else push a neutral assistant-tool-call `AiMessage`, run each tool via the existing `runTool`, SSE `{type:"tool"}`, record, push neutral tool-result `AiMessage`s.
4. Same `{type:text|tool|session|done|error}` SSE protocol, same transcript recording, same `MAX_TURNS`, same error/degraded handling.
- `src/server/ai/tools.ts`: `TOOLS` is redefined as neutral `AiTool[]` (name/description/parameters); each adapter converts to its wire format. `runTool` is unchanged.
- `src/server/ai/client.ts`: removed (its singleton/env-coupling is superseded by `getAiProvider`).

### 5. MSFG migration (stays live)
- `src/lib/env.ts`: add `TENANT_SECRETS_KEY` (optional at first so the build/boot never fails without it; `EnvelopeAesSecretStore` throws a clear error only when actually asked to seal/open without it). Keep `DEEPSEEK_*` for the env fallback.
- Deploy: set `TENANT_SECRETS_KEY` (a generated base64 32-byte key) on the EC2 box; run a seed/rotate step (`setTenantSecret('tenant_msfg','ai_api_key', <deepseek key from env>)`) to seal MSFG's key; `config.ai` seeded to deepseek defaults. MSFG then runs on the encrypted secret, with env fallback as belt-and-suspenders → **`deepseek-chat`, identical behavior**.
- `prisma/seed.ts`: seeds `config.ai` (idempotent, key-free). Sealing the key is a separate operational step via `scripts/seal-secret.ts` (reads `process.env.DEEPSEEK_API_KEY` → `setTenantSecret('tenant_msfg','ai_api_key', …)`), kept out of the main seed since the plaintext key isn't in the repo.

### 6. Verification
- **SecretStore:** seal→open round-trips to the original; a tampered `ciphertext`/`authTag` makes `open` throw (authenticated encryption); distinct IVs per seal.
- **Adapters:** feed a fixed neutral convo (text + a tool call + a tool result) to each adapter; assert the provider request it builds (OpenAI `messages`/`tools` shape vs Anthropic `system`/`messages`/`tools` shape) and the normalized `AiEvent`s it yields from a simulated stream.
- **Route:** provider-swap test (same neutral history → both adapters drive the same SSE event sequence); MSFG E2E unchanged (degraded path with no key; real path streams).
- Gates: `tsc`, `vitest`, `next build` green. MSFG chat behaves as today.

## File / component change map

| Area | Change |
|---|---|
| `prisma/schema.prisma` | new `TenantSecret` model (+ `tenantId`); add to scoped models |
| `prisma/migrations/<ts>_add_tenant_secret/` | `CREATE TABLE tenant_secrets …` |
| `src/server/secrets/secretStore.ts` (new) | `SecretStore` + `EnvelopeAesSecretStore` |
| `src/server/secrets/tenantSecrets.ts` (new) | `getTenantSecret` / `setTenantSecret` |
| `src/server/ai/providers/types.ts` (new) | `AiMessage`/`AiTool`/`AiEvent`/`AiProvider` |
| `src/server/ai/providers/openaiCompatible.ts` (new) | OpenAI/DeepSeek adapter |
| `src/server/ai/providers/anthropic.ts` (new) | Claude adapter |
| `src/server/ai/providers/index.ts` (new) | `getAiProvider()` (config + secret/env key) |
| `src/server/ai/tools.ts` | `TOOLS` → neutral `AiTool[]`; `runTool` unchanged |
| `src/server/ai/client.ts` | removed |
| `src/app/api/v1/ai/chat/route.ts` | neutral loop via `getAiProvider().streamTurn` |
| `src/content/site.ts` | `TenantConfigSchema.ai` + `DEFAULT_TENANT_CONFIG.ai` |
| `src/lib/env.ts` | `TENANT_SECRETS_KEY` (optional); keep `DEEPSEEK_*` |
| `prisma/seed.ts` | seed `config.ai` (key-free) |
| `scripts/seal-secret.ts` (new) | seal MSFG `ai_api_key` from env (operational) |
| `package.json` | add `@anthropic-ai/sdk` |

## Tenant-config / SecretStore interaction with build-time DB (carried from Phase B)
`getAiProvider`/`getTenantSecret` run only in the **request-path** `/api/v1/ai/chat` route (`dynamic = "force-dynamic"`, Node runtime) — NOT during static generation. So Phase B's "static pages read config at build" concern does not extend here; the `TenantSecret` migration is additive and applied before deploy per the usual gated step.

## Risks / open items
- **KEK management:** `TENANT_SECRETS_KEY` lives in app env (accepted in the design doc); a host compromise exposes secrets. KMS backend is a future swap behind the same interface. Losing the KEK makes sealed secrets unrecoverable — document backing it up.
- **Anthropic tool-streaming fidelity:** content-block assembly (`input_json_delta`) differs from OpenAI; the adapter needs careful tests. Claude also requires `max_tokens` and has different stop semantics — encode in the adapter.
- **Env fallback longevity:** fallback is a transition aid; once MSFG's key is sealed, the env key is redundant (keep briefly, then remove in C2).
- **`@anthropic-ai/sdk` in the standalone bundle:** ensure it's traced into `output: standalone` (like `openai`) so self-hosted deploy includes it.
