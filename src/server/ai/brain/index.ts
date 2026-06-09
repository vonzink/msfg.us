/**
 * Factory: resolves the active tenant's Mortgage Brain client, or null.
 *
 * Reads TenantConfig.ai.brain (enabled + baseUrl). Returns null when disabled or
 * unconfigured — the /api/v1/ai/ask route uses null as the signal to return the
 * compliant "talk to a loan officer" fallback. An optional `brain_api_key` tenant
 * secret is forwarded as a Bearer token if present (the contract needs none today).
 *
 * Server-only (imports server-only modules).
 */
import "server-only";
import { getTenantConfig } from "@/server/tenant/config";
import { getTenantSecret } from "@/server/secrets/tenantSecrets";
import { HttpMortgageBrainClient } from "./httpBrainClient";
import type { MortgageBrainClient } from "./types";

export async function getMortgageBrain(): Promise<MortgageBrainClient | null> {
  const { ai } = await getTenantConfig();
  // Optional access: a config persisted/cached before the `brain` field existed
  // has no `ai.brain` — treat that as disabled rather than throwing.
  if (!ai.brain?.enabled || !ai.brain?.baseUrl) return null;
  const apiKey = (await getTenantSecret("brain_api_key")) ?? undefined;
  return new HttpMortgageBrainClient({ baseUrl: ai.brain.baseUrl, apiKey });
}

export type { MortgageBrainClient } from "./types";
