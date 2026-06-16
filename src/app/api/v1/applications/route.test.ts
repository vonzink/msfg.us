import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/cognito", () => ({ authConfigured: () => true }));
vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(async () => ({ sub: "sub-1", email: "z@example.com" })),
  getIdToken: vi.fn(async () => "idtok"),
}));
vi.mock("@/server/integrations/los/losClient", () => ({
  createLoanApplication: vi.fn(async () => ({ ok: true, applicationId: "42" })),
}));
vi.mock("@/server/leads/leadService", () => ({
  getLeadById: vi.fn(),
}));
vi.mock("@/content/officers", () => ({
  OFFICERS: [{ slug: "zachary-zink", email: "zachary.zink@msfg.us", nmls: "451924", name: "Zachary Zink" }],
}));

import { POST } from "./route";
import * as losClient from "@/server/integrations/los/losClient";
import * as leadService from "@/server/leads/leadService";

const createLoanApplication = vi.mocked(losClient.createLoanApplication);
const getLeadById = vi.mocked(leadService.getLeadById);

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
    } as unknown as Awaited<ReturnType<typeof getLeadById>>);
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
    expect(dto.loanOfficer!.email).toBe("zachary.zink@msfg.us");
  });

  it("401s when not authenticated", async () => {
    const { getSession } = await import("@/lib/auth/session");
    vi.mocked(getSession).mockResolvedValueOnce(null as unknown as Awaited<ReturnType<typeof getSession>>);
    const res = await POST(req({ leadId: "lead-1" }));
    expect(res.status).toBe(401);
  });

  it("400s when the lead is missing", async () => {
    getLeadById.mockResolvedValue(null);
    const res = await POST(req({ leadId: "nope" }));
    expect(res.status).toBe(400);
  });
});
