import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/server/leads/leadService", () => ({
  getLeadById: vi.fn(),
}));
vi.mock("@/content/officers", () => ({
  OFFICERS: [{ slug: "zachary-zink", email: "zachary.zink@msfg.us", nmls: "451924", name: "Zachary Zink" }],
}));
vi.mock("@/lib/env", () => ({
  serverEnv: { HANDOFF_TOKEN_SECRET: "test-secret-at-least-32-bytes-long!" },
}));

import { POST } from "./route";
import * as leadService from "@/server/leads/leadService";

const getLeadById = vi.mocked(leadService.getLeadById);

function req(body: unknown) {
  return new Request("http://x/api/v1/applications", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

const fakeLead = {
  id: "row-1", firstName: "Zachary", lastName: "Zink", email: "z@example.com", phone: "3035551234",
  intent: "REFI" as const, idempotencyKey: "lead-key-1",
  answers: { fields: { loanOfficer: "zachary-zink", homeValue: 485000 } },
} as unknown as Awaited<ReturnType<typeof getLeadById>>;

beforeEach(() => { getLeadById.mockReset(); });

describe("POST /api/v1/applications (hand-off token)", () => {
  it("returns { ok: true, handoffToken: <string> } for a valid leadId", async () => {
    getLeadById.mockResolvedValue(fakeLead);
    const res = await POST(req({ leadId: "lead-key-1" }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(typeof json.handoffToken).toBe("string");
    expect(json.handoffToken.split(".")).toHaveLength(3); // JWT = header.payload.sig
  });

  it("404s when the lead is not found", async () => {
    getLeadById.mockResolvedValue(null);
    const res = await POST(req({ leadId: "nope" }));
    expect(res.status).toBe(404);
  });

  it("400s when leadId is missing", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });

  it("400s on invalid JSON body", async () => {
    const badReq = new Request("http://x/api/v1/applications", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "not-json",
    });
    const res = await POST(badReq);
    expect(res.status).toBe(400);
  });

  it("sets Cache-Control: no-store", async () => {
    getLeadById.mockResolvedValue(fakeLead);
    const res = await POST(req({ leadId: "lead-key-1" }));
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
