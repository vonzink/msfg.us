<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# MSFG.us — conventions

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · Prisma 7 / Postgres. Path alias `@/*` → `src/*`. **Visual source of truth:** `design-reference/design_handoff_msfg_site/` (read `PAGES.md` + the relevant `prototype/*` files; match high fidelity).

## Design tokens (Tailwind v4)

All tokens live in `src/app/globals.css` `@theme` and generate utilities. **Never hardcode hex** — use the token utilities:

- Emerald: `green-900/850/800/700/600/glow` · Action green: `spring`/`spring-2`/`spring-3`/`spring-soft` · Headline: `mint`
- Neutrals: `ink`, `paper`, `paper-2`, `muted`, `line` · On-dark: `on-dark`/`on-dark-2`/`on-dark-3`, `hair-dark`
- `rounded-sm/md/lg/xl/full` · `shadow-card/3d/pop/hero` · body font is Hanken (`font-sans`)
- Global helper classes: `wrap` (1240px container), `press-3d` (green-button 3D lip press), `step-in` (apply-step entrance), `hero-bg`, `cta-glow`, `ai-text`
- Responsive breakpoint is **980px** → use `max-[980px]:` / `min-[981px]:` (and `max-[900px]:` / `max-[600px]:` for grids)

## Primitives (reuse — don't recreate)

`@/components/ui/Button` (variant green|ghostDark|white|dark|ghost, size sm|md|lg, polymorphic via `href`) · `ui/Mark` · `ui/Section` (+ `SectionHead`, `Eyebrow`) · `ui/Switch` · `@/components/CtaBand` · `@/components/nav/Nav` + `Footer` (global chrome, in the `(marketing)` layout) · `@/lib/cn`, `@/lib/finance`.

## Patterns

- **Server Components by default.** `"use client"` only for interactivity (widgets, wizard, estimator, filters, toggles).
- **Content & config** live in typed `src/content/*.ts` modules; placeholder values are tagged `// [PLACEHOLDER]`. Phase 1 pages read these modules; they are also the seed source for Postgres.
- **Lead pipeline:** client → `POST /api/v1/leads` → `captureLead` (Postgres system-of-record, idempotent on `idempotencyKey`) → best-effort GHL sync (never blocks the user). Integrations sit behind interfaces in `src/server/integrations/` — route handlers depend on the interface, never a vendor SDK.
- **API:** public-stable under `/api/v1/*`; internal helpers under `/api/internal/*`. Webhook receiver verifies signature → dedupes on `WebhookEvent` → dispatches via registry.
- **a11y (WCAG AA):** mint/spring greens only on dark or as button bg with dark text — never small text on light. Keep visible focus rings; real `<label>`s; `aria-*` on disclosures/icon buttons.

## Don't

- Don't ship the prototype HTML; don't pull from `/MSFG/paint/` (unrelated image editor); don't duplicate the `com.msfg.mortgage` LOS schema (Phase 4 hands off to it).
- Don't call `Date.now()`/`new Date()` at module/render scope in statically-generated pages (breaks SSG determinism) — fine inside request-time route handlers.
