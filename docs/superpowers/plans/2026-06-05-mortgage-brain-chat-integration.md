# Mortgage Brain → Marketing Chat Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the marketing chat widget answer mortgage questions by proxying to the external MSFG Mortgage Brain and rendering its compliance-locked answer verbatim (answer + citations + disclaimer + escalation), gated per-tenant.

**Architecture:** Browser `AiWidget` → `POST /api/v1/ai/ask` (our tenant-scoped Next route) → `MortgageBrainClient` → `POST {baseUrl}/api/ai/mortgage/ask` (server-to-server) → returns a `BrainAnswer` rendered verbatim. The brain is selected per tenant from `config.ai.brain`; when disabled/unreachable the route returns a compliant fallback that escalates to a loan officer (never a fabricated answer). Best-effort transcript recording threads turns by the brain's `conversationId`. The DeepSeek `/api/v1/ai/chat` route stays in the codebase but dormant.

**Tech Stack:** Next.js 16 App Router (Node runtime), TypeScript, Zod, Prisma 7/Postgres, Vitest. Spec: `docs/superpowers/specs/2026-06-05-mortgage-brain-chat-integration-design.md`. Brain contract: `/Users/zacharyzink/MSFG/msfg-rag/docs/website-integration.md` (brain is live locally at `http://localhost:8080`).

**Brain wire contract (confirmed against the Java DTOs):**
- Request `POST /api/ai/mortgage/ask` body: `{ conversationId?: UUID, sessionId: string(≤255), question: string(≤2000), loanType?: string(≤50), state?: string(≤2) }` — omit absent optionals.
- Response 200: `{ conversationId: string, answer: string, citations: Citation[], confidence: number, humanEscalationRequired: boolean, disclaimer: string }`.
- Citation (snake_case, every field nullable): `{ source_name, document_name, section, page_number, effective_date }`.
- Errors: `400 {error}` (validation), `429 {error}` (rate limit), `500 {error}`. Typical latency 3–10s; do not time out below 60s.

**Conventions for every task:** Run `npx tsc --noEmit` and `npx vitest run <file>` for changed files. Commit after each task. Do NOT run `npm run build` per-task (it reads prod). `npm run lint` has pre-existing `no-explicit-any` debt and is non-blocking; `next build` tolerates it.

---

### Task 1: Add `config.ai.brain` to the tenant config schema

**Files:**
- Modify: `src/content/site.ts` (the `AiConfigSchema` near line 144; `DEFAULT_TENANT_CONFIG.ai` near line 278)
- Test: `src/content/site.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/content/site.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { TenantConfigSchema, DEFAULT_TENANT_CONFIG } from "./site";

describe("config.ai.brain", () => {
  it("defaults brain to disabled when an older stored config omits it", () => {
    const stored = JSON.parse(JSON.stringify(DEFAULT_TENANT_CONFIG));
    delete stored.ai.brain; // simulate a config saved before the brain field existed
    const parsed = TenantConfigSchema.parse(stored);
    expect(parsed.ai.brain).toEqual({ enabled: false, baseUrl: "" });
  });

  it("parses an enabled brain config", () => {
    const stored = JSON.parse(JSON.stringify(DEFAULT_TENANT_CONFIG));
    stored.ai.brain = { enabled: true, baseUrl: "http://localhost:8080" };
    const parsed = TenantConfigSchema.parse(stored);
    expect(parsed.ai.brain).toEqual({ enabled: true, baseUrl: "http://localhost:8080" });
  });

  it("ships brain disabled in DEFAULT_TENANT_CONFIG", () => {
    expect(DEFAULT_TENANT_CONFIG.ai.brain).toEqual({ enabled: false, baseUrl: "" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/content/site.test.ts`
Expected: FAIL (`parsed.ai.brain` is `undefined`; `DEFAULT_TENANT_CONFIG.ai.brain` is `undefined`).

- [ ] **Step 3: Extend the schema**

In `src/content/site.ts`, replace the `AiConfigSchema` definition with:

```ts
const AiConfigSchema = z.object({
  provider: z.enum(["openai-compatible", "anthropic"]),
  model: z.string(),
  baseUrl: z.string().optional(),
  /**
   * External Mortgage Brain (RAG answer service). When `enabled` and a `baseUrl`
   * is set, the marketing chat routes questions to the brain and renders its
   * answer verbatim. Disabled by default — backward-compatible with stored
   * configs saved before this field existed.
   */
  brain: z
    .object({
      enabled: z.boolean().default(false),
      baseUrl: z.string().default(""),
    })
    .default({ enabled: false, baseUrl: "" }),
});
```

- [ ] **Step 4: Add the default value**

In `src/content/site.ts`, in `DEFAULT_TENANT_CONFIG`, replace the `ai:` block with:

```ts
  ai: {
    provider: "openai-compatible",
    model: "deepseek-chat",
    baseUrl: "https://api.deepseek.com",
    brain: { enabled: false, baseUrl: "" },
  },
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/content/site.test.ts` → Expected: PASS (3 tests).
Run: `npx tsc --noEmit` → Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/content/site.ts src/content/site.test.ts
git commit -m "feat(brain): add config.ai.brain (enabled+baseUrl), default disabled"
```

---

### Task 2: Brain types, response parser, and compliant fallback

**Files:**
- Create: `src/server/ai/brain/types.ts`
- Test: `src/server/ai/brain/types.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/server/ai/brain/types.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseBrainResponse, unavailableAnswer, FALLBACK_DISCLAIMER } from "./types";

const sample = {
  conversationId: "e5e48b02-1111-2222-3333-444455556666",
  answer: "Gift funds may generally be used for a down payment...",
  citations: [
    {
      source_name: "Fannie Mae Selling Guide",
      document_name: "fannie mae sellers guide.pdf",
      section: "B3-4.3-04 Personal Gifts",
      page_number: "412",
      effective_date: "2026-01-01",
    },
  ],
  confidence: 0.8,
  humanEscalationRequired: false,
  disclaimer: "This answer is for general mortgage education only...",
};

describe("parseBrainResponse", () => {
  it("maps snake_case citations to camelCase", () => {
    const a = parseBrainResponse(sample);
    expect(a.conversationId).toBe(sample.conversationId);
    expect(a.answer).toBe(sample.answer);
    expect(a.humanEscalationRequired).toBe(false);
    expect(a.citations[0]).toEqual({
      sourceName: "Fannie Mae Selling Guide",
      documentName: "fannie mae sellers guide.pdf",
      section: "B3-4.3-04 Personal Gifts",
      pageNumber: "412",
      effectiveDate: "2026-01-01",
    });
  });

  it("defaults missing citations to an empty array", () => {
    const a = parseBrainResponse({ ...sample, citations: undefined });
    expect(a.citations).toEqual([]);
  });

  it("preserves null citation fields", () => {
    const a = parseBrainResponse({
      ...sample,
      citations: [
        { source_name: "X", document_name: null, section: null, page_number: null, effective_date: null },
      ],
    });
    expect(a.citations[0]).toEqual({
      sourceName: "X", documentName: null, section: null, pageNumber: null, effectiveDate: null,
    });
  });

  it("throws on a malformed body (missing answer)", () => {
    expect(() =>
      parseBrainResponse({ conversationId: "x", humanEscalationRequired: false, disclaimer: "d" }),
    ).toThrow();
  });
});

describe("unavailableAnswer", () => {
  it("escalates to a loan officer without fabricating mortgage content", () => {
    const a = unavailableAnswer();
    expect(a.humanEscalationRequired).toBe(true);
    expect(a.citations).toEqual([]);
    expect(a.disclaimer).toBe(FALLBACK_DISCLAIMER);
    expect(a.answer.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/ai/brain/types.test.ts`
Expected: FAIL ("Cannot find module './types'").

- [ ] **Step 3: Implement the module**

Create `src/server/ai/brain/types.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/server/ai/brain/types.test.ts` → Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/ai/brain/types.ts src/server/ai/brain/types.test.ts
git commit -m "feat(brain): neutral types, wire-response parser, compliant fallback"
```

---

### Task 3: HTTP brain client adapter

**Files:**
- Create: `src/server/ai/brain/httpBrainClient.ts`
- Test: `src/server/ai/brain/httpBrainClient.test.ts`

NOTE: do NOT add `import "server-only"` here — this module is unit-tested in the node (vitest) environment, exactly like `src/server/ai/providers/openaiCompatible.ts`. The server-only boundary lives in the factory (Task 6).

- [ ] **Step 1: Write the failing test**

Create `src/server/ai/brain/httpBrainClient.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { HttpMortgageBrainClient, buildAskRequestBody } from "./httpBrainClient";

function res(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const sampleAnswer = {
  conversationId: "c1",
  answer: "A",
  citations: [],
  confidence: 0.5,
  humanEscalationRequired: false,
  disclaimer: "d",
};

describe("buildAskRequestBody", () => {
  it("omits absent optional fields", () => {
    expect(buildAskRequestBody({ sessionId: "s", question: "q" })).toEqual({
      sessionId: "s",
      question: "q",
    });
  });

  it("includes present optionals", () => {
    expect(
      buildAskRequestBody({
        sessionId: "s",
        question: "q",
        conversationId: "c",
        loanType: "conventional",
        state: "CO",
      }),
    ).toEqual({ sessionId: "s", question: "q", conversationId: "c", loanType: "conventional", state: "CO" });
  });
});

describe("HttpMortgageBrainClient.ask", () => {
  it("returns ok + mapped answer on 200 and calls the ask endpoint", async () => {
    const fetchImpl = vi.fn(async () => res(200, sampleAnswer));
    const c = new HttpMortgageBrainClient({ baseUrl: "http://brain", fetchImpl });
    const out = await c.ask({ sessionId: "s", question: "q" });
    expect(out).toEqual({ ok: true, answer: { ...sampleAnswer, citations: [] } });
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://brain/api/ai/mortgage/ask",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("forwards X-Forwarded-For and omits conversationId on the first turn", async () => {
    const fetchImpl = vi.fn(async () => res(200, sampleAnswer));
    const c = new HttpMortgageBrainClient({ baseUrl: "http://brain/", fetchImpl });
    await c.ask({ sessionId: "s", question: "q", clientIp: "203.0.113.7" });
    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)["X-Forwarded-For"]).toBe("203.0.113.7");
    expect(JSON.parse(init.body as string)).toEqual({ sessionId: "s", question: "q" });
  });

  it("maps 400 to validation with the body message", async () => {
    const fetchImpl = vi.fn(async () => res(400, { error: "question is required" }));
    const c = new HttpMortgageBrainClient({ baseUrl: "http://brain", fetchImpl });
    expect(await c.ask({ sessionId: "s", question: "" })).toEqual({
      ok: false,
      kind: "validation",
      message: "question is required",
    });
  });

  it("maps 429 to rate_limited", async () => {
    const fetchImpl = vi.fn(async () => res(429, { error: "slow down" }));
    const c = new HttpMortgageBrainClient({ baseUrl: "http://brain", fetchImpl });
    expect((await c.ask({ sessionId: "s", question: "q" })).kind).toBe("rate_limited");
  });

  it("maps 500 to unavailable", async () => {
    const fetchImpl = vi.fn(async () => res(500, { error: "boom" }));
    const c = new HttpMortgageBrainClient({ baseUrl: "http://brain", fetchImpl });
    expect((await c.ask({ sessionId: "s", question: "q" })).kind).toBe("unavailable");
  });

  it("maps a network throw to unavailable", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    const c = new HttpMortgageBrainClient({ baseUrl: "http://brain", fetchImpl });
    expect((await c.ask({ sessionId: "s", question: "q" })).kind).toBe("unavailable");
  });

  it("maps a malformed 200 body to unavailable", async () => {
    const fetchImpl = vi.fn(async () => res(200, { answer: "missing required fields" }));
    const c = new HttpMortgageBrainClient({ baseUrl: "http://brain", fetchImpl });
    expect((await c.ask({ sessionId: "s", question: "q" })).kind).toBe("unavailable");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/ai/brain/httpBrainClient.test.ts`
Expected: FAIL ("Cannot find module './httpBrainClient'").

- [ ] **Step 3: Implement the adapter**

Create `src/server/ai/brain/httpBrainClient.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/server/ai/brain/httpBrainClient.test.ts` → Expected: PASS (9 tests).
Run: `npx tsc --noEmit` → Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/server/ai/brain/httpBrainClient.ts src/server/ai/brain/httpBrainClient.test.ts
git commit -m "feat(brain): HTTP client adapter (wire mapping, error mapping, IP forward)"
```

---

### Task 4: In-memory rate limiter

**Files:**
- Create: `src/server/ai/brain/rateLimit.ts`
- Test: `src/server/ai/brain/rateLimit.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/server/ai/brain/rateLimit.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit, __resetRateLimit } from "./rateLimit";

beforeEach(() => __resetRateLimit());

describe("checkRateLimit", () => {
  it("allows up to the max within the window", () => {
    for (let i = 0; i < 8; i++) {
      expect(checkRateLimit("k", 1000 + i).allowed).toBe(true);
    }
  });

  it("blocks the request over the max within the window", () => {
    for (let i = 0; i < 8; i++) checkRateLimit("k", 1000);
    expect(checkRateLimit("k", 1000).allowed).toBe(false);
  });

  it("allows again after the window slides", () => {
    for (let i = 0; i < 8; i++) checkRateLimit("k", 1000);
    expect(checkRateLimit("k", 1000 + 60_001).allowed).toBe(true);
  });

  it("scopes counters by key", () => {
    for (let i = 0; i < 8; i++) checkRateLimit("a", 1000);
    expect(checkRateLimit("b", 1000).allowed).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/ai/brain/rateLimit.test.ts`
Expected: FAIL ("Cannot find module './rateLimit'").

- [ ] **Step 3: Implement the limiter**

Create `src/server/ai/brain/rateLimit.ts`:

```ts
/**
 * In-memory sliding-window rate limiter for the brain proxy. Per-process — adequate
 * for the current single-instance pm2/EC2 deploy; revisit if the app scales
 * horizontally (move to Redis/DB). Keyed by sessionId+IP. This is OUR guard; the
 * brain also rate-limits per IP (see the integration spec).
 */
const WINDOW_MS = 60_000;
const MAX_IN_WINDOW = 8;

const hits = new Map<string, number[]>();

export function checkRateLimit(
  key: string,
  now: number,
  max: number = MAX_IN_WINDOW,
  windowMs: number = WINDOW_MS,
): { allowed: boolean } {
  const cutoff = now - windowMs;
  const recent = (hits.get(key) ?? []).filter((t) => t > cutoff);
  if (recent.length >= max) {
    hits.set(key, recent);
    return { allowed: false };
  }
  recent.push(now);
  hits.set(key, recent);
  return { allowed: true };
}

/** Test seam: clear all counters. */
export function __resetRateLimit(): void {
  hits.clear();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/server/ai/brain/rateLimit.test.ts` → Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/ai/brain/rateLimit.ts src/server/ai/brain/rateLimit.test.ts
git commit -m "feat(brain): in-memory sliding-window rate limiter"
```

---

### Task 5: Transcript threading helpers

**Files:**
- Modify: `src/server/ai/transcript.ts` (add two helpers after `createChatSession`)
- Test: `src/server/ai/transcript.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/server/ai/transcript.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const findFirst = vi.fn();
const create = vi.fn();
const count = vi.fn();

vi.mock("@/lib/db", () => ({
  getTenantDb: vi.fn(async () => ({
    chatSession: { findFirst, create },
    chatMessage: { count },
  })),
}));

import { findOrCreateBrainSession, nextOrderIndex } from "./transcript";

beforeEach(() => vi.clearAllMocks());

describe("findOrCreateBrainSession", () => {
  it("returns the existing session id when one already records this conversation", async () => {
    findFirst.mockResolvedValue({ id: "sess_1" });
    expect(await findOrCreateBrainSession("c1")).toBe("sess_1");
    expect(create).not.toHaveBeenCalled();
  });

  it("creates a session storing the conversationId when none exists", async () => {
    findFirst.mockResolvedValue(null);
    create.mockResolvedValue({ id: "sess_new" });
    const id = await findOrCreateBrainSession("c2", { surface: "homepage-widget" });
    expect(id).toBe("sess_new");
    expect(create).toHaveBeenCalledTimes(1);
    const arg = create.mock.calls[0][0];
    expect(arg.data.metadata).toMatchObject({ conversationId: "c2", surface: "homepage-widget" });
  });

  it("returns null on a db error (best-effort)", async () => {
    findFirst.mockRejectedValue(new Error("db down"));
    expect(await findOrCreateBrainSession("c3")).toBeNull();
  });
});

describe("nextOrderIndex", () => {
  it("returns the message count for the session", async () => {
    count.mockResolvedValue(4);
    expect(await nextOrderIndex("sess_1")).toBe(4);
  });

  it("returns 0 for a null session", async () => {
    expect(await nextOrderIndex(null)).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/ai/transcript.test.ts`
Expected: FAIL (`findOrCreateBrainSession`/`nextOrderIndex` are not exported).

- [ ] **Step 3: Add the helpers**

In `src/server/ai/transcript.ts`, add these two exported functions (e.g. directly after `createChatSession`, before `appendMessage`):

```ts
/**
 * Find the ChatSession recording a given brain conversation, or create one.
 * Threads multi-turn brain conversations into a single session, keyed by the
 * brain's `conversationId` (stored in `metadata`). Best-effort: returns null on
 * any failure so recording never blocks the answer.
 */
export async function findOrCreateBrainSession(
  conversationId: string,
  metadata?: Record<string, unknown>,
): Promise<string | null> {
  try {
    const db = await getTenantDb();
    const existing = await db.chatSession.findFirst({
      where: { metadata: { path: ["conversationId"], equals: conversationId } },
      select: { id: true },
    });
    if (existing) return existing.id;
    return await createChatSession({ ...metadata, conversationId });
  } catch (err) {
    console.error("[ai/transcript] findOrCreateBrainSession failed:", err);
    return null;
  }
}

/** Next orderIndex for a session (count of existing messages). 0 on error/null. */
export async function nextOrderIndex(sessionId: string | null): Promise<number> {
  if (!sessionId) return 0;
  try {
    const db = await getTenantDb();
    return await db.chatMessage.count({ where: { chatSessionId: sessionId } });
  } catch {
    return 0;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/server/ai/transcript.test.ts` → Expected: PASS (5 tests).
Run: `npx tsc --noEmit` → Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/server/ai/transcript.ts src/server/ai/transcript.test.ts
git commit -m "feat(brain): transcript threading by brain conversationId (best-effort)"
```

---

### Task 6: `getMortgageBrain` factory

**Files:**
- Create: `src/server/ai/brain/index.ts`

This factory mirrors `src/server/ai/providers/index.ts` (`getAiProvider`): it imports
`server-only` and is intentionally NOT unit-tested (trivial branching; covered by the
route test in Task 7, which mocks it, plus the live smoke in Task 9).

- [ ] **Step 1: Implement the factory**

Create `src/server/ai/brain/index.ts`:

```ts
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
  if (!ai.brain.enabled || !ai.brain.baseUrl) return null;
  const apiKey = (await getTenantSecret("brain_api_key")) ?? undefined;
  return new HttpMortgageBrainClient({ baseUrl: ai.brain.baseUrl, apiKey });
}

export type { MortgageBrainClient } from "./types";
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors. (Confirm `getTenantSecret` is imported from `@/server/secrets/tenantSecrets` — match the import path used in `src/server/ai/providers/index.ts`.)

- [ ] **Step 3: Commit**

```bash
git add src/server/ai/brain/index.ts
git commit -m "feat(brain): getMortgageBrain factory (per-tenant config + optional secret)"
```

---

### Task 7: Proxy route `POST /api/v1/ai/ask`

**Files:**
- Create: `src/app/api/v1/ai/ask/route.ts`
- Test: `src/app/api/v1/ai/ask/route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/api/v1/ai/ask/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAsk = vi.fn();
const mockGetBrain = vi.fn();
const mockCheckRateLimit = vi.fn(() => ({ allowed: true }));

vi.mock("@/server/ai/brain", () => ({ getMortgageBrain: () => mockGetBrain() }));
vi.mock("@/server/ai/brain/rateLimit", () => ({ checkRateLimit: () => mockCheckRateLimit() }));
vi.mock("@/server/ai/transcript", () => ({
  findOrCreateBrainSession: vi.fn(async () => "sess_1"),
  nextOrderIndex: vi.fn(async () => 0),
  appendMessage: vi.fn(async () => {}),
}));

import { POST } from "./route";

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/v1/ai/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const answer = {
  conversationId: "c1",
  answer: "Gift funds...",
  citations: [],
  confidence: 0.8,
  humanEscalationRequired: false,
  disclaimer: "d",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockCheckRateLimit.mockReturnValue({ allowed: true });
});

describe("POST /api/v1/ai/ask", () => {
  it("400s on an invalid body and never calls the brain", async () => {
    mockGetBrain.mockResolvedValue({ ask: mockAsk });
    const res = await POST(post({ sessionId: "" }));
    expect(res.status).toBe(400);
    expect((await res.json()).kind).toBe("validation");
    expect(mockAsk).not.toHaveBeenCalled();
  });

  it("returns a compliant fallback (200, escalate) when the brain is disabled", async () => {
    mockGetBrain.mockResolvedValue(null);
    const res = await POST(post({ sessionId: "s1", question: "hi" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.humanEscalationRequired).toBe(true);
    expect(body.citations).toEqual([]);
  });

  it("returns the brain answer verbatim on success", async () => {
    mockAsk.mockResolvedValue({ ok: true, answer });
    mockGetBrain.mockResolvedValue({ ask: mockAsk });
    const res = await POST(post({ sessionId: "s1", question: "gift funds?" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(answer);
  });

  it("forwards the first X-Forwarded-For IP to the brain", async () => {
    mockAsk.mockResolvedValue({ ok: true, answer });
    mockGetBrain.mockResolvedValue({ ask: mockAsk });
    await POST(post({ sessionId: "s1", question: "q" }, { "x-forwarded-for": "203.0.113.7, 10.0.0.1" }));
    expect(mockAsk).toHaveBeenCalledWith(expect.objectContaining({ clientIp: "203.0.113.7" }));
  });

  it("maps an unavailable brain result to 503", async () => {
    mockAsk.mockResolvedValue({ ok: false, kind: "unavailable", message: "down" });
    mockGetBrain.mockResolvedValue({ ask: mockAsk });
    const res = await POST(post({ sessionId: "s1", question: "q" }));
    expect(res.status).toBe(503);
    expect((await res.json()).kind).toBe("unavailable");
  });

  it("429s when the local rate limit trips, without calling the brain", async () => {
    mockCheckRateLimit.mockReturnValue({ allowed: false });
    mockGetBrain.mockResolvedValue({ ask: mockAsk });
    const res = await POST(post({ sessionId: "s1", question: "q" }));
    expect(res.status).toBe(429);
    expect(mockAsk).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/v1/ai/ask/route.test.ts`
Expected: FAIL ("Cannot find module './route'").

- [ ] **Step 3: Implement the route**

Create `src/app/api/v1/ai/ask/route.ts`:

```ts
/**
 * POST /api/v1/ai/ask — marketing-chat proxy to the Mortgage Brain.
 *
 * Renders the brain's compliance-locked answer VERBATIM. Tenant-scoped, server-
 * side (no browser→brain), best-effort transcript, graceful fallback. The brain
 * is selected per tenant (config.ai.brain); when disabled/unreachable we return a
 * compliant fallback that escalates to a loan officer — never a fabricated answer.
 *
 * Node runtime (Prisma + outbound fetch), never statically cached.
 */
import { z } from "zod";
import { getMortgageBrain } from "@/server/ai/brain";
import { unavailableAnswer, type BrainAnswer } from "@/server/ai/brain/types";
import { checkRateLimit } from "@/server/ai/brain/rateLimit";
import {
  findOrCreateBrainSession,
  nextOrderIndex,
  appendMessage,
} from "@/server/ai/transcript";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AskBody = z.object({
  sessionId: z.string().min(1).max(255),
  question: z.string().min(1).max(2000),
  conversationId: z.string().optional(),
  loanType: z.string().max(50).optional(),
  state: z.string().max(2).optional(),
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** First IP from X-Forwarded-For (real client behind our proxy), else X-Real-IP. */
function clientIpOf(req: Request): string | undefined {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || undefined;
  return req.headers.get("x-real-ip") ?? undefined;
}

export async function POST(req: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json({ error: "Invalid request body.", kind: "validation" }, 400);
  }

  const parsed = AskBody.safeParse(raw);
  if (!parsed.success) {
    return json({ error: "question and sessionId are required.", kind: "validation" }, 400);
  }
  const input = parsed.data;
  const clientIp = clientIpOf(req);

  // Our own per-process guard (the brain also rate-limits per IP).
  const rlKey = `${input.sessionId}:${clientIp ?? "noip"}`;
  if (!checkRateLimit(rlKey, Date.now()).allowed) {
    return json(
      { error: "You're asking questions quickly — give it a few seconds.", kind: "rate_limited" },
      429,
    );
  }

  const brain = await getMortgageBrain();
  if (!brain) {
    // Disabled/unconfigured → compliant fallback (200 so the widget renders it).
    return json(unavailableAnswer());
  }

  const result = await brain.ask({ ...input, clientIp });

  if (!result.ok) {
    const status =
      result.kind === "validation" ? 400 : result.kind === "rate_limited" ? 429 : 503;
    return json({ error: result.message, kind: result.kind }, status);
  }

  // Best-effort transcript (never blocks the answer).
  await recordTurn(input.question, result.answer);

  return json(result.answer);
}

/** Thread the Q&A into a ChatSession keyed by the brain conversationId. */
async function recordTurn(question: string, answer: BrainAnswer): Promise<void> {
  try {
    const sessionId = await findOrCreateBrainSession(answer.conversationId, {
      surface: "homepage-widget",
    });
    if (!sessionId) return;
    const base = await nextOrderIndex(sessionId);
    await appendMessage(sessionId, "user", question, base);
    await appendMessage(sessionId, "assistant", answer.answer, base + 1);
  } catch {
    // best-effort — recording must never affect the response
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/v1/ai/ask/route.test.ts` → Expected: PASS (6 tests).
Run: `npx tsc --noEmit` → Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/v1/ai/ask/route.ts src/app/api/v1/ai/ask/route.test.ts
git commit -m "feat(brain): /api/v1/ai/ask proxy route (verbatim, fallback, rate-limit, record)"
```

---

### Task 8: Rewrite `AiWidget` to render the brain answer verbatim

**Files:**
- Modify (full replace): `src/components/home/AiWidget.tsx`

The widget switches from SSE/DeepSeek streaming to a single JSON request to
`/api/v1/ai/ask`, and renders the answer **verbatim** with citations + disclaimer +
escalation. No automated test (the repo has no component tests); verify via tsc +
the manual checklist below. The DeepSeek `/api/v1/ai/chat` route is left dormant
(Task 9 documents it). Keep the AI-mode toggle, pills, intent buttons, input box,
and the footer recording disclosure exactly as today.

- [ ] **Step 1: Replace the file**

Replace the entire contents of `src/components/home/AiWidget.tsx` with:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUp,
  Banknote,
  Home,
  Mic,
  PiggyBank,
  RefreshCw,
} from "lucide-react";
import { Mark } from "@/components/ui/Mark";
import { Switch } from "@/components/ui/Switch";
import { cn } from "@/lib/cn";
import { AI_PILLS } from "@/content/ai-script";
import type { BrainAnswer } from "@/server/ai/brain/types";

const PILL_ICONS: Record<string, React.ReactNode> = {
  "Start my pre-approval": <ArrowRight className="size-[18px]" strokeWidth={1.8} />,
  "Lower my rate": <RefreshCw className="size-[18px]" strokeWidth={1.8} />,
  "Start saving": <PiggyBank className="size-[18px]" strokeWidth={1.8} />,
  "Get cash": <Banknote className="size-[18px]" strokeWidth={1.8} />,
};

/** Quick-prompt pills map to a natural first message sent to the assistant. */
const PILL_PROMPTS: Record<string, string> = {
  "Start my pre-approval": "I'm looking to start my pre-approval — how does it work?",
  "Lower my rate": "Can I lower my current mortgage rate?",
  "Start saving": "How can a refinance help me save money?",
  "Get cash": "I'd like to get cash from my home — what are my options?",
};

const INTENTS = [
  { label: "Buy a home", href: "/apply/buy", icon: <Home className="size-[26px]" strokeWidth={1.8} /> },
  { label: "Refinance my mortgage", href: "/apply/refi", icon: <RefreshCw className="size-[26px]" strokeWidth={1.8} /> },
  { label: "Get cash from my home", href: "/apply/cash", icon: <Banknote className="size-[26px]" strokeWidth={1.8} /> },
];

/** A turn in the transcript. Brain answers carry the full compliance payload. */
type ChatTurn =
  | { role: "user"; text: string }
  | { role: "answer"; data: BrainAnswer }
  | { role: "error"; text: string };

/** Stable per-visitor id for the brain (persisted in sessionStorage). */
function getVisitorSessionId(): string {
  if (typeof window === "undefined") return "";
  const KEY = "msfg.ai.sessionId";
  let id = window.sessionStorage.getItem(KEY);
  if (!id) {
    id = window.crypto?.randomUUID?.() ?? `s_${Date.now()}_${Math.round(Math.random() * 1e9)}`;
    window.sessionStorage.setItem(KEY, id);
  }
  return id;
}

/** Render a citation line, skipping null fields and sanitizing newlines. */
function citationLine(c: BrainAnswer["citations"][number]): string {
  return [
    c.sourceName,
    c.section,
    c.pageNumber ? `p. ${c.pageNumber}` : null,
    c.effectiveDate ? `eff. ${c.effectiveDate}` : null,
  ]
    .filter(Boolean)
    .map((s) => String(s).replace(/\s*\n\s*/g, " ").trim())
    .join(" · ");
}

function AnswerBubble({ data }: { data: BrainAnswer }) {
  return (
    <div className="max-w-[82%] self-start rounded-2xl rounded-bl-[5px] bg-paper-2 px-4 py-3 text-left">
      <p className="whitespace-pre-wrap text-[15px] leading-normal text-ink">{data.answer}</p>

      {data.citations.length > 0 && (
        <div className="mt-2 border-t border-line pt-2 text-[12px] text-[#6b756d]">
          <span className="font-semibold">Sources:</span>
          <ul className="mt-1 space-y-0.5">
            {data.citations.map((c, i) => (
              <li key={i}>{citationLine(c)}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Disclaimer is rendered with EVERY answer (compliance — not optional). */}
      <p className="mt-2 text-[11.5px] leading-snug text-[#6b756d]">{data.disclaimer}</p>

      {data.humanEscalationRequired && (
        <Link
          href="/loan-officers"
          className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-green-700 px-3.5 py-1.5 text-[13px] font-semibold text-white hover:bg-green-800"
        >
          Talk to a licensed loan officer <ArrowRight className="size-[15px]" strokeWidth={1.9} />
        </Link>
      )}
    </div>
  );
}

/** Homepage hero card. Defaults to Classic (3 intent buttons); the AI-mode toggle
 *  reveals the assistant backed by the Mortgage Brain (/api/v1/ai/ask). */
export function AiWidget({
  assistantName,
  shortName,
}: {
  assistantName: string;
  shortName: string;
}) {
  const [aiMode, setAiMode] = useState(false);
  const [convo, setConvo] = useState<ChatTurn[]>([]);
  const [typing, setTyping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [value, setValue] = useState("");
  const conversationIdRef = useRef<string | undefined>(undefined);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [convo, typing]);

  /** Send a question to the brain; render the verbatim answer. */
  const send = async (userText: string) => {
    const text = userText.trim();
    if (!text || busy) return;

    setConvo((c) => [...c, { role: "user", text }]);
    setValue("");
    setTyping(true);
    setBusy(true);

    try {
      const res = await fetch("/api/v1/ai/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: getVisitorSessionId(),
          conversationId: conversationIdRef.current,
          question: text,
        }),
      });

      const data = (await res.json()) as BrainAnswer | { error?: string; kind?: string };

      if (!res.ok || !("answer" in data) || typeof data.answer !== "string") {
        const msg =
          "error" in data && data.error
            ? data.error
            : "Sorry — I hit a problem. Please try again, or talk to a loan officer.";
        setConvo((c) => [...c, { role: "error", text: msg }]);
        return;
      }

      if (data.conversationId) conversationIdRef.current = data.conversationId;
      setConvo((c) => [...c, { role: "answer", data }]);
    } catch {
      setConvo((c) => [
        ...c,
        {
          role: "error",
          text: "Sorry — I couldn't reach the assistant. Please try again, or talk to a loan officer.",
        },
      ]);
    } finally {
      setTyping(false);
      setBusy(false);
    }
  };

  const onSend = () => {
    if (value.trim()) void send(value);
  };

  return (
    <div className="mx-auto mt-7 w-full max-w-[760px] overflow-hidden rounded-xl bg-white text-ink shadow-hero">
      {aiMode && convo.length > 0 && (
        <div
          ref={scrollRef}
          className="flex max-h-[360px] flex-col gap-3.5 overflow-y-auto p-[18px] text-left"
        >
          {convo.map((m, i) => {
            if (m.role === "user") {
              return (
                <div
                  key={i}
                  className="max-w-[82%] self-end rounded-2xl rounded-br-[5px] bg-green-700 px-4 py-3 text-[15px] leading-normal text-white"
                >
                  {m.text}
                </div>
              );
            }
            if (m.role === "error") {
              return (
                <div
                  key={i}
                  className="max-w-[82%] self-start rounded-2xl rounded-bl-[5px] bg-paper-2 px-4 py-3 text-[15px] leading-normal text-ink"
                >
                  {m.text}{" "}
                  <Link href="/loan-officers" className="font-semibold text-green-700 underline-offset-2 hover:underline">
                    Talk to a loan officer
                  </Link>
                </div>
              );
            }
            return <AnswerBubble key={i} data={m.data} />;
          })}
          {typing && (
            <div className="max-w-[82%] self-start rounded-2xl rounded-bl-[5px] bg-paper-2 px-4 py-3">
              <span className="inline-flex gap-1">
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
              </span>
            </div>
          )}
        </div>
      )}

      {aiMode ? (
        <div className="p-2">
          <div className="flex items-center gap-3 rounded-lg px-4 py-3.5">
            <span className="size-[30px] shrink-0">
              <Mark size={30} label={shortName} />
            </span>
            <input
              className="min-w-0 flex-1 border-0 bg-transparent text-[18px] text-ink outline-none placeholder:text-[#9aa39c]"
              placeholder="Ask me anything, or tell me what you want to do"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSend()}
              aria-label={`Ask ${assistantName}`}
              disabled={busy}
            />
            <button
              type="button"
              aria-label="Voice input"
              className="flex size-[38px] shrink-0 items-center justify-center rounded-full text-[#6b756d] transition-colors hover:bg-paper-2"
            >
              <Mic className="size-5" strokeWidth={1.8} />
            </button>
            <button
              type="button"
              onClick={onSend}
              aria-label="Send"
              disabled={busy}
              className={cn(
                "flex size-[38px] shrink-0 items-center justify-center rounded-full transition-colors",
                value.trim() && !busy ? "bg-spring text-[#04130c]" : "bg-paper-2 text-[#9aa39c]",
              )}
            >
              <ArrowUp className="size-[18px]" strokeWidth={2} />
            </button>
          </div>
          <div className="flex flex-wrap gap-2.5 px-4 pb-2.5">
            {AI_PILLS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => void send(PILL_PROMPTS[p] ?? p)}
                disabled={busy}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-white px-4 text-[14.5px] font-semibold text-ink transition-[border-color,background,transform] duration-150 hover:-translate-y-px hover:border-spring hover:bg-spring-soft disabled:opacity-60"
              >
                {PILL_ICONS[p]} {p}
              </button>
            ))}
          </div>
          {/* Recording / privacy disclosure + always-visible human handoff. */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-3.5 pt-1">
            <p className="text-[12px] leading-snug text-[#6b756d]">
              {assistantName} can make mistakes and may be recorded for quality &amp; compliance. Not a
              commitment to lend.
            </p>
            <Link
              href="/loan-officers"
              className="shrink-0 text-[12.5px] font-semibold text-green-700 underline-offset-2 hover:underline"
            >
              Talk to a loan officer
            </Link>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 p-2">
          {INTENTS.map((it) => (
            <Link
              key={it.label}
              href={it.href}
              className="press-3d flex h-16 items-center gap-3.5 rounded-lg bg-spring px-6 text-[18px] font-bold tracking-[-0.01em] text-[#04130c] hover:bg-spring-3"
            >
              <span className="flex w-[26px] justify-center">{it.icon}</span>
              {it.label}
            </Link>
          ))}
        </div>
      )}

      <div className="flex items-center border-t border-line bg-[#fafbf8] px-[18px] py-3.5">
        <div className="ml-auto flex items-center gap-2.5 text-[13.5px] font-semibold">
          <span className="ai-text font-bold">AI mode</span>
          <Switch checked={aiMode} onChange={setAiMode} label="Toggle AI mode" />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors. (`import type { BrainAnswer }` is erased at compile — no server module is bundled into the client.)

- [ ] **Step 3: Manual render checklist (deferred to Task 9 smoke)**

The full visual check runs in Task 9 against the live brain. For now confirm the
file compiles and the structure matches: user bubble (green, right), AnswerBubble
(answer text + Sources list + disclaimer + escalation CTA), error bubble with LO
link, typing dots, pills, intents, AI-mode toggle, footer disclosure.

- [ ] **Step 4: Commit**

```bash
git add src/components/home/AiWidget.tsx
git commit -m "feat(brain): AiWidget renders brain answer verbatim (citations+disclaimer+escalation)"
```

---

### Task 9: Mark DeepSeek dormant, add smoke script, final verification

**Files:**
- Modify: `src/app/api/v1/ai/chat/route.ts` (header comment only)
- Create: `scripts/smoke-brain.ts`

- [ ] **Step 1: Note the DeepSeek route as dormant**

In `src/app/api/v1/ai/chat/route.ts`, update the top doc-comment's first line/section
to record that it is retained but no longer wired to the marketing widget. Replace
the first comment line:

```ts
/**
 * POST /api/v1/ai/chat — streaming MSFG AI assistant (provider-agnostic).
```

with:

```ts
/**
 * POST /api/v1/ai/chat — streaming provider-agnostic assistant (DeepSeek/Claude).
 *
 * DORMANT as of the Mortgage Brain integration: the marketing AiWidget now calls
 * /api/v1/ai/ask (the compliance-bound brain). This route + getAiProvider + the
 * tools are intentionally retained (reversible / available for other platform
 * uses) but are no longer invoked by the homepage widget.
```

(Keep the rest of the comment and all code unchanged.)

- [ ] **Step 2: Add the live-smoke script**

Create `scripts/smoke-brain.ts`:

```ts
/**
 * Dev smoke test: ask the Mortgage Brain a real question through our HTTP client,
 * exercising the exact wire mapping the app uses. Requires the brain running.
 *
 * Usage:
 *   npx tsx scripts/smoke-brain.ts "Can I use gift funds for my down payment?" [baseUrl]
 * Default baseUrl: http://localhost:8080
 */
import { HttpMortgageBrainClient } from "../src/server/ai/brain/httpBrainClient";

async function main() {
  const question = process.argv[2] ?? "Can I use gift funds for my down payment?";
  const baseUrl = process.argv[3] ?? process.env.BRAIN_BASE_URL ?? "http://localhost:8080";
  const client = new HttpMortgageBrainClient({ baseUrl });
  const out = await client.ask({
    sessionId: `smoke-${Date.now()}`,
    question,
    clientIp: "127.0.0.1",
  });
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 3: Run the full test suite + typecheck**

Run: `npx vitest run` → Expected: ALL tests pass (existing suite + the new brain/config/transcript/route tests).
Run: `npx tsc --noEmit` → Expected: no errors.

- [ ] **Step 4: Live smoke against the running brain**

Run: `npx tsx scripts/smoke-brain.ts "Can I use gift funds for my down payment?"`
Expected: a JSON `{ ok: true, answer: { ... } }` with `answer`, `disclaimer`, and
(corpus-dependent) `citations` / `humanEscalationRequired`. A refusal/escalation is
also a valid result (proves the contract + mapping). If the brain is down you'll get
`{ ok: false, kind: "unavailable" }` — start it (`cd /Users/zacharyzink/MSFG/msfg-rag && ./gradlew bootRun`) and retry.

- [ ] **Step 5: Optional full-stack UI smoke**

To see the widget render against the live brain locally, temporarily enable the brain
for the dev tenant, then revert:

```bash
# Enable (one-off): set the dev tenant's published CONFIG revision brain fields.
# Easiest path is the running app's CMS config editor if Cognito is set up locally;
# otherwise flip DEFAULT_TENANT_CONFIG.ai.brain to { enabled:true, baseUrl:"http://localhost:8080" }
# in src/content/site.ts TEMPORARILY, run `npm run dev`, toggle "AI mode" on the
# homepage, ask "Can I use gift funds for my down payment?", verify the answer +
# Sources + disclaimer + (if flagged) the loan-officer CTA render. Then `git checkout
# src/content/site.ts` to revert.
```

This step is verification-only — do not commit any temporary enable.

- [ ] **Step 6: Local production build (final gate)**

Run: `npm run build`
Expected: build succeeds. (`next build` tolerates the repo's pre-existing
`no-explicit-any` lint debt.) Confirm `/api/v1/ai/ask` appears as a `ƒ` (dynamic)
route in the route table.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/v1/ai/chat/route.ts scripts/smoke-brain.ts
git commit -m "chore(brain): mark DeepSeek chat dormant + add brain smoke script"
```

---

## Post-implementation (controller handles these — not subagent tasks)

- **Final holistic review** of the whole branch (subagent-driven-development final review).
- **Merge `brain-chat-integration` → main** via superpowers:finishing-a-development-branch.
- **HOLD the staging deploy** until the brain is reachable from the deploy target. The
  spec accepts the brain-disabled "talk to a loan officer" fallback as no-regression,
  but to avoid swapping the currently-live DeepSeek chat for that fallback in prod, we
  keep staging on the current build until go-live. When the brain is on EC2:
  1. Set MSFG's `config.ai.brain = { enabled: true, baseUrl: "https://api.<brain-domain>" }`
     (via the CMS config editor or a seed update).
  2. Confirm the brain whitelisted our server IP / honors `X-Forwarded-For` (rate-limit).
  3. Deploy + verify the widget renders verbatim brain answers with citations.

## Self-Review (completed by author)

- **Spec coverage:** brain client interface+DTOs (T2) ✓; httpBrainClient Zod+error-mapped (T3) ✓; getMortgageBrain factory (T6) ✓; config.ai.brain schema (T1) ✓; proxy route tenant-scoped + rate-limit + transcript-by-conversationId + compliant fallback (T7) ✓; AiWidget verbatim answer+citations+disclaimer+escalation (T8) ✓; retire DeepSeek dormant (T9) ✓; gated behind config.ai.brain.enabled (T1+T6+post) ✓; live smoke vs localhost:8080 (T9) ✓; compliance invariants (verbatim render, disclaimer always, escalation CTA, no fabricated answer) realized in T2/T7/T8 ✓.
- **Placeholder scan:** no TBD/TODO; every code step is complete.
- **Type consistency:** `BrainAnswer`/`BrainCitation`/`BrainAskInput`/`BrainResult`/`MortgageBrainClient` defined in T2 and used identically in T3/T6/T7/T8; `parseBrainResponse`, `unavailableAnswer`, `buildAskRequestBody`, `HttpMortgageBrainClient`, `checkRateLimit`, `findOrCreateBrainSession`, `nextOrderIndex`, `getMortgageBrain` referenced with consistent signatures throughout.
