import { describe, it, expect, vi, afterEach } from "vitest";

const { upsertContact } = vi.hoisted(() => ({ upsertContact: vi.fn() }));
vi.mock("@/server/integrations/ghl/ghlClient", () => ({
  ghlClient: { upsertContact },
}));
vi.mock("@/content/officers", () => ({
  OFFICERS: [{ slug: "robert-hoff", name: "Robert Hoff, CFA" }],
}));

import { syncContactRequestTag } from "./leadService";

const lead = {
  id: "row-1",
  firstName: "Z",
  lastName: "Z",
  email: "z@x.com",
  phone: "3035551234",
  source: "apply-wizard",
  intent: "REFI",
  location: null,
  answers: { fields: { loanOfficer: "robert-hoff" } },
} as unknown as Parameters<typeof syncContactRequestTag>[0];

afterEach(() => upsertContact.mockReset());

describe("syncContactRequestTag", () => {
  it("upserts the contact with Requested:<channel> + officer:<slug> tags", async () => {
    upsertContact.mockResolvedValue({ id: "ghl-1" });
    await syncContactRequestTag(lead, "call");
    expect(upsertContact).toHaveBeenCalledTimes(1);
    const input = upsertContact.mock.calls[0][0];
    expect(input.tags).toContain("Requested:call");
    expect(input.tags).toContain("officer:robert-hoff");
  });

  it("swallows a thrown error (never rejects)", async () => {
    upsertContact.mockImplementation(() => { throw new Error("GHL 500"); });
    await expect(syncContactRequestTag(lead, "text")).resolves.toBeUndefined();
  });

  it("omits officer:<slug> when no officer slug is on the lead", async () => {
    upsertContact.mockResolvedValue({ id: "ghl-1" });
    const noOfficer = { ...lead, answers: { fields: {} } } as typeof lead;
    await syncContactRequestTag(noOfficer, "email");
    const input = upsertContact.mock.calls[0][0];
    expect(input.tags).toContain("Requested:email");
    expect(input.tags.some((t: string) => t.startsWith("officer:"))).toBe(false);
  });
});
