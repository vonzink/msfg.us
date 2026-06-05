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
