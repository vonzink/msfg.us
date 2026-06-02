/**
 * Anthropic client + shared model config for MSFG AI.
 *
 * The SDK reads ANTHROPIC_API_KEY from the environment itself; we only pass an
 * optional baseURL so a hybrid/internal gateway can be slotted in via
 * ANTHROPIC_BASE_URL (undefined → the SDK's default api.anthropic.com). The
 * client is created lazily so importing this module never requires a key.
 *
 * Server-only.
 */
import Anthropic from "@anthropic-ai/sdk";
import { serverEnv } from "@/lib/env";

let cached: Anthropic | null = null;

/** Return the shared Anthropic client, constructing it on first use. */
export function getAnthropic(): Anthropic {
  if (!cached) {
    cached = new Anthropic({
      // baseURL is undefined when ANTHROPIC_BASE_URL is unset → SDK default.
      baseURL: serverEnv.ANTHROPIC_BASE_URL || undefined,
    });
  }
  return cached;
}

/** Exact model string — no date suffix (Sonnet 4.6 supports adaptive thinking). */
export const AI_MODEL = "claude-sonnet-4-6";

/** Concise chat answers; the agentic loop is short-turn, not long-form. */
export const AI_MAX_TOKENS = 2048;
