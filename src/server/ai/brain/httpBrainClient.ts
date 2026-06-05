/**
 * HTTP adapter for the Mortgage Brain. Translates a neutral BrainAskInput into the
 * brain's wire request, posts server-to-server, maps HTTP status → BrainResult,
 * and validates the response body. Never throws — always resolves a BrainResult.
 */
import {
  type BrainAskInput,
  type BrainResult,
  type MortgageBrainClient,
  parseBrainResponse,
} from "./types";

type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>;

export type HttpBrainClientOptions = {
  baseUrl: string;
  apiKey?: string;
  timeoutMs?: number;
  fetchImpl?: FetchImpl;
};

/** Build the brain's wire request body, omitting absent optional fields. */
export function buildAskRequestBody(input: BrainAskInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    sessionId: input.sessionId,
    question: input.question,
  };
  if (input.conversationId) body.conversationId = input.conversationId;
  if (input.loanType) body.loanType = input.loanType;
  if (input.state) body.state = input.state;
  return body;
}

/** Read a JSON `{error}` message from a non-2xx response, with a fallback. */
async function errMsg(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown };
    const m = body?.error;
    return typeof m === "string" && m.trim() ? m : fallback;
  } catch {
    return fallback;
  }
}

export class HttpMortgageBrainClient implements MortgageBrainClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchImpl;

  constructor(opts: HttpBrainClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.apiKey = opts.apiKey;
    this.timeoutMs = opts.timeoutMs ?? 60_000;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async ask(input: BrainAskInput): Promise<BrainResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (input.clientIp) headers["X-Forwarded-For"] = input.clientIp;
      if (this.apiKey) headers["Authorization"] = `Bearer ${this.apiKey}`;

      const res = await this.fetchImpl(`${this.baseUrl}/api/ai/mortgage/ask`, {
        method: "POST",
        headers,
        body: JSON.stringify(buildAskRequestBody(input)),
        signal: controller.signal,
      });

      if (res.status === 400) {
        return { ok: false, kind: "validation", message: await errMsg(res, "Please rephrase your question.") };
      }
      if (res.status === 429) {
        return {
          ok: false,
          kind: "rate_limited",
          message: await errMsg(res, "You're asking questions quickly — give it a few seconds."),
        };
      }
      if (!res.ok) {
        return { ok: false, kind: "unavailable", message: "The assistant is temporarily unavailable." };
      }

      const json = await res.json();
      return { ok: true, answer: parseBrainResponse(json) };
    } catch {
      return { ok: false, kind: "unavailable", message: "The assistant is temporarily unavailable." };
    } finally {
      clearTimeout(timer);
    }
  }
}
