# Design history

Every sizeable feature on this site was designed in a **spec** and built from a **plan**. These files are a record of what was decided and why. They are not kept up to date after the work ships, so trust the code over these documents when the two disagree.

File names start with the date the document was written.

## Specs (what and why)

| Date | Document |
|---|---|
| 2026-06-04 | [Design: Multi-tenant platform foundation](specs/2026-06-04-multi-tenant-platform-design.md) |
| 2026-06-04 | [Design: Phase B — Per-tenant config, runtime theming & SEO](specs/2026-06-04-phase-b-tenant-config-theming-design.md) |
| 2026-06-05 | [CMS & SEO Management System — Design](specs/2026-06-05-cms-seo-management-design.md) |
| 2026-06-05 | [Mortgage Brain → Marketing Chat Integration — Design Spec](specs/2026-06-05-mortgage-brain-chat-integration-design.md) |
| 2026-06-05 | [Design: Phase C — SecretStore + pluggable AiProvider](specs/2026-06-05-phase-c-secretstore-aiprovider-design.md) |
| 2026-06-09 | [Conversational Mortgage Assistant — Agent Foundation (Phase 1)](specs/2026-06-09-mortgage-assistant-agent-design.md) |
| 2026-06-10 | [Hero "Fanned Deck" Multi-Thread Chat — Design](specs/2026-06-10-hero-fanned-deck-chat-design.md) |
| 2026-06-13 | [Purchase (Buy) Application Funnel — Deepening Design](specs/2026-06-13-buy-funnel-deepening-design.md) |
| 2026-06-13 | [Refi Application Funnel — Deepening Design](specs/2026-06-13-refi-funnel-deepening-design.md) |
| 2026-06-14 | [Ask AI in the Application — Design](specs/2026-06-14-apply-ask-ai-design.md) |
| 2026-06-14 | [Pre-Launch Legal & Compliance Checklist](specs/2026-06-14-legal-compliance-checklist.md) |
| 2026-06-14 | [Legal Pages & Site-Wide Compliance — Design](specs/2026-06-14-legal-pages-compliance-design.md) |
| 2026-06-15 | [Sub-Brand Pages, About, Careers & Know Your Lender — Design](specs/2026-06-15-subbrand-marketing-pages-design.md) |
| 2026-06-16 | [Buy Funnel Refinements — Design](specs/2026-06-16-buy-funnel-refinements-design.md) |
| 2026-06-16 | [Finish-Screen Branded Auth + Officer Contact — Design](specs/2026-06-16-finish-screen-branded-auth-design.md) |
| 2026-06-16 | [Apply Funnel → Full Loan Application Hand-off — Design](specs/2026-06-16-funnel-to-loan-application-handoff-design.md) |
| 2026-06-18 | [Client Password Reset + Officer-Assisted Reset — Design](specs/2026-06-18-password-reset-and-officer-assist-design.md) |
| 2026-06-23 | [Mortgage Glossary page — design](specs/2026-06-23-mortgage-glossary-design.md) |
| 2026-06-27 | [Funnel pivot: officer-picker search/grid + finish-step LO off-ramp](specs/2026-06-27-funnel-pivot-officer-picker-and-lo-offramp-design.md) |
| 2026-11-18 | [Public calculators: seven simplified calculators plus a shared kit](specs/2026-11-18-public-calculators-design.md) |

## Plans (step-by-step build instructions)

| Date | Document |
|---|---|
| 2026-06-04 | [Phase A — Tenant Core Implementation Plan](plans/2026-06-04-phase-a-tenant-core.md) |
| 2026-06-04 | [Phase B — Per-tenant Config, Runtime Theming & SEO — Implementation Plan](plans/2026-06-04-phase-b-tenant-config-theming.md) |
| 2026-06-05 | [CMS & SEO Management — Phases 0–2 Implementation Plan](plans/2026-06-05-cms-seo-phase-0-2.md) |
| 2026-06-05 | [Mortgage Brain → Marketing Chat Integration — Implementation Plan](plans/2026-06-05-mortgage-brain-chat-integration.md) |
| 2026-06-05 | [Phase C — SecretStore + Pluggable AiProvider — Implementation Plan](plans/2026-06-05-phase-c-secretstore-aiprovider.md) |
| 2026-06-09 | [Agent Core — `search_guidelines` (Slice 1B) Implementation Plan](plans/2026-06-09-agent-core-search-guidelines.md) |
| 2026-06-09 | [CMS Phase 3 — Per-Page SEO Tools Implementation Plan](plans/2026-06-09-cms-phase-3-seo.md) |
| 2026-06-09 | [Loan Officer Data Foundation Implementation Plan](plans/2026-06-09-loan-officer-data-foundation.md) |
| 2026-06-09 | [Platform Hardening (pre-tenant-#2) Implementation Plan](plans/2026-06-09-platform-hardening-pre-tenant-2.md) |
| 2026-06-10 | [Hero Fanned-Deck Multi-Thread Chat — Implementation Plan](plans/2026-06-10-hero-fanned-deck-chat.md) |
| 2026-06-13 | [Purchase (Buy) Funnel Deepening — Implementation Plan](plans/2026-06-13-buy-funnel-deepening.md) |
| 2026-06-13 | [Refi Funnel Deepening — Implementation Plan](plans/2026-06-13-refi-funnel-deepening.md) |
| 2026-06-14 | [Ask AI in the Application — Implementation Plan](plans/2026-06-14-apply-ask-ai.md) |
| 2026-06-14 | [Legal Pages & Site-Wide Compliance Implementation Plan](plans/2026-06-14-legal-pages-compliance.md) |
| 2026-06-15 | [Sub-Brand Pages, About, Careers & Know Your Lender — Implementation Plan](plans/2026-06-15-subbrand-marketing-pages.md) |
| 2026-06-16 | [Buy Funnel Refinements Implementation Plan](plans/2026-06-16-buy-funnel-refinements.md) |
| 2026-06-16 | [Funnel Hand-off — Part A: mortgage-app Borrower Intake Endpoint](plans/2026-06-16-funnel-handoff-part-a-mortgage-app-intake.md) |
| 2026-06-16 | [Funnel Hand-off — Part B: msfg.us Wiring](plans/2026-06-16-funnel-handoff-part-b-msfg-wiring.md) |
| 2026-06-18 | [Finish-Screen Branded Auth + Officer Contact Implementation Plan](plans/2026-06-18-finish-screen-branded-auth.md) |
| 2026-06-23 | [Mortgage Glossary Implementation Plan](plans/2026-06-23-mortgage-glossary.md) |
| 2026-06-25 | [msfg.us Prod Cutover (GoHighLevel → Next.js funnel on EC2) — Implementation Plan](plans/2026-06-25-msfg-us-prod-cutover.md) |
| 2026-06-27 | [Funnel Pivot (Officer Picker + Finish-Step LO Off-Ramp) Implementation Plan](plans/2026-06-27-funnel-pivot-officer-offramp.md) |
| 2026-11-18 | [Calculators: Shared Kit and Mortgage Calculator](plans/2026-11-18-calculators-shared-kit-and-mortgage.md) |
| 2026-11-18 | [Rate Buydown Calculator](plans/2026-11-18-calculator-buydown.md) |
| 2026-11-18 | [Blended Rate Calculator](plans/2026-11-18-calculator-blended-rate.md) |
| 2026-11-18 | [Refinance Breakeven Calculator](plans/2026-11-18-calculator-refinance-breakeven.md) |
| 2026-11-18 | [Rent vs Buy Calculator](plans/2026-11-18-calculator-rent-vs-buy.md) |
| 2026-11-18 | [Home Budget Calculator](plans/2026-11-18-calculator-budget.md) |
| 2026-11-18 | [APR Calculator](plans/2026-11-18-calculator-apr.md) |
| 2026-11-18 | [Investment Calculator Retrofit](plans/2026-11-18-calculator-investment-retrofit.md) |
| 2026-11-18 | [Mortgage Calculator Modes and Any Term](plans/2026-11-18-calculator-mortgage-modes.md) |

## Handoffs

| Date | Document |
|---|---|
| 2026-06-18 | [Handoff — Client Password Management (msfg.us)](handoffs/2026-06-18-password-management-handoff.md) |
| 2026-11-18 | [Public calculators: handoff after four of eight](handoffs/2026-11-18-public-calculators-handoff.md) |
| 2026-11-18 | [Public calculators: compliance checklist](handoffs/2026-11-18-calculators-compliance-checklist.md) |
