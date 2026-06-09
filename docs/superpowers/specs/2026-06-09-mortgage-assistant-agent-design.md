# Conversational Mortgage Assistant — Agent Foundation (Phase 1)

**Date:** 2026-06-09
**Status:** Draft — awaiting review
**Branch context:** built on `cms-phase-3-seo`
**Related specs:**
- `2026-06-05-mortgage-brain-chat-integration-design.md` (the brain proxy this builds on)
- `2026-06-05-phase-c-secretstore-aiprovider-design.md` (provider + secrets)
- `2026-06-05-cms-seo-management-design.md` (the admin/CMS this extends)
- `2026-06-04-multi-tenant-platform-design.md` (KnowledgeRetriever, tenant invariants)

---

## 1. Problem

Today the on-site assistant is a **thin proxy** to the external Mortgage Brain (Java/Spring + pgvector). The brain returns compliance-locked answers **verbatim, with citations**, via `POST /api/v1/ai/ask`. That's correct and safe — but it is, by design, *not* a conversational mortgage professional. It cannot:

- talk like a thoughtful human and ask follow-ups,
- name the right loan officer for a borrower's state,
- tell a borrower which documents to gather for their scenario,
- be steered by staff-editable prompts.

The goal: make the on-site AI **feel like a true mortgage professional** for **public prospects**, with the brain demoted from "the answer" to "one tool among several."

## 2. Decisions locked (from brainstorming)

| Decision | Choice |
|---|---|
| Audience | **Public prospects** (anonymous, no login wall) |
| "What's the status of my loan?" | **Hand off, don't look up** in v1 — route to the borrower's LO / phone. Authenticated lookup deferred to Phase 3. |
| Architecture | **Agent orchestrates; brain becomes a tool** (option A) |
| Default model | **DeepSeek**, with a **C/G/D test switch** (Claude / ChatGPT / DeepSeek) |
| Staff data source of truth | **`s3://msfg.us/rag-brain/MSFG_Loan_Officers.md`**, imported into the structured `LoanOfficer` table |

> **⚠️ RAG reality & Phase 0 status (updated 2026-06-09):** The brain (`msfg-rag`, Java/Spring + pgvector) does **not** auto-read S3 — ingestion is its admin upload API. An **S3→brain sync bridge now exists** (`msfg-rag/scripts/s3-ingest/`, `node sync.mjs`, idempotent, manifest at `rag-brain/_manifest.json`) and the curated corpus (9 docs) has been **ingested + verified against the LOCAL brain.** Still pending: **deploy** the brain (EC2/RDS) and flip the website `ai.brain` to `enabled` — until then `search_guidelines`/`get_document_checklist` are inert in production. Retrieval is strong on guideline/pricing Q&A; weak on dense-table exact cells (chunking) and staff-by-name (use `find_loan_officer`, not RAG). See §11 Phase 0.

## 3. Architecture

**Front-door swap.** The marketing chat widget currently posts to `/api/v1/ai/ask`. Re-point it at the agentic route `/api/v1/ai/chat`, which already streams (SSE), runs a manual agentic loop, and executes tools server-side. The brain's call path is extracted into a shared server function so it can be invoked both by the retained `/ask` route and by the new `search_guidelines` tool.

**Per-turn loop:**

```
prospect message
   │
   ▼
agent (AiProvider + editable system prompt)  ──► streams reply
   │   decides which tools (if any) it needs
   ├─ search_guidelines(question, {loanType?, state?})  ─► BRAIN /ask ─► answer + citations + disclaimer + confidence + escalation
   ├─ find_loan_officer({state?, language?, specialty?}) ─► LoanOfficer DB (tenant-scoped, active)
   ├─ get_document_checklist({loanType, purpose, employmentType?, extras[]?}) ─► docChecklists content module
   └─ request_callback({firstName, lastName, contact, intent, notes}) ─► captureLead (+ GHL sync)
   │
   ▼
agent composes ONE conversational reply (citations + disclaimer preserved verbatim where regulated)
   │
   ▼
SSE stream to client; transcript + model + tool calls recorded (best-effort)
```

**Reused vs. new**
- *Reused:* agentic route `/api/v1/ai/chat`, provider adapters (`openaiCompatible.ts`, `anthropic.ts`), `LoanOfficer`, `captureLead`, `ChatSession`/`ChatMessage`, the CMS config draft/publish/history machinery, the brain client (`getMortgageBrain()`).
- *New:* four tools, the C/G/D model registry + switch UI, prompt-in-DB + `/admin/assistant`, `docChecklists.ts` content, the officer import action, and a `LoanOfficer` schema migration.

## 4. Tools

All tools are tenant-scoped and return typed results. The agent never receives a vendor SDK; tools return neutral data the model reasons over.

### 4.1 `search_guidelines`
- **Input:** `{ question: string, loanType?: string, state?: string }`
- **Returns:** `{ answer, citations: [{sourceName, documentName, section, pageNumber, effectiveDate}], disclaimer, confidence, humanEscalationRequired }`
- **Source:** external brain via the shared brain-call function. Corpus now includes the RAG-markdown matrices (`loandoc.md`, `fannie_mae_eligibility_matrix_rag.md`, `fannie_mae_llpa_matrix_rag.md`) + agency PDFs, synced by the §7.2 bridge. **Inert until Phase 0a** (brain deployed + `ai.brain` enabled).
- **Agent contract:** for regulated content (eligibility, guideline numbers, "do I qualify"), the reply MUST carry the brain's citations + disclaimer. If `humanEscalationRequired` or `confidence` is low → offer `request_callback`. The agent may rephrase *framing* but must not alter regulated substance.

### 4.2 `find_loan_officer`
- **Input:** `{ state?: string, language?: string, specialty?: string, name?: string }`
- **Returns:** array of `{ name, title, nmls, licensedStates[], email, phone, applyUrl, photoUrl }` (active only, tenant-scoped, ordered by `sortOrder`).
- **Source:** `LoanOfficer` table. `state` filter matches against `licensedStates[]` (the migration below).
- **Use:** powers "who can help me in Texas?" and is the hand-off target for loan-status questions.

### 4.3 `get_document_checklist`
- **Input:** `{ loanType: "FHA"|"VA"|"Conventional"|"USDA"|"Jumbo", purpose: "purchase"|"refi"|"cashout", employmentType?: "W2"|"self_employed"|"retired"|"1099", extras?: string[] }`
- **Returns:** `{ proves: string[], alwaysNeeded: string[], conditional: [{ when: string, docs: string[] }] }`
- **Source:** the brain's retrieval over `loandoc.md` (the 31-category document matrix, now in the corpus), via a focused "document needs" query normalized into the shape above. An optional small structured "core checklist" for top scenarios can be added later for instant/offline answers.
- **Behavior:** prove-it-first (identity, income, assets, credit, occupancy, property, title, program eligibility → then match documents) with "typically required / may depend on AUS, investor, and lender overlays" hedging — never final-approval language. *(Replaces the earlier hand-authored `docChecklists.ts` — the matrix is more complete than we'd have built.)*

### 4.4 `request_callback`
- **Input:** `{ firstName, lastName, contact: {email?, phone?}, intent, notes? }`
- **Returns:** `{ ok: true, reference }`
- **Source:** existing `captureLead` (Postgres system-of-record + best-effort GHL). This is how loan-status questions resolve and how low-confidence answers escalate.

## 5. Model switch (C / G / D)

- **Registry** in tenant config — `ai.models`:
  - `C` → Claude (anthropic adapter), `G` → ChatGPT/OpenAI (openai-compatible, OpenAI base URL), `D` → DeepSeek (openai-compatible, DeepSeek base URL). Each entry: `{ adapter, baseUrl, model, keyRef }`. Exact model ids are config, not hardcoded.
  - `ai.defaultModel = "D"`.
- **Request plumbing:** the chat request accepts optional `model: "C"|"G"|"D"`. The **server** validates it against the registry and builds the matching provider with its **server-held key** (SecretStore or env). Unknown/missing → default `D`. The client never sees or sends a key.
- **UI:** a small segmented `[C][G][D]` control on the chat widget, rendered only when `features.modelSwitch` is true → one-line removal before public launch. Selection persists for the session.
- **Prereq:** `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` provisioned alongside the existing `DEEPSEEK_API_KEY`.

## 6. Editable prompts

- **Storage:** the system prompt moves out of `src/server/ai/prompt.ts` into **tenant config** as `ai.assistantPrompt`, structured into labeled sections: *Identity · Tone · Licensing/States · Guardrails · Known-question steering*. The "questions we know we'll get" live in the steering section.
- **Editing:** a new `/admin/assistant` page (EDITOR role) reuses the **existing config draft → publish → history** workflow. No new versioning system.
- **Document-guidance steering (seeded from `loandoc.md`):** the steering section ships pre-filled with the matrix's "Recommended AI behavior" + "RAG Answering Rules" — prove-it-first, borrower-friendly vs. LO-internal framing, list alternatives strongest→weakest, never overpromise acceptance.
- **Caching preserved:** the provider cache key includes a **hash of the resolved prompt string**. Stable between edits → still cached; publishing a new version resets the breakpoint once (edits are infrequent). Live data (officers, states) stays in tools and is **never** interpolated into the prompt — protects the cache and keeps one source of truth.

## 7. Data & knowledge pipeline (S3 `rag-brain/`)

The S3 `rag-brain/` folder is the brain's corpus source, synced in by the bridge in §7.2. Two files get special treatment beyond raw retrieval.

### 7.1 Loan officers (`MSFG_Loan_Officers.md`)

- **Source of truth:** `s3://msfg.us/rag-brain/MSFG_Loan_Officers.md` (15 officers, company NMLS 1314257). Editing staff = editing this one file.
- **Import:** an admin action ("Import officers from S3") parses the markdown → upserts `LoanOfficer` rows keyed on `(tenantId, nmls)`. Removed officers are marked `active=false`, not deleted.
- **Parsed fields per officer:** name, title, NMLS, email, phone, licensed states, bio, photo URL, apply-now URL.
- **Consistency:** the structured table feeds both `find_loan_officer` and the public officers page. The markdown may also live in the brain corpus for narrative bio retrieval, but the **structured tool is authoritative** for staff questions.
- **Data nuances to handle:** one officer uses a `@compassHL.us` email (brand variant); one has no bio; `city` is not present in the source (relax to optional or derive). Specialties/languages are not in the source — left empty in Phase 1, optionally enriched later.

### 7.2 Knowledge corpus + the S3→brain bridge

`rag-brain/` is the brain's RAG source. The bridge `msfg-rag/scripts/s3-ingest/` (`node sync.mjs`, idempotent by filename, `--dry-run`, metadata in `rag-brain/_manifest.json`) pushes each file through the brain's upload API. **Built + run 2026-06-09 → 9 docs ingested locally.** Ingested: `loandoc.md`, `fannie_mae_eligibility_matrix_rag.md`, `fannie_mae_llpa_matrix_rag.md`, `MSFG_Loan_Officers.md`, plus FHA handbook / VA guide / Fannie sellers guide / MI / 500-questions. **Skipped (hygiene):** duplicate `*.pdf` twins of the rag-markdown, `MI Guidelines.webp` (image, no OCR), `Loan Limit…xlsx` (convert to markdown/table). `MSFG_Loan_Officers.md` is corpus *and* the structured-import source (§7.1) — the structured tool stays authoritative for staff questions.

## 8. Schema changes (Prisma)

`LoanOfficer` migration (additive, back-compatible):

| Field | Change |
|---|---|
| `licensedStates String[]` | **NEW** — the authoritative multi-state list `find_loan_officer` filters on |
| `title String?` | NEW |
| `email String?` | NEW |
| `phone String?` | NEW |
| `bio String?` | NEW (long text) |
| `applyUrl String?` | NEW — the per-officer blink.mortgage signup link |
| `state String` → `state String?` | relax (kept as optional home/primary state) |
| `city String` → `city String?` | relax (not in source data) |

`ChatMessage`/`ChatSession`: add `model String?` (which of C/G/D answered) + optional `latencyMs`, `tokensIn`, `tokensOut` for the model comparison.

## 9. Compliance guardrails (non-negotiable)

- Regulated answers round-trip through `search_guidelines`/the brain; **citations + disclaimer preserved**.
- The agent never invents eligibility or guideline numbers. Brain low-confidence / escalation-flagged → offer `request_callback`.
- Keep the licensed-states guardrail (CO, ND, SD, MN, TX, MI, IN). No state-specific advice outside licensed states; if asked about an unlicensed state, say so and offer to connect them.
- No PII lookups in v1 (loan status → hand off).

## 10. Telemetry / model comparison

Each turn records the model used (C/G/D), tool calls made, and latency/token counts on `ChatMessage`. This is the dataset for deciding which model "feels most like a pro" before launch.

## 11. Phasing

- **Phase 0 — Make the brain real (prerequisite for grounded answers).**
  - 0a **Deploy the brain** (EC2 + RDS pgvector) + flip website `ai.brain` to `enabled` with `baseUrl` + `brain_api_key`. — **PENDING (infra).**
  - 0b **S3→brain ingestion bridge** (`msfg-rag/scripts/s3-ingest/`). — **DONE 2026-06-09.**
  - 0c **Verify retrieval** via `/api/ai/documents/test-retrieval`. — **DONE locally** (strong on guideline/pricing; weak on dense-table cells + staff-by-name).
  - *Independent of Phase 0:* `find_loan_officer`, the structured `get_document_checklist` fallback, and `request_callback`.
- **Phase 1 — Conversational agent foundation** (this spec).
- **Phase 2 — Corpus + retrieval polish.** More investor/lender overlays via the 0b bridge; better chunking for dense matrices; optional structured eligibility/LLPA calculator tool.
- **Phase 3 — Authenticated borrower loan lookup.** Borrower identity verification + LOS integration. The deferred PII path.

## 12. Open items / prerequisites

- [x] S3→brain ingestion bridge built + corpus ingested/verified locally (Phase 0b/0c).
- [ ] **Deploy the brain** (EC2/RDS) and set website `ai.brain` `enabled` + `baseUrl` + `brain_api_key` (Phase 0a).
- [ ] Provision `ANTHROPIC_API_KEY` + `OPENAI_API_KEY` for the website agent (the brain already has its own).
- [ ] Tune chunking for dense LTV/LLPA matrices; convert `MI Guidelines.webp` + the loan-limit `.xlsx` to markdown.
- [ ] Decide enrichment of officer specialties/languages (optional, can defer).

## 13. Success criteria (acceptance)

1. A general mortgage question triggers `search_guidelines` and the reply preserves ≥1 citation + the disclaimer.
2. "Who can help me in Texas?" returns only TX-licensed officers (e.g. Kimberly Thomas, Tanya Long) and excludes non-TX officers.
3. "What documents do I need for an FHA loan, self-employed?" returns the structured checklist.
4. "What's the status of my loan?" does **not** fetch PII; it offers a callback / routes to the borrower's LO.
5. A request with `model=C|G|D` routes to the matching provider; invalid/missing → DeepSeek; each turn logs the model used.
6. Editing + publishing the prompt at `/admin/assistant` changes assistant behavior; the cache key changes only on publish.
7. Running the officer import populates `LoanOfficer` with the full roster including multi-state licensing; the public officers page and `find_loan_officer` reflect it.
8. With no AI key configured, the assistant degrades gracefully (no crash, friendly message).
