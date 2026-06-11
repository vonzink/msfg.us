# Hero "Fanned Deck" Multi-Thread Chat — Design

**Date:** 2026-06-10
**Status:** Approved (brainstorm 2026-06-10)
**Design reference:** `Multi-chat Hero Interface.zip` → `design_handoff_fanned_deck/`
(README.md + shared.jsx + concept-fanned-deck.jsx). High-fidelity handoff; recreate
look/motion/behavior with MSFG's real brand assets, tokens, and chat backend.

## Summary

Replace the hero's single-conversation chat card with a two-state experience:

- **Resting:** the familiar single chat card (input, mic/send, disclaimer,
  "Talk to a loan officer", AI-mode toggle footer). Visually today's card,
  restyled per the handoff (30px radius, 22px input).
- **Bloomed:** the instant the first question is submitted, the headline + sub
  collapse and the card blooms into a **fanned deck of up to 5 parallel
  conversation threads**. The active thread sits in front at full height
  (~580px body); the others peek behind as fanned title tabs and shuffle
  forward when clicked. Each thread is its own real conversation against
  `/api/v1/ai/chat` (own `sessionId`, own streamed answers, own citations and
  compliance panel).

Hero extras adopted (user decision): drifting topographic rings in the hero
background, gentle 7s "breathing" loop on the logo mark, and a mint
**"Start an application"** pill under the stats.

Toggle rules (user decision): the AI-mode toggle exists **only on the resting
card** (off → `IntentTabs`). Once bloomed there is no toggle, and the last
thread cannot be closed — the deck persists until reload.

## Architecture

New module `src/components/home/hero-chat/`; `AiWidget.tsx` is retired
(its bubble/sources/stream code moves here). `IntentTabs` is reused as-is.

| Unit | Responsibility |
| --- | --- |
| `HeroChat.tsx` (client) | Orchestrator: owns `aiMode`; renders `RestingCard` (on, not bloomed) / `IntentTabs` (off) / `Deck` (bloomed); reports `onBloom(boolean)` up to the shell. |
| `RestingCard.tsx` | Idle card: 34px logo, 22px input, mic ghost, 44px circular send (idle `paper-2`-ish / filled `green-800` + white arrow when draft non-empty), centered disclaimer, "Talk to a loan officer" link, footer bar with gradient **AI mode** label (`ai-text`) + `Switch`. Enter or send → `launch(question)`. |
| `Deck.tsx` | Fan layout + footer. Absolutely-positioned cards, shared bottom transform-origin. Active: no rotation, `z-30`, parallax tilt. Inactive at depth *d*, direction `dir` (−1 before / +1 after active): `translateY(-(40+(d−1)·26)px) translateX(dir·d·5px) scale(1−d·0.04) rotate(dir·(1.1+d·0.45)deg)`, `z-index: 22−d`. Re-fan transition `transform .55s cubic-bezier(.18,.9,.2,1.05)`. Footer: pips (active = mint, rest `white/30`), "n/5 threads", "Add a question" translucent pill while < 5, mint "Talk to a loan officer" link. |
| `ThreadCard.tsx` | Card chrome: status dot (mint when active), title (600/15.5), inactive one-line first-message preview (ellipsized), card number "01"–"05", × close on the active card only when > 1 thread. Card: white, 24px radius, hero-grade shadow, top row with bottom hairline (`line`). |
| `Convo.tsx` | Message list + composer for the active thread. User bubble right (bg `green-700`, radius `16/16/5/16`); AI bubble left with 20px logo mark (bg `paper-2`, radius `5/16/16/16`), rendered through `ChatMarkdown` + `SourcesPanel`. Streaming: three bouncing dots until first token, blinking mint caret until done. Composer: bordered 15px-radius pill, "Continue this thread…", mic ghost, 36px circular send (fills `green-700` when draft non-empty). Small recording/compliance line under the composer. Empty thread: 34px logo + "Fresh thread — ask anything about this scenario." above the composer. |
| `SourcesPanel.tsx` | Extracted verbatim from `AiWidget`: citations list, always-on disclaimer, escalation CTA. |
| `useThreads.ts` | State engine. `threads: { id, title, titleLocked, draft, busy, sessionId, msgs: ChatTurn[] }[]`, `activeId`. Actions: `launch`, `addThread` (cap 5, **does not steal focus** — new card joins the fan as a peeking tab), `setActiveId`, `closeThread` (no-op at 1 thread; focus falls back to last remaining), `setDraft`, `sendIn(threadId)`. Derived `bloomed = threads.length > 0`. |
| `useChatStream.ts` | The SSE protocol against `POST /api/v1/ai/chat` (moved from `AiWidget.sendViaChat`): per-call history from that thread's msgs, handles `session`/`text`/`sources`/`done`/`error` events, same open-bubble-on-first-of-text-or-sources rule. Each thread keeps its **own `sessionId`** (recording semantics per thread). Concurrent streams across threads are allowed; `busy` is per-thread. |

### Hero shell

`Hero.tsx` stays a Server Component. New client `HeroBloomShell.tsx` receives
the server-rendered headline (H1 + sub) as a ReactNode, wraps it in
`.hero-fade`, and toggles `.is-bloomed` from `onBloom`:

- Collapse: `max-height 480px → 0`, `opacity → 0`, `margin-top → 0`, 3px blur,
  ~500–600ms ease. The wrapper needs `min-height: 0` (flex item) for
  `max-height: 0` to collapse — drive via **CSS class toggle**, not inline
  styles (handoff implementation note).
- Extras rendered by the shell: topographic rings (inline SVG, 5 mint-stroke
  circles at 6–8% opacity, `ringDrift` 26–50s alternate, slight stagger);
  `logoBreath` 7s loop on the existing logo `<img>` (transform-origin bottom);
  "Start an application" pill (`mint` bg, dark text, `rounded-full`,
  `cta-glow`, trailing arrow, hover lift) linking to `/apply/buy`, placed
  under the stats. Only the headline collapses on bloom — the lockup, stats
  row, and pill remain visible below the deck in both states.

New CSS in `globals.css`: `.hero-fade`/`.is-bloomed`, `@keyframes ringDrift`,
`@keyframes logoBreath`, blink caret keyframes. All animation (rings, breath,
fan transitions, bloom collapse, parallax) disabled under
`@media (prefers-reduced-motion: reduce)` — state changes become instant swaps.

### Thread titles

On a thread's first completed exchange, set the title from a small keyword map
on the user's question — Affordability / Rates today / Down payment /
Refinance / Programs — falling back to the question truncated to ~24 chars +
ellipsis. Then `titleLocked = true`. New empty threads show "Thread n" until
first exchange.

## Visual fidelity → tokens

No new hex values. Prototype → existing tokens:

| Prototype | Production |
| --- | --- |
| mint `#7fe6a0` | `mint` (`#7fe3a8`) |
| green800 `#0d3320` (user bubble / send-on) | `green-700` (current user-bubble green, AA on white) |
| hair `#e8eae7` | `line` |
| ink `#1d2a24` / inkSoft `#5f6b64` | `ink` / `muted` (in-card); `on-dark-2/3` on emerald |
| card foot `#f6f6f3` | existing `#fafbf8` footer treatment |
| AI-mode gradient text | existing `ai-text` helper |
| card/deck shadows | `shadow-hero` |
| sage pips/labels on emerald | `on-dark-2` / `white/30` |

One-off arbitrary radii where the handoff exceeds the token scale: resting card
`rounded-[30px]`, deck cards `rounded-[24px]`, composer `rounded-[15px]`.
Hero bg keeps the existing `hero-bg` helper. Body font stays Hanken (the
prototype's Fredoka is explicitly a stand-in). Logo comes from
`config.brand.logos` (tenant config), never a hardcoded asset.

## Interactions

- **Bloom:** first submit creates Thread 1 with the user message, starts the
  stream, sets bloomed; headline collapses simultaneously.
- **Parallax tilt:** mouse-move over the deck → active card
  `perspective(1000px) rotateX(±4°) rotateY(±5°)`; reset on leave. Implemented
  with rAF writing CSS custom properties on the deck element (no React
  re-render per mousemove).
- **Add a question:** appends a peeking empty thread without changing
  `activeId`; active stream continues uninterrupted.
- **Switch:** click any peeking card (mousedown) → it becomes active; deck
  re-fans with the spring curve. Keyboard: peeking cards' top rows are real
  buttons (Enter/Space); on activation, focus moves to the card's composer.
- **Close:** × removes the active thread (≥ 2 threads only); the last
  remaining thread becomes active.
- **Errors:** per-thread error turn with the existing copy + "Talk to a loan
  officer" link; the thread's composer stays usable.

## Responsive (≤ 980px)

The rotated peek-fan is desktop-only. At `max-[980px]`:

- Threads render as a horizontal, scrollable tab row (status dot + title)
  above a single full-width active card — same state engine, no absolute
  positioning, no tilt.
- Active card body height clamps to ~60vh; deck width is fluid.
- Footer row (pips/count/add/officer link) wraps beneath the card unchanged.

## Compliance & a11y

- Recording/"can make mistakes"/"not a commitment to lend" disclosure: on the
  resting card (as today) and repeated in small text under the deck composer.
- Every grounded answer renders `SourcesPanel` (citations + always-on
  disclaimer + escalation CTA when flagged) — unchanged from today.
- `aria-label`s on mic, send, close, AI-mode toggle; pips are presentational
  (`aria-hidden`) with the count text as the accessible status
  (`aria-live="polite"` on "n/5 threads").
- Visible focus rings throughout; WCAG AA: mint only on dark, `green-700`+
  white in bubbles, `muted` on white.

## Out of scope

- Mic/voice input remains a non-functional affordance (as today).
- No persistence of threads across reloads.
- No changes to `/api/v1/ai/chat`, the brain, or recording backend — the
  existing SSE contract is consumed as-is.
- `IntentTabs` (AI off) is unchanged.

## Testing

- **Unit (vitest):** `useThreads` engine — launch creates thread + sets
  active; cap at 5; `addThread` does not change `activeId`; `closeThread`
  no-ops at 1 and falls back to last remaining; title keyword map + truncation
  + locking; per-thread `sessionId` isolation (mocked stream layer).
- **Browser (preview):** bloom on first submit incl. headline collapse;
  re-fan on switch; add-while-streaming keeps streaming; close behavior;
  citations panel renders in a thread; mobile tab-row layout at 375px;
  `prefers-reduced-motion` swaps without animation; keyboard thread switching.
