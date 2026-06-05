/**
 * Mortgage Brain client — neutral types, a Zod gate over the wire response, and a
 * compliant fallback.
 *
 * The brain (external Java/Spring RAG service) returns a FINISHED, compliance-
 * locked answer. We render it verbatim and never paraphrase it. This module owns
 * the TS shapes, validates the wire response (defensive against contract drift),
 * and builds the fallback answer used when the brain is unreachable.
 *
 * Pure + isomorphic (no server-only imports) so the client widget can
 * `import type { BrainAnswer }` without bundling anything.
 */
import { z } from "zod";

/** A source citation. Every field may be null (per the brain contract). */
export type BrainCitation = {
  sourceName: string | null;
  documentName: string | null;
  section: string | null;
  pageNumber: string | null;
  effectiveDate: string | null;
};

/** A finished, compliance-locked answer — rendered VERBATIM in the UI. */
export type BrainAnswer = {
  conversationId: string;
  answer: string;
  citations: BrainCitation[];
  confidence: number;
  humanEscalationRequired: boolean;
  disclaimer: string;
};

/** Input to a single ask. Optional fields are omitted from the wire body when absent. */
export type BrainAskInput = {
  question: string;
  sessionId: string;
  conversationId?: string;
  loanType?: string;
  state?: string;
  /** Real client IP, forwarded to the brain as X-Forwarded-For. */
  clientIp?: string;
};

/** Discriminated result the route + UI map to compliant states. */
export type BrainResult =
  | { ok: true; answer: BrainAnswer }
  | { ok: false; kind: "validation" | "rate_limited" | "unavailable"; message: string };

export interface MortgageBrainClient {
  ask(input: BrainAskInput): Promise<BrainResult>;
}

/** Zod gate over the brain's wire response (citations are snake_case). */
const WireCitation = z.object({
  source_name: z.string().nullish(),
  document_name: z.string().nullish(),
  section: z.string().nullish(),
  page_number: z.string().nullish(),
  effective_date: z.string().nullish(),
});

const WireResponse = z.object({
  conversationId: z.string(),
  answer: z.string(),
  citations: z.array(WireCitation).nullish(),
  confidence: z.number().nullish(),
  humanEscalationRequired: z.boolean(),
  disclaimer: z.string(),
});

/**
 * Validate + normalize the brain's JSON into a BrainAnswer (snake_case →
 * camelCase). Throws if the body doesn't match the contract — callers map a throw
 * to an "unavailable" result.
 */
export function parseBrainResponse(json: unknown): BrainAnswer {
  const r = WireResponse.parse(json);
  return {
    conversationId: r.conversationId,
    answer: r.answer,
    confidence: r.confidence ?? 0,
    humanEscalationRequired: r.humanEscalationRequired,
    disclaimer: r.disclaimer,
    citations: (r.citations ?? []).map((c) => ({
      sourceName: c.source_name ?? null,
      documentName: c.document_name ?? null,
      section: c.section ?? null,
      pageNumber: c.page_number ?? null,
      effectiveDate: c.effective_date ?? null,
    })),
  };
}

/** Standard disclaimer for the local fallback (mirrors the brain's wording). */
export const FALLBACK_DISCLAIMER =
  "This answer is for general mortgage education only and is not a loan approval, underwriting decision, legal advice, or tax advice.";

/**
 * A compliant fallback answer for when the brain is disabled/unreachable. It does
 * NOT fabricate mortgage content — it escalates to a licensed loan officer.
 * Tenant-neutral wording (no hardcoded brand).
 */
export function unavailableAnswer(message?: string): BrainAnswer {
  return {
    conversationId: "",
    answer:
      message ??
      "I can't answer mortgage questions right now — a licensed loan officer can help you directly.",
    citations: [],
    confidence: 0,
    humanEscalationRequired: true,
    disclaimer: FALLBACK_DISCLAIMER,
  };
}
