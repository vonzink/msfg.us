# Funnel Hand-off — Part B: msfg.us Wiring

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the apply-funnel finish step to create a started loan application in the mortgage-app via the Part-A intake endpoint — rebuilding the payload server-side from the persisted lead (`leadId`), resolving the chosen officer, and deep-linking the user to their new application.

**Architecture:** A pure `funnelToIntake()` mapper turns a persisted lead into the IntakeDTO. The `/api/v1/applications` route reads the lead by id, resolves the officer by slug, maps, and calls the (re-pointed) LOS client. `FinishStep` posts `{ leadId }`, carries it across the Cognito login redirect, and deep-links on success.

**Tech Stack:** Next.js 16 (App Router) / React 19 / TypeScript, Prisma 7, Zod 4, Vitest.

**Repo:** `/Users/zacharyzink/MSFG/WebProjects/msfg.us` (paths relative). **Depends on Part A** being deployed (the `/api/loan-applications/intake` endpoint) for end-to-end, but every task here is unit-tested with the client mocked.

**IntakeDTO (consumer side — must match Part A's `IntakeRequest`):**
```ts
type IntakeDTO = {
  sourceLeadId: string; source: string;
  intent: "buy" | "refi" | "cash"; loanPurpose: "Purchase" | "Refinance" | "CashOut";
  borrower: { firstName: string; lastName: string; email: string; phone: string };
  property: { addressLine: string; city: string; state: string; zipCode: string;
              propertyType: string | null; constructionType: string | null; propertyValue: number | null };
  financials: { currentMortgageBalance: number | null; annualIncome: number | null; creditBand: string | null };
  loanOfficer: { email: string; nmls: string; name: string; slug: string } | null;
};
```

---

## File Structure

- **Create** `src/lib/applyIntake.ts` — `IntakeDTO` type + pure `funnelToIntake(lead, officer)`.
- **Create** `src/lib/applyIntake.test.ts` — mapper tests (buy/refi/cash, officer, missing fields).
- **Modify** `src/server/leads/leadService.ts` — add `getLeadById(id)`.
- **Modify** `src/server/integrations/los/losClient.ts` — `LOS_PATH = "/api/loan-applications/intake"`; payload = `IntakeDTO`.
- **Modify** `src/app/api/v1/applications/route.ts` — accept `{ leadId }`, rebuild from the lead, resolve officer, map, call client.
- **Modify** `src/validation/lead.ts` — `applicationHandoffSchema` accepts optional `leadId`.
- **Modify** `src/components/apply/steps/FinishStep.tsx` — post `{ leadId }`; carry `leadId` across login; deep-link on `applicationId`.
- **Modify** `.env.example` — document `LOS_API_BASE`.

---

### Task 1: `funnelToIntake` mapper (TDD)

**Files:**
- Create: `src/lib/applyIntake.ts`
- Test: `src/lib/applyIntake.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { funnelToIntake, type LeadForIntake } from "./applyIntake";

const baseLead: LeadForIntake = {
  firstName: "Zachary", lastName: "Zink", email: "z@example.com", phone: "3035551234",
  intent: "REFI", idempotencyKey: "lead-1",
  answers: { fields: {
    address: { line1: "12750 W 88th Ave", city: "Arvada", state: "CO", zip: "80005" },
    propertyUse: "Primary residence", propertyType: "Single Family",
    homeValue: 485000, mortgageBalance: 312000, creditBand: "Good (680–739)",
    income: 120000, loanOfficer: "zachary-zink",
  } },
};

describe("funnelToIntake", () => {
  it("maps a refi lead to the IntakeDTO", () => {
    const dto = funnelToIntake(baseLead, { email: "zachary.zink@msfg.us", nmls: "451924", name: "Zachary Zink", slug: "zachary-zink" });
    expect(dto.sourceLeadId).toBe("lead-1");
    expect(dto.intent).toBe("refi");
    expect(dto.loanPurpose).toBe("Refinance");
    expect(dto.borrower).toEqual({ firstName: "Zachary", lastName: "Zink", email: "z@example.com", phone: "3035551234" });
    expect(dto.property.addressLine).toBe("12750 W 88th Ave");
    expect(dto.property.city).toBe("Arvada");
    expect(dto.property.propertyType).toBe("PrimaryResidence");
    expect(dto.property.constructionType).toBe("SiteBuilt");
    expect(dto.property.propertyValue).toBe(485000);
    expect(dto.financials.currentMortgageBalance).toBe(312000);
    expect(dto.financials.annualIncome).toBe(120000);
    expect(dto.loanOfficer?.email).toBe("zachary.zink@msfg.us");
  });

  it("maps intent buy→Purchase, cash→CashOut", () => {
    expect(funnelToIntake({ ...baseLead, intent: "BUY" }, null).loanPurpose).toBe("Purchase");
    expect(funnelToIntake({ ...baseLead, intent: "CASH" }, null).loanPurpose).toBe("CashOut");
  });

  it("maps Manufactured property type to constructionType", () => {
    const lead = { ...baseLead, answers: { fields: { ...baseLead.answers.fields, propertyType: "Manufactured home" } } };
    expect(funnelToIntake(lead, null).property.constructionType).toBe("Manufactured");
  });

  it("tolerates missing fields (null officer, no address)", () => {
    const dto = funnelToIntake({ ...baseLead, answers: { fields: {} } }, null);
    expect(dto.loanOfficer).toBeNull();
    expect(dto.property.addressLine).toBe("");
    expect(dto.financials.annualIncome).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/applyIntake.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the mapper**

```ts
import type { StructuredAddress } from "@/lib/leads";

/** The persisted-lead shape this mapper needs (subset of the Prisma Lead). */
export type LeadForIntake = {
  firstName: string; lastName: string; email: string; phone: string;
  intent: "BUY" | "REFI" | "CASH";
  idempotencyKey: string;
  location?: string | null;
  /** lead.answers is JSON; the named funnel fields live under `.fields`. */
  answers: { fields?: Record<string, unknown> } & Record<string, unknown>;
};

export type IntakeOfficer = { email: string; nmls: string; name: string; slug: string };

export type IntakeDTO = {
  sourceLeadId: string; source: string;
  intent: "buy" | "refi" | "cash"; loanPurpose: "Purchase" | "Refinance" | "CashOut";
  borrower: { firstName: string; lastName: string; email: string; phone: string };
  property: { addressLine: string; city: string; state: string; zipCode: string;
              propertyType: string | null; constructionType: string | null; propertyValue: number | null };
  financials: { currentMortgageBalance: number | null; annualIncome: number | null; creditBand: string | null };
  loanOfficer: IntakeOfficer | null;
};

const INTENT: Record<LeadForIntake["intent"], { intent: IntakeDTO["intent"]; loanPurpose: IntakeDTO["loanPurpose"] }> = {
  BUY: { intent: "buy", loanPurpose: "Purchase" },
  REFI: { intent: "refi", loanPurpose: "Refinance" },
  CASH: { intent: "cash", loanPurpose: "CashOut" },
};

/** Funnel propertyUse → app occupancy. */
function occupancy(use: unknown): string | null {
  switch (String(use)) {
    case "Primary residence": return "PrimaryResidence";
    case "Second home": return "SecondHome";
    case "Investment property": return "Investment";
    default: return null;
  }
}
/** Funnel propertyType → app constructionType (only manufactured is distinguished). */
function construction(type: unknown): string | null {
  if (type == null) return null;
  return String(type).toLowerCase().includes("manufactured") ? "Manufactured" : "SiteBuilt";
}
function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Pure: persisted lead (+ resolved officer) → IntakeDTO for the app hand-off. */
export function funnelToIntake(lead: LeadForIntake, officer: IntakeOfficer | null): IntakeDTO {
  const f = lead.answers?.fields ?? {};
  const addr = (f.address ?? {}) as Partial<StructuredAddress>;
  const map = INTENT[lead.intent];
  return {
    sourceLeadId: lead.idempotencyKey,
    source: "apply-wizard",
    intent: map.intent,
    loanPurpose: map.loanPurpose,
    borrower: { firstName: lead.firstName, lastName: lead.lastName, email: lead.email, phone: lead.phone },
    property: {
      addressLine: addr.line1 ?? "", city: addr.city ?? "", state: addr.state ?? "", zipCode: addr.zip ?? "",
      propertyType: occupancy(f.propertyUse), constructionType: construction(f.propertyType),
      propertyValue: numOrNull(f.homeValue),
    },
    financials: {
      currentMortgageBalance: numOrNull(f.mortgageBalance),
      annualIncome: numOrNull(f.income),
      creditBand: typeof f.creditBand === "string" ? f.creditBand : null,
    },
    loanOfficer: officer,
  };
}
```

> Note: `sourceLeadId` uses `lead.idempotencyKey` (the stable funnel key the app dedupes on), NOT the Prisma row id — this keeps the idempotency key identical to what the funnel generated.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/applyIntake.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/applyIntake.ts src/lib/applyIntake.test.ts
git commit -m "feat(apply): funnelToIntake mapper — persisted lead → app IntakeDTO"
```

---

### Task 2: `getLeadById` reader

**Files:**
- Modify: `src/server/leads/leadService.ts`

- [ ] **Step 1: Add the reader** (append to the file)

```ts
/** Read a single lead by id, tenant-scoped. null when not found. */
export async function getLeadById(id: string): Promise<Lead | null> {
  const db = await getTenantDb();
  return db.lead.findFirst({ where: { id } });
}
```

(`Lead` and `getTenantDb` are already imported at the top of the file.)

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/server/leads/leadService.ts
git commit -m "feat(leads): getLeadById reader (tenant-scoped)"
```

---

### Task 3: Re-point the LOS client to the intake endpoint

**Files:**
- Modify: `src/server/integrations/los/losClient.ts`

- [ ] **Step 1: Change the path and payload type**

Replace the `LOS_PATH` constant:
```ts
const LOS_PATH = "/api/loan-applications/intake";
```

Replace the `LosApplicationPayload` interface with an import + alias (the client now sends the IntakeDTO verbatim):
```ts
import type { IntakeDTO } from "@/lib/applyIntake";
export type LosApplicationPayload = IntakeDTO;
```

The function signature `createLoanApplication(idToken, payload: LosApplicationPayload)` is unchanged; it already POSTs `payload` as JSON and reads `{ id | applicationId | application.id }` from the response. Confirm the response parse also accepts a numeric id:
```ts
const applicationId = data?.applicationId ?? data?.id ?? data?.application?.id;
return { ok: true, applicationId: applicationId != null ? String(applicationId) : undefined };
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors (the route in Task 4 will supply the new payload shape; until then this is type-only).

- [ ] **Step 3: Commit**

```bash
git add src/server/integrations/los/losClient.ts
git commit -m "feat(los): point hand-off at /api/loan-applications/intake; send IntakeDTO"
```

---

### Task 4: `leadId`-driven applications route (TDD)

**Files:**
- Modify: `src/validation/lead.ts` (add `leadId` to `applicationHandoffSchema`)
- Modify: `src/app/api/v1/applications/route.ts`
- Test: `src/app/api/v1/applications/route.test.ts` (create)

- [ ] **Step 1: Extend the schema** — in `src/validation/lead.ts`, add to `applicationHandoffSchema`:
```ts
  leadId: z.string().trim().min(1).optional(),
```

- [ ] **Step 2: Write the failing test** (mock the session, lead reader, officer source, and LOS client)

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/cognito", () => ({ authConfigured: () => true }));
vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(async () => ({ sub: "sub-1", email: "z@example.com" })),
  getIdToken: vi.fn(async () => "idtok"),
}));
const createLoanApplication = vi.fn(async () => ({ ok: true, applicationId: "42" }));
vi.mock("@/server/integrations/los/losClient", () => ({ createLoanApplication }));
const getLeadById = vi.fn();
vi.mock("@/server/leads/leadService", () => ({ getLeadById }));
vi.mock("@/content/officers", () => ({
  OFFICERS: [{ slug: "zachary-zink", email: "zachary.zink@msfg.us", nmls: "451924", name: "Zachary Zink" }],
}));

import { POST } from "./route";

function req(body: unknown) {
  return new Request("http://x/api/v1/applications", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

beforeEach(() => { createLoanApplication.mockClear(); getLeadById.mockReset(); });

describe("POST /api/v1/applications", () => {
  it("rebuilds the IntakeDTO from the lead and calls the client", async () => {
    getLeadById.mockResolvedValue({
      id: "row-1", firstName: "Zachary", lastName: "Zink", email: "z@example.com", phone: "3035551234",
      intent: "REFI", idempotencyKey: "lead-1",
      answers: { fields: { address: { line1: "12750 W 88th Ave", city: "Arvada", state: "CO", zip: "80005" },
        propertyUse: "Primary residence", propertyType: "Single Family", homeValue: 485000,
        mortgageBalance: 312000, income: 120000, loanOfficer: "zachary-zink" } },
    });
    const res = await POST(req({ leadId: "lead-1" }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.handoff).toBe("ok");
    expect(json.applicationId).toBe("42");
    const [idToken, dto] = createLoanApplication.mock.calls[0];
    expect(idToken).toBe("idtok");
    expect(dto.sourceLeadId).toBe("lead-1");
    expect(dto.loanPurpose).toBe("Refinance");
    expect(dto.property.addressLine).toBe("12750 W 88th Ave");
    expect(dto.loanOfficer.email).toBe("zachary.zink@msfg.us");
  });

  it("401s when not authenticated", async () => {
    const { getSession } = await import("@/lib/auth/session");
    (getSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const res = await POST(req({ leadId: "lead-1" }));
    expect(res.status).toBe(401);
  });

  it("400s when the lead is missing", async () => {
    getLeadById.mockResolvedValue(null);
    const res = await POST(req({ leadId: "nope" }));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/app/api/v1/applications/route.test.ts`
Expected: FAIL — the route doesn't read `leadId`/build the IntakeDTO yet.

- [ ] **Step 4: Rewrite the route** to be `leadId`-driven

```ts
import { NextResponse } from "next/server";
import { authConfigured } from "@/lib/auth/cognito";
import { getSession, getIdToken } from "@/lib/auth/session";
import { createLoanApplication } from "@/server/integrations/los/losClient";
import { getLeadById } from "@/server/leads/leadService";
import { funnelToIntake, type LeadForIntake, type IntakeOfficer } from "@/lib/applyIntake";
import { OFFICERS } from "@/content/officers";
import { applicationHandoffSchema } from "@/validation/lead";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Resolve a funnel officer slug → the intake officer block (email/nmls/name/slug). */
function resolveOfficer(slug: unknown): IntakeOfficer | null {
  if (typeof slug !== "string" || !slug) return null;
  const o = OFFICERS.find((x) => x.slug === slug);
  return o ? { email: o.email, nmls: o.nmls, name: o.name, slug: o.slug } : null;
}

export async function POST(req: Request) {
  if (!authConfigured()) {
    return NextResponse.json({ ok: false, error: "Authentication is not configured." }, { status: 503 });
  }
  const user = await getSession();
  if (!user) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });

  let json: unknown;
  try { json = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 }); }

  const parsed = applicationHandoffSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  }
  const { leadId } = parsed.data;
  if (!leadId) {
    return NextResponse.json({ ok: false, error: "leadId required" }, { status: 400 });
  }

  const lead = await getLeadById(leadId);
  if (!lead) return NextResponse.json({ ok: false, error: "Lead not found" }, { status: 400 });

  const idToken = await getIdToken();
  if (!idToken) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });

  const officer = resolveOfficer((lead.answers as { fields?: Record<string, unknown> })?.fields?.loanOfficer);
  const dto = funnelToIntake(lead as unknown as LeadForIntake, officer);

  const result = await createLoanApplication(idToken, dto);
  const handoff = result.skipped ? "skipped" : result.ok ? "ok" : "failed";
  return NextResponse.json(
    { ok: true, handoff, applicationId: result.applicationId ?? null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/app/api/v1/applications/route.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/validation/lead.ts src/app/api/v1/applications/route.ts src/app/api/v1/applications/route.test.ts
git commit -m "feat(api): applications hand-off rebuilds IntakeDTO from leadId + resolves officer"
```

---

### Task 5: `FinishStep` — post leadId, carry across login, deep-link

**Files:**
- Modify: `src/components/apply/steps/FinishStep.tsx`

- [ ] **Step 1: Post `{ leadId }` and capture `applicationId`** — in the hand-off `useEffect`, change the body and store the result:

```tsx
const [appId, setAppId] = useState<string | null>(null);
// ...inside the effect, replace the fetch body:
body: JSON.stringify({ leadId: leadId ?? undefined }),
// ...and read the result instead of swallowing it:
}).then((r) => r.ok ? r.json() : null)
  .then((d) => { if (d?.applicationId) setAppId(String(d.applicationId)); })
  .catch(() => {}).finally(() => setHandoff("done"));
```

- [ ] **Step 2: Carry `leadId` across the Cognito login redirect** — update `continueHref` so signed-out users return to the funnel with the lead preserved:

```tsx
const continueHref =
  auth.configured && !auth.authenticated
    ? `/auth/login?returnTo=${encodeURIComponent(`/apply/${intent}${leadId ? `?lead=${leadId}` : ""}`)}`
    : appId ? `${APP_URL}/applications/${appId}` : APP_URL;
```

- [ ] **Step 3: Deep-link the primary CTA when the app was created** — `continueHref` above already points at `${APP_URL}/applications/${appId}` once `appId` is set. Confirm the Wizard passes the funnel-loaded `leadId` (it does, via the `leadId` prop) and that on a returned-from-login mount the `?lead=` query is read back into the Wizard's `leadId` (Wizard reads `?lead` from the URL on mount — add that read in `Wizard.tsx` if absent: `const initialLead = new URLSearchParams(location.search).get("lead")`).

> **Confirm-point:** the app's real "continue an application" route — `/applications/{id}` is the assumption (spec open item #1). If the app uses `/apply?appId={id}`, change the deep-link here only.

- [ ] **Step 4: Verify typecheck + the full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 0 type errors; all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/apply/steps/FinishStep.tsx src/components/apply/Wizard.tsx
git commit -m "feat(apply): finish step posts leadId, carries it across login, deep-links to the created app"
```

---

### Task 6: Document the env var

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Ensure `LOS_API_BASE` documents the intake target** — find the LOS section and confirm/append:

```
# Base URL of the mortgage-app API (app.msfgco.com). Enables the apply-funnel
# hand-off: POST {LOS_API_BASE}/api/loan-applications/intake with the user's
# Cognito id_token. Unset → hand-off skipped (lead still captured; SSO CTA still
# shown). SERVER-ONLY.
LOS_API_BASE=""
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs(env): LOS_API_BASE documents the funnel→app intake target"
```

---

### Task 7: Full suite green

- [ ] **Step 1: Run typecheck + lint + tests**

Run: `npx tsc --noEmit && npx eslint src/lib/applyIntake.ts src/app/api/v1/applications/route.ts src/server/integrations/los/losClient.ts src/components/apply/steps/FinishStep.tsx && npx vitest run`
Expected: 0 type errors, lint clean, all tests pass.

- [ ] **Step 2: Commit any fixes**

```bash
git add -A && git commit -m "test: msfg.us suite green with funnel→app hand-off"
```

---

## Self-review notes (done)

- **Spec coverage:** leadId-driven rebuild ✓ (T4), funnelToIntake mapping ✓ (T1), officer resolution by slug ✓ (T4), LOS re-point ✓ (T3), FinishStep post+carry+deep-link ✓ (T5), getLeadById ✓ (T2), env doc ✓ (T6). `sourceLeadId = lead.idempotencyKey` matches Part A's dedupe key.
- **Type consistency:** `IntakeDTO` (T1) is the single source; `losClient` (T3) and the route (T4) import it. `LeadForIntake`/`IntakeOfficer` exported from `applyIntake.ts` and reused in the route.
- **Integration:** end-to-end requires Part A live + `LOS_API_BASE` set on staging. Until then the route returns `handoff:"skipped"` and the CTA still SSOs the user in (no dead end) — matching today's graceful behavior.
- **Confirm-point:** the app's continue-application route for the deep link (spec open item #1).
