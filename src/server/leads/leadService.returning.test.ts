import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getTenantDb: async () => ({
    lead: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(async ({ data }: any) => ({ id: "L1", ...data, syncStatus: "PENDING" })),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  }),
}));

describe("captureLead returning marker", () => {
  it("stamps a returning marker with no signals", async () => {
    const { captureLead } = await import("./leadService");
    const crm = { upsertContact: async () => ({ skipped: true }), createOpportunity: async () => ({}) } as any;
    const res = await captureLead(
      {
        intent: "refi",
        contact: { firstName: "Z", lastName: "Z", email: "z@x.com", phone: "3035550000" },
        answers: {},
        consentTcpa: true,
        idempotencyKey: "0123456789abcdef",
        source: "apply-wizard",
      } as any,
      crm,
    );
    expect(res.leadId).toBe("L1");
  });
});
