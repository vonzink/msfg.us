import { describe, it, expect, vi, beforeEach } from "vitest";

// Tenant DB is mocked; we assert on what gets written via updateMany.
const updateMany = vi.fn();
const findFirst = vi.fn();
vi.mock("@/lib/db", () => ({
  getTenantDb: vi.fn(async () => ({
    lead: { updateMany, findFirst },
  })),
}));
vi.mock("@/content/officers", () => ({
  OFFICERS: [{ slug: "robert-hoff", name: "Robert Hoff, CFA" }],
}));

import { recordContactRequest } from "./leadService";

function leadRow(answers: unknown) {
  return { id: "row-1", firstName: "Z", lastName: "Z", email: "z@x.com", phone: "", answers };
}

beforeEach(() => {
  updateMany.mockReset().mockResolvedValue({ count: 1 });
  findFirst.mockReset();
});

describe("recordContactRequest", () => {
  it("returns not_found when the lead does not exist", async () => {
    findFirst.mockResolvedValueOnce(null);
    const r = await recordContactRequest("missing", { channel: "email" });
    expect(r).toEqual({ ok: false, reason: "not_found" });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("records a new channel without clobbering loanOfficer/address", async () => {
    findFirst.mockResolvedValueOnce(
      leadRow({ fields: { loanOfficer: "robert-hoff", address: { state: "CO" } }, returning: false }),
    );
    const r = await recordContactRequest("row-1", { channel: "email" });
    expect(r).toEqual({ ok: true, channelWasNew: true, officer: { name: "Robert Hoff, CFA", slug: "robert-hoff" } });
    const written = updateMany.mock.calls[0][0].data.answers as Record<string, unknown>;
    const fields = written.fields as Record<string, unknown>;
    expect(fields.loanOfficer).toBe("robert-hoff");
    expect(fields.address).toEqual({ state: "CO" });
    expect(written.returning).toBe(false); // top-level answers keys survive too
    const pref = fields.contactPreference as Record<string, unknown>;
    expect(pref.channels).toEqual(["email"]);
    expect(pref.latest).toBe("email");
    expect(typeof pref.requestedAt).toBe("string");
  });

  it("is idempotent on the same channel (channelWasNew=false) but refreshes latest/requestedAt", async () => {
    findFirst.mockResolvedValueOnce(
      leadRow({ fields: { contactPreference: { channels: ["text"], latest: "text", requestedAt: "OLD" } } }),
    );
    const r = await recordContactRequest("row-1", { channel: "text" });
    expect(r).toEqual({ ok: true, channelWasNew: false, officer: null });
    const pref = (updateMany.mock.calls[0][0].data.answers as { fields: { contactPreference: Record<string, unknown> } })
      .fields.contactPreference;
    expect(pref.channels).toEqual(["text"]); // not duplicated
    expect(pref.requestedAt).not.toBe("OLD"); // refreshed
  });

  it("appends a switched channel (records BOTH channels)", async () => {
    findFirst.mockResolvedValueOnce(
      leadRow({ fields: { contactPreference: { channels: ["text"], latest: "text", requestedAt: "OLD" } } }),
    );
    const r = await recordContactRequest("row-1", { channel: "call" });
    expect(r).toMatchObject({ ok: true, channelWasNew: true });
    const pref = (updateMany.mock.calls[0][0].data.answers as { fields: { contactPreference: Record<string, unknown> } })
      .fields.contactPreference;
    expect(pref.channels).toEqual(["text", "call"]);
    expect(pref.latest).toBe("call");
  });

  it("stores recaptured phone + consent fields when provided", async () => {
    findFirst.mockResolvedValueOnce(leadRow({ fields: {} }));
    await recordContactRequest("row-1", { channel: "call", phone: "3035551234", consentTcpa: true });
    const pref = (updateMany.mock.calls[0][0].data.answers as { fields: { contactPreference: Record<string, unknown> } })
      .fields.contactPreference;
    expect(pref.phone).toBe("3035551234");
    expect(pref.consentTcpa).toBe(true);
    expect(typeof pref.consentRequestedAt).toBe("string");
  });

  it("refuses a call/text recapture phone without consent (consent_required, nothing written)", async () => {
    findFirst.mockResolvedValueOnce(leadRow({ fields: {} }));
    const r = await recordContactRequest("row-1", { channel: "call", phone: "3035551234" });
    expect(r).toEqual({ ok: false, reason: "consent_required" });
    expect(updateMany).not.toHaveBeenCalled();
  });
});
