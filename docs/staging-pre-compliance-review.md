# Staging Pre-Compliance Review — staging.msfg.us

- **Date:** 2026-06-15
- **Deployed build:** `main` @ `fcbb9ab`
- **Method:** Full crawl of all 26 live routes on `staging.msfg.us`, comparing live‑rendered content against the code seed (`src/content/site.ts`, `officers.ts`, `rates.ts`). Focus: anything legal/compliance should not see — placeholders, stale published content, unsubstantiated claims, broken pages.

## Headline

- **All 26 routes return HTTP 200** — no broken pages. ✅
- **Core identity is correct live:** company name *Mountain State Financial Group, LLC*, **NMLS #1314257**, phone **(720) 838‑1246**, email **hello@msfg.us**. ✅ (The `(303) 555‑0142` seen earlier was a *local dev* config, not staging.)
- **But** multiple compliance‑blocking placeholders are live, and the founding‑year correction isn't published.

> **Mechanism (read first):** the live site serves the **published config revision from the DB**, not `src/content`. So most fixes below are **admin edits + re‑publish (+ cache bust)**, NOT a code deploy. The deploy is done; content publishing is the remaining gate. See `[[content-publishing-model]]`.

---

## CRITICAL — blocks a legal/compliance review

1. **Every legal page shows `Last updated: [PLACEHOLDER]`**
   - Pages: `/licensing`, `/terms`, `/privacy-notice`, `/privacy-policy`, `/accessibility`, `/texas-required-notice`, `/nmls-consumer-access`
   - Cause: `legal.effectiveDates` unset (placeholder in seed **and** published config); `effectiveDate()` returns `"[PLACEHOLDER]"`.
   - Fix: enter real effective/last‑updated dates per doc → re‑publish. *(data entry + publish)*

2. **`/licensing` — state license numbers are `[PLACEHOLDER]` for all 7 states** (CO, ND, SD, MN, TX, MI, IN)
   - Cause: `legal.states[].licenseNumber = "[PLACEHOLDER]"` in seed + published config.
   - Fix: enter each state's mortgage license number → re‑publish. *(regulatory requirement)*

3. **`/nmls-consumer-access` — inline `[PLACEHOLDER]` after the NMLS ID**
   - Live: *"Our company NMLS ID is # 1314257 **[PLACEHOLDER]**. We are licensed to originate…"*
   - Fix: complete the copy → re‑publish.

---

## HIGH

4. **Founding year wrong live — `© 2007–2026` and "since 2007"** (should be **2015**)
   - Correct year is **2015** (confirmed — founded 2015‑03‑11; 2007 and 1998 are both wrong). Code seed already 2015 (`b58b13b`); the **published config still serves 2007**.
   - Fix: **re‑publish config** (no code change needed).

5. **Unsubstantiated marketing claims** (compliance)
   - Live stats: **"$1.4B+ funded loans", "4,200+ families served", "21 days avg. close time"**.
   - Apply‑flow testimonial: **"Drew & Anya" (5★)** — appears fictional/placeholder.
   - Fix: substantiate with documented figures or remove; replace the testimonial with a real, consented one (or remove). Claims + testimonials must be substantiated.

---

## MEDIUM

6. **`/rates` shows placeholder/indicative rates** (`rates.ts` = `[PLACEHOLDER]`), and copy says *"updated every business day"* — implies live data.
   - Fix: wire a real rate feed before relying on it, or relabel as sample rates. (Disclaimer copy is present — good.)

7. **`/know-your-lender` renders "coming soon"** — stub content on a footer‑linked Company page.

8. **Coming‑soon stubs linked from nav/footer:** Affordability / Mortgage / Rent‑vs‑buy / HELOC calculators, Media, FAQs → `/coming-soon`. Acceptable pre‑launch; legal should know they're stubs.

---

## LOW / verify

9. **Public API `/api/v1/public/loan-officers`** — automated probe couldn't read the officer array (the `/loan-officers` page renders fine). Confirm the public API returns the roster.
10. **Registered address** ("9035 Wadsworth Parkway, Suite 3400, Westminster, CO 80021") — confirm it appears on `/licensing` / contact where required (it's not on the home page).

---

## Fix routing (what kind of change each needs)

| Item | Re‑publish only | Real data entry → publish | Code/feed |
|---|:--:|:--:|:--:|
| Founding year → 2015 | ✅ | | |
| Legal effective dates (7 pages) | | ✅ | |
| State license numbers (7 states) | | ✅ | |
| `/nmls-consumer-access` copy | | ✅ | |
| Marketing stats + testimonial | | ✅ | |
| Live rates | | | ✅ (rate feed) |
| `/know-your-lender`, coming‑soon stubs | | | ✅ (build pages) |

---

## What's already good

- All 26 routes return 200; sub‑brand pages (Veterans / Reverse / Investment / Commercial / Equity) have real, substantive content (50–55k chars each).
- Company identity correct (name / NMLS #1314257 / phone / email).
- Texas Consumer Notice page present; Equal Housing Lender + NMLS in the legal strip.
- Staging correctly **noindexed** (`robots.txt` → `Disallow: /`).
- Google address autocomplete **live**; refi flow (officer picker, "Other", skippable phone, labeled Back) **live**.
