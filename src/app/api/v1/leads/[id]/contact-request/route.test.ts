import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/server/leads/leadService", () => ({
  recordContactRequest: vi.fn(),
  syncContactRequestTag: vi.fn(),
  getLeadById: vi.fn(),
}));

import { POST } from "./route";
import * as leadService from "@/server/leads/leadService";

const recordContactRequest = vi.mocked(leadService.recordContactRequest);
const syncContactRequestTag = vi.mocked(leadService.syncContactRequestTag);
const getLeadById = vi.mocked(leadService.getLeadById);

function req(body: unknown) {
  return new Request("http://x/api/v1/leads/row-1/contact-request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
const ctx = { params: Promise.resolve({ id: "row-1" }) };

beforeEach(() => {
  recordContactRequest.mockReset();
  syncContactRequestTag.mockReset();
  getLeadById.mockReset();
});

describe("POST /api/v1/leads/[id]/contact-request", () => {
  it("400 on invalid JSON body", async () => {
    const bad = new Request("http://x/api/v1/leads/row-1/contact-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const res = await POST(bad, ctx);
    expect(res.status).toBe(400);
    expect(recordContactRequest).not.toHaveBeenCalled();
  });

  it("400 when channel is missing/invalid", async () => {
    const res = await POST(req({ channel: "fax" }), ctx);
    expect(res.status).toBe(400);
    expect(recordContactRequest).not.toHaveBeenCalled();
  });

  it("422 on a call recapture phone without consent — nothing written, no tag", async () => {
    const res = await POST(req({ channel: "call", phone: "3035551234" }), ctx);
    expect(res.status).toBe(422);
    expect(recordContactRequest).not.toHaveBeenCalled();
    expect(syncContactRequestTag).not.toHaveBeenCalled();
  });

  it("404 when the lead is missing/cross-tenant", async () => {
    recordContactRequest.mockResolvedValue({ ok: false, reason: "not_found" });
    const res = await POST(req({ channel: "email" }), ctx);
    expect(res.status).toBe(404);
    expect(syncContactRequestTag).not.toHaveBeenCalled();
  });

  it("200 happy path: records then fires the GHL tag when channel is new", async () => {
    recordContactRequest.mockResolvedValue({
      ok: true,
      channelWasNew: true,
      officer: { name: "Robert Hoff, CFA", slug: "robert-hoff" },
    });
    getLeadById.mockResolvedValue({ id: "row-1" } as never);
    const res = await POST(req({ channel: "email" }), ctx);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(syncContactRequestTag).toHaveBeenCalledTimes(1);
  });

  it("200 idempotent: does NOT fire a duplicate tag when channel already recorded", async () => {
    recordContactRequest.mockResolvedValue({ ok: true, channelWasNew: false, officer: null });
    const res = await POST(req({ channel: "text" }), ctx);
    expect(res.status).toBe(200);
    expect(syncContactRequestTag).not.toHaveBeenCalled();
  });

  it("200 even when the GHL tag sync throws (swallowed)", async () => {
    recordContactRequest.mockResolvedValue({ ok: true, channelWasNew: true, officer: null });
    getLeadById.mockResolvedValue({ id: "row-1" } as never);
    syncContactRequestTag.mockRejectedValue(new Error("GHL down"));
    const res = await POST(req({ channel: "call" }), ctx);
    expect(res.status).toBe(200);
  });

  it("does not log the borrower phone (no PII in logs)", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    recordContactRequest.mockResolvedValue({ ok: true, channelWasNew: true, officer: null });
    getLeadById.mockResolvedValue({ id: "row-1" } as never);
    await POST(req({ channel: "text", phone: "3035559999", consentTcpa: true }), ctx);
    const logged = errSpy.mock.calls.flat().join(" ");
    expect(logged).not.toContain("3035559999");
    errSpy.mockRestore();
  });
});
