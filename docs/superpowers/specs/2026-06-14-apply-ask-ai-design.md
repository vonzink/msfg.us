# Ask AI in the Application — Design

**Date:** 2026-06-14
**Status:** Approved (brainstorm 2026-06-14)
**Builds on:** the hero AI chat (`src/components/home/hero-chat/*`) and the existing streaming chat endpoint `POST /api/v1/ai/chat`.

## Summary

Wire the dead **"Ask AI"** button in the application wizard ([Wizard.tsx:162](src/components/apply/Wizard.tsx:162)) to a single-thread chat panel powered by the **same RAG brain that powers the hero chat**, so applicants can ask grounded mortgage questions without leaving the funnel. **No backend changes** — the panel reuses the hero's `streamChat()` client and `Convo`/`SourcesPanel` UI against the existing `POST /api/v1/ai/chat` endpoint, inheriting its brain grounding, citations, disclaimer, rate-limiting, transcript recording, and graceful fallback. The fanned-deck/bloom hero layout is **not** reused.

## Decisions locked (brainstorm 2026-06-14)

1. **Form factor:** drawer on desktop (≥981px, ~380px right slide-in over a scrim that dims the wizard) + full-screen sheet on mobile (≤980px). Single-thread.
2. **Context:** intent-aware starter chips, **applicant answers stay private** — the entered `answers` are never sent to the assistant. The only step-derived content that may be sent is the current step's *question text* (`step.q`), via an optional "Help me with this step" chip.
3. **Persistence (default):** the conversation survives wizard step navigation and close/reopen; it resets only on a full page reload.

## Why this is "the same brain as the hero"

The hero chat calls `POST /api/v1/ai/chat` (SSE, agentic loop). That route's `search_guidelines` tool calls the tenant Mortgage Brain (`getMortgageBrain()` → `config.ai.brain`) and returns grounded text + structured `sources` (citations, disclaimer, `humanEscalationRequired`). Calling the **same endpoint** with the **same `streamChat` client** gives the apply panel the identical experience. When the brain is disabled/unconfigured, the route already returns the graceful "a licensed loan officer can help" fallback — same as the hero.

## Architecture

### Reuse (no changes to these)
- `streamChat()` — pure SSE client (`src/components/home/hero-chat/chatClient.ts`); not coupled to `useThreads`.
- `threads.ts` reducers + types (`Thread`, `Msg`, `Sources`, `ChatHistoryMsg`, `ChatEvent`).
- `Convo.tsx` — single-thread message list + composer (already Deck-independent; renders `SourcesPanel`, typing dots, streaming caret, auto-scroll, `ChatMarkdown`).
- `SourcesPanel.tsx`, `GrowTextarea.tsx`, `@/components/ai/ChatMarkdown`.

### NOT reused (hero-specific)
- `Deck.tsx`, `ThreadCard.tsx`, `RestingCard.tsx`, `HeroBloomShell.tsx`, `useThreads.tsx` (the 5-thread fan / bloom choreography).

### New
1. **`useApplyChat`** (`src/components/apply/ask-ai/useApplyChat.ts`, `"use client"`) — a single-thread version of `useThreads`. Holds one `Thread`, reuses the `threads.ts` reducers, and on `send(text)` calls `streamChat({ sessionId, messages, onEvent })`, mapping `session` → set sessionId, `text` → append delta, `tool` → (optional busy/label), `sources` → attach to the assistant `Msg`, `done` → finish, `error` → error `Msg`. Exposes `{ thread, send, setDraft, busy }`. The messages sent are **only** user turns + prior assistant turns (no `answers`).
2. **`ApplyChatPanel`** (`src/components/apply/ask-ai/ApplyChatPanel.tsx`, `"use client"`) — the drawer/sheet shell. Props: `open`, `onClose`, `intent`, `assistantName`, `shortName`, `iconSrc`, `stepQuestion`. Renders: a scrim (desktop) / full-screen container (mobile), a header (assistant identity + close button), the empty-state (greeting + starter chips) when `thread.msgs.length === 0`, and `Convo` otherwise. a11y: `role="dialog"` + `aria-modal="true"`, labelled by the header; focus trap; Escape closes; focus returns to the trigger button; slide-in honors `prefers-reduced-motion`. Mounts at `z-50`.
3. **Starter chips** — new module `src/content/applyChatStarters.ts`: `Record<Intent, string[]>` of 3–4 starters per intent (buy/refi/cash). Clicking a chip calls `send(chip)`. Plus one optional **"Help me with this step"** chip whose payload references **only** `stepQuestion` (e.g. `On a mortgage application, what does "{stepQuestion}" mean and how should I answer it?`) — never the applicant's answer.

### Wiring (modified)
- **`src/components/apply/Wizard.tsx`** — add `const [chatOpen, setChatOpen] = useState(false)` and a `ref` to the trigger button. The existing fixed button gets `onClick={() => setChatOpen(true)}`, `aria-haspopup="dialog"`, `aria-expanded={chatOpen}`. Mount `<ApplyChatPanel open={chatOpen} onClose={...} intent={intent} assistantName={assistantName} shortName={shortName} iconSrc={…} stepQuestion={step.q} />` as a sibling of the main content (so it persists across `idx` changes). Source `iconSrc` the same way the hero supplies `Convo`'s `iconSrc`.

## Data flow

Applicant taps button → panel opens → types or taps a starter → `useApplyChat.send()` → `streamChat()` → `POST /api/v1/ai/chat` (SSE) → tenant `AiProvider` agentic loop; if the assistant calls `search_guidelines`, the tenant **Mortgage Brain** is queried and returns grounded text + citations → SSE `sources` event → rendered by `SourcesPanel`. `sessionId` from the first `session` event threads the turns into one `ChatSession` (best-effort server recording). No leads/PII unless the applicant explicitly opts into `capture_lead` (TCPA-gated, unchanged). The wizard's `answers` are never transmitted.

## Compliance

No new surface. The grounding disclaimer + human-escalation CTA render via `SourcesPanel`; lead capture remains opt-in and TCPA-gated server-side. The panel is informational ("not a commitment to lend") via the same system prompt as the hero.

## File inventory

**New**
- `src/components/apply/ask-ai/useApplyChat.ts` (+ `useApplyChat.test.ts`)
- `src/components/apply/ask-ai/ApplyChatPanel.tsx`
- `src/content/applyChatStarters.ts` (+ a small test that each intent has ≥1 non-empty starter)

**Modified**
- `src/components/apply/Wizard.tsx` (state + button `onClick`/aria + mount the panel)

## Testing

**Unit (vitest, node env):**
- `useApplyChat` event mapping: a `send` produces a user `Msg`, `text` events append to the assistant `Msg`, a `sources` event attaches citations, `done` finalizes, `error` yields an error `Msg`; `sessionId` is captured from the `session` event. (Drive via a stubbed `streamChat`/`onEvent`, or test the pure reducer mapping.)
- `applyChatStarters`: every `Intent` key has ≥1 non-empty starter; the "help with this step" payload includes the passed step text and **not** any answer.

**Browser (preview):**
- On `/apply/buy`, `/apply/refi`, `/apply/cash`: tap **Ask AI** → panel opens; type a question → streamed answer renders; citations/disclaimer show when the brain is enabled, otherwise the graceful fallback (dev brain is off by default).
- Starter chip sends; "Help me with this step" references the current question only.
- Conversation persists across **Next/Back** step navigation and after close/reopen; resets on full reload.
- Escape closes and returns focus to the button; `role="dialog"`/`aria-modal` present; focus trapped.
- Desktop (≥981px): right drawer + dimmed wizard scrim. Mobile (≤980px): full-screen sheet. Reduced-motion: no slide animation.
- Network panel shows `POST /api/v1/ai/chat` (SSE); console clean.

## Out of scope / follow-ups

- Any change to the chat endpoint, tools, providers, or the brain.
- Multi-thread chat inside the apply panel (single thread only).
- Persisting the apply conversation beyond the automatic best-effort `ChatSession` recording.
- Sending the applicant's structured `answers` to the assistant (explicitly excluded for privacy; could be revisited as an opt-in later).
- Enabling/configuring the Mortgage Brain in any environment (deployment/config concern, not this change).
