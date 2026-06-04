/**
 * AI client + model config for MSFG AI.
 *
 * The assistant runs on DeepSeek's OpenAI-compatible API via the official
 * `openai` SDK (just a different baseURL + key). DEEPSEEK_BASE_URL / DEEPSEEK_MODEL
 * let you point at any OpenAI-compatible endpoint; defaults target DeepSeek.
 * The client is created lazily so importing this module never requires a key.
 *
 * NOTE: tool/function calling requires the `deepseek-chat` model —
 * `deepseek-reasoner` does not support functions.
 *
 * Server-only.
 */
import OpenAI from "openai";
import { serverEnv } from "@/lib/env";

let cached: OpenAI | null = null;

/** Return the shared OpenAI-compatible client (DeepSeek), built on first use. */
export function getAiClient(): OpenAI {
  if (!cached) {
    cached = new OpenAI({
      apiKey: serverEnv.DEEPSEEK_API_KEY,
      baseURL: serverEnv.DEEPSEEK_BASE_URL, // default https://api.deepseek.com
    });
  }
  return cached;
}

/** The model id (default deepseek-chat). Read lazily so env isn't touched at import. */
export function aiModel(): string {
  return serverEnv.DEEPSEEK_MODEL;
}

/** Concise chat answers; the agentic loop is short-turn, not long-form. */
export const AI_MAX_TOKENS = 2048;
