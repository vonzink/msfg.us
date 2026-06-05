# Mortgage Brain → Marketing Chat Integration — Design Spec

**Date:** 2026-06-05
**Status:** Approved (design) → ready for planning
**Branch:** `brain-chat-integration`

## Context

The **MSFG Mortgage Brain** is an external, source-grounded mortgage Q&A service
(Java 21 · Spring Boot 3.5 · Spring AI · Postgres 16 + pgvector) built in a
separate repo (`/Users/zacharyzink/MSFG/msfg-rag`). Its integration contract for
the website lives at `msfg-rag/docs/website-integration.md`.

**The critical fact that shapes this design:** the brain is **not a retriever** —
it is a complete, compliance-bound **answer service**. Its pipeline does the whole
job itself:

```
QuestionClassifier (eligibility/legal/tax/rates → escalate, fraud → refuse)
  → hybrid retrieval (pgvector cosine + Postgres FTS + metadata filters)
  → locked compliance prompt template
  → its OWN Claude generation (OpenAI fallback)
  → answer validation (prohibited-phrase + citation gate)
  → audit log (PII-redacted)
  → returns { answer, citations, confidence, humanEscalationRequired, disclaimer }
```

Its contract is emphatic: **"Do not rewrite, truncate, or paraphrase `answer`,
`disclaimer`, or citations"** and **"the refusal IS the correct, compliant
behavior."** Therefore the only compliant way to consume this brain is to render
its answer **verbatim** — feeding its output into another LLM (e.g. the site's
DeepSeek assistant) to re-answer would paraphrase a compliance-locked answer and
violate the contract.

The website already has a working, separate AI: `POST /api/v1/ai/chat`, a DeepSeek
agentic loop (tools: payment calc, rate lookup, program explain, lead capture)
that streams into `AiWidget`. This integration **replaces the brain's role** in
that widget.

## Decision (locked)

**"Brain becomes the chat."** The widget's mortgage answers come straight from the
brain, rendered verbatim (answer + citations + disclaimer + escalation CTA). The
DeepSeek agentic loop is **retired as the answer source** but kept **dormant in the
codebase** (route + `AiProvider` + tools left in place — fully reversible, no
deletion). Calculators stay as the existing dedicated widgets (`QuickEstimate`,
`RateTable`); lead capture fires from the escalation CTA into the current
Postgres + GHL pipeline.

## Goals

- The marketing chat answers mortgage questions through the brain, **verbatim**,
  with citations + disclaimer + escalation handling — compliance-first.
- Server-side proxy (no direct browser → brain), tenant-scoped, brain URL in
  **per-tenant config** (no hardcoded knowledge source — platform invariant).
- Graceful degradation when the brain is disabled/unconfigured/unreachable —
  **never a fabricated mortgage answer**.
- Build + live-smoke now against `localhost:8080`; ship to MSFG **gated** behind
  `config.ai.brain.enabled = false` until the brain is deployed to EC2.
- MSFG marketing site + the rest of the platform stay otherwise unchanged.

## Non-goals (YAGNI)

- Conversation-history page (`GET /api/ai/conversations/{id}`) — we persist the
  brain's `conversationId` for later, but build no history UI now.
- Deleting the DeepSeek `/api/v1/ai/chat` route, `AiProvider`, or its tools — left
  dormant.
- Per-tenant document upload / corpus management — that is the brain's concern, via
  its own admin API (never called from the browser).
- Token streaming — the brain is request/response; we show a typing indicator.

## Architecture — data flow

```
Browser (AiWidget, "use client")
  │  POST /api/v1/ai/ask   { sessionId, conversationId?, question, loanType?, state? }
  ▼
/api/v1/ai/ask  (Next route handler, request-time, tenant-scoped)
  │  1. resolve tenant (host / TENANT_SLUG)
  │  2. getMortgageBrain()  → reads config.ai.brain (enabled, baseUrl) + optional secret
  │     └─ null when disabled/unconfigured → compliant fallback response
  │  3. our rate-limit (per sessionId / client IP)
  │  4. MortgageBrainClient.ask(input)   ─────────────►  POST {baseUrl}/api/ai/mortgage/ask
  │        (server-to-server, forwards X-Forwarded-For,  ◄─────────  { conversationId, answer,
  │         60s timeout, Zod-validates response)                       citations, confidence,
  │  5. best-effort transcript: ChatSession + ChatMessage,             humanEscalationRequired,
  │     store conversationId in session metadata                       disclaimer }
  ▼
  JSON response (the BrainAnswer DTO, verbatim) | typed error
  │
  ▼
Browser renders VERBATIM:
  answer (unmodified) + citations ("Sources:") + disclaimer (ALWAYS)
  + "Talk to a licensed loan officer" CTA (prominent when humanEscalationRequired)
```

## Components

Each is isolated, single-purpose, and independently testable.

### 1. `src/server/ai/brain/types.ts` — interface + DTOs
- `BrainCitation`: `{ sourceName, documentName, section, pageNumber, effectiveDate }`
  — all fields nullable (contract says fields may be null).
- `BrainAnswer`: `{ conversationId, answer, citations: BrainCitation[], confidence,
  humanEscalationRequired, disclaimer }`.
- `BrainAskInput`: `{ question, sessionId, conversationId?, loanType?, state?,
  clientIp? }`.
- `BrainResult` (discriminated union the route/UI map to compliant states):
  `{ ok: true; answer: BrainAnswer }
   | { ok: false; kind: "validation" | "rate_limited" | "unavailable"; message: string }`.
- `MortgageBrainClient` interface: `ask(input: BrainAskInput): Promise<BrainResult>`.

### 2. `src/server/ai/brain/httpBrainClient.ts` — HTTP adapter
- Implements `MortgageBrainClient`.
- `POST {baseUrl}/api/ai/mortgage/ask`, `Content-Type: application/json`, body maps
  our camelCase input → the contract's JSON.
- Forwards the real client IP as `X-Forwarded-For` (so the brain can honor per-IP
  limits behind our trusted proxy).
- 60s timeout (`AbortController`); the contract warns 3–10s typical, do not set
  client timeouts below 60s.
- **Zod-validates** the response body (defensive against contract drift) → maps to
  `BrainAnswer`. The brain returns `snake_case` citation fields
  (`source_name`, `document_name`, `page_number`, `effective_date`) → map to camelCase.
- Error mapping → `BrainResult`:
  - HTTP 400 → `{ ok:false, kind:"validation", message: body.error }`
  - HTTP 429 → `{ ok:false, kind:"rate_limited", message }`
  - HTTP 500 / network / timeout / Zod-parse failure → `{ ok:false, kind:"unavailable", message }`
- Never throws to the caller; always resolves a `BrainResult`.

### 3. `src/server/ai/brain/index.ts` — factory
- `getMortgageBrain(): Promise<MortgageBrainClient | null>`.
- Reads `config.ai.brain` from `getTenantConfig()`; returns `null` when
  `enabled === false` or `baseUrl` is empty.
- Optional: reads a `brain_api_key` tenant secret for future auth (the contract
  currently needs none — forward as a header only if present).

### 4. `src/content/site.ts` — config schema
- Extend `AiConfigSchema` with a `brain` object:
  ```ts
  brain: z.object({
    enabled: z.boolean().default(false),
    baseUrl: z.string().default(""),
  }).default({ enabled: false, baseUrl: "" })
  ```
- `DEFAULT_TENANT_CONFIG` / MSFG seed: `brain.enabled = false`, `baseUrl = ""`
  (dormant until the brain is deployed). Backward-compatible default so existing
  stored configs parse.

### 5. `src/app/api/v1/ai/ask/route.ts` — proxy route
- `POST` only. Request body validated with a Zod schema mirroring `BrainAskInput`
  (`question` required ≤2000 chars; `sessionId` required ≤255; rest optional).
- Resolve tenant (existing helper). `getMortgageBrain()`.
  - `null` → **compliant fallback** 200 JSON: a `BrainAnswer`-shaped object with a
    neutral "the assistant is unavailable right now — talk to a licensed loan
    officer" message, `humanEscalationRequired: true`, empty citations, the standard
    disclaimer. **No fabricated mortgage content.**
- Our own lightweight rate-limit (in-memory, per-process — adequate for the
  single-instance pm2/EC2 deploy; keyed by `sessionId` + client IP); on trip → 429
  with the contract's slow-down message.
- Call `brain.ask({ ...body, clientIp })`.
- Best-effort transcript (never blocks/fails the answer): **after** the brain
  responds, find-or-create a `ChatSession` keyed by the brain `conversationId`
  (Prisma JSON filter on `metadata`; the brain mints `conversationId` on the first
  turn, so we create-then-store it, and find-then-append on follow-ups), then append
  the user question + assistant `answer` as `ChatMessage` rows with incrementing
  `orderIndex`. All failures swallowed. (The brain keeps its own authoritative
  conversation store + audit log; ours is the tenant-side record tying chat to
  tenant/lead.)
- Return: `ok` → the `BrainAnswer` DTO verbatim (200). `!ok` → JSON
  `{ error, kind }` with the matching status (400 / 429 / 503) — the widget maps to
  compliant UI.

### 6. `src/components/home/AiWidget.tsx` — UI rewrite
- Replace the SSE/DeepSeek flow with a single JSON `fetch("/api/v1/ai/ask")`.
- State: `sessionId` (generate once, persist in `sessionStorage`), `conversationId`
  (set from the first response, echo on follow-ups), transcript, `pending`.
- Typing/thinking dots while the request is in flight (3–10s).
- Render, **verbatim and unmodified**:
  - `answer` — never paraphrased/truncated.
  - `citations` under the answer ("Sources: …"); skip null fields; sanitize
    newlines for display.
  - `disclaimer` — with **every** answer, always visible.
  - When `humanEscalationRequired` → **prominent** "Talk to a licensed loan officer"
    CTA (the existing `/loan-officers` link, elevated visually) alongside the answer.
- Error states from the route: 400 → show the message; 429 → "You're asking
  questions quickly — give it a few seconds."; 503/unavailable → generic retry + LO
  CTA. Keep the quick-prompt pills.

### 7. Retire DeepSeek as the answer source
- `AiWidget` no longer calls `/api/v1/ai/chat`.
- Leave the `/api/v1/ai/chat` route, `getAiProvider()`, the providers, and the
  tools **in place and dormant** (a one-line code comment + a note in this spec
  record that they are intentionally retained for reversibility / other platform
  uses). No deletion, no behavior change to those files.

## Compliance invariants (baked into route + widget, asserted in tests)

1. `answer`, `disclaimer`, and `citations` are rendered **verbatim** — never
   paraphrased, summarized, or truncated.
2. The `disclaimer` is shown with **every** answer.
3. `humanEscalationRequired === true` → a prominent licensed-loan-officer CTA.
4. On refusal / error / disabled → **no fabricated mortgage answer**; surface the
   brain's message (refusals are correct) or the LO CTA.
5. The browser never calls the brain directly and never calls admin endpoints; no
   API keys in frontend code.

## Error-handling matrix

| Condition | Route behavior | Widget render |
|---|---|---|
| Brain disabled / no URL | 200, compliant fallback `BrainAnswer` (escalate=true) | neutral message + LO CTA |
| Our rate-limit tripped | 429 `{error, kind:"rate_limited"}` | "asking quickly — wait a few seconds" |
| Brain 400 (validation) | 400 `{error, kind:"validation"}` | show the message |
| Brain 429 | 429 `{error, kind:"rate_limited"}` | slow-down message |
| Brain 500 / timeout / network / bad body | 503 `{error, kind:"unavailable"}` | generic retry + LO CTA |
| Success | 200 `BrainAnswer` verbatim | answer + citations + disclaimer (+ CTA if escalate) |

Transcript persistence failures are swallowed (best-effort) and never affect the
response.

## Rate limiting through a proxy (the one integration nuance)

Proxying collapses all visitors to **our server IP**, so the brain's per-IP limit
(10 questions/min) would throttle the entire site. Mitigation, both layers:
1. Our route forwards `X-Forwarded-For` with the real client IP — the brain can
   honor per-client limits **if** it trusts our proxy.
2. Our route enforces its own lightweight per-`sessionId`/IP limit as the primary
   guard.

**Deploy dependency:** coordinate with the brain team to whitelist our server IP /
honor the forwarded header before go-live. Until then, dev/staging traffic volume
is low enough not to trip it.

## Rollout / deployment

- MSFG ships with `config.ai.brain.enabled = false` (dormant). The widget falls
  back to the compliant "talk to a loan officer" state — **no regression risk**,
  since the brain path is off until enabled.
- Build + **live-smoke** against the locally-running brain (`http://localhost:8080`,
  confirmed up) via a dev tenant config or a local override.
- When the brain is deployed to EC2 (`https://api.<domain>`, behind Nginx): set
  `brain.baseUrl` + `brain.enabled = true` in MSFG's tenant config (via the CMS
  config editor or seed), confirm the brain has whitelisted our origin/IP, and the
  chat goes live.
- Server-side proxy → the contract's CORS coordination is **not needed** for us
  (no browser → brain calls).

## Testing strategy

- **Brain client** (`httpBrainClient.test.ts`): Zod parse of a sample contract
  response (snake_case → camelCase, nullable citation fields); error mapping for
  400/429/500/timeout/malformed body; `X-Forwarded-For` is sent.
- **Config** (`site.test.ts` or config test): `ai.brain` parses; default is
  `enabled:false`; a stored config without `brain` still parses (backward-compat).
- **Route** (`ask.route.test.ts` or service-level): disabled → compliant fallback;
  success → returns verbatim + records transcript (mocked); error passthrough with
  correct status; our rate-limit trips.
- **Widget**: renders citations + disclaimer + escalation CTA; maps each error
  state. (Light component test, matching existing repo patterns.)
- **Live smoke** (manual, during execution): a real question to the running brain
  at `localhost:8080` → verbatim answer + real citations rendered.
- Gates per task: `tsc --noEmit`, `vitest`, and a local `next build` only at the
  final verify step (never per-task — build reads prod).

## Open dependencies (external to this work)

1. **Brain EC2 deployment** + public URL (`https://api.<domain>`) — gates go-live.
2. **Brain-side allowlist** of our server IP / honoring `X-Forwarded-For` — gates
   correct rate-limiting at scale.
3. The brain's **production CORS / origins** — moot for us (server-side proxy), but
   the brain team should still be told our origins for any future direct use.
