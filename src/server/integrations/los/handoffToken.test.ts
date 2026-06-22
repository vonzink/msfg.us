import { describe, it, expect } from "vitest";
import { buildHandoffPayload, mintHandoffToken } from "./handoffToken";
import { jwtVerify } from "jose";

const LEAD = {
  firstName: "Ann", lastName: "Buyer", email: "ann@example.com", phone: "555-0100",
  intent: "BUY" as const, idempotencyKey: "lead-xyz", location: null,
  answers: { fields: { purchasePrice: 425000, downPayment: "20%", propertyUse: "Primary residence",
    propertyType: "Single Family", address: { line1: "1 Main St", city: "Denver", state: "CO", zip: "80202" } } },
};

describe("handoffToken", () => {
  it("builds a non-sensitive payload (no income/credit)", () => {
    const p = buildHandoffPayload(LEAD as any, { name: "Zachary Zink", slug: "zachary-zink" });
    expect(p.sourceLeadId).toBe("lead-xyz");
    expect(p.loanPurpose).toBe("Purchase");
    expect(p.borrower.email).toBe("ann@example.com");
    expect(p.property.city).toBe("Denver");
    expect(p.display.purchasePrice).toBe(425000);
    expect(p.display.downPaymentPercent).toBe("20%");
    expect(JSON.stringify(p)).not.toMatch(/income|creditBand|ssn/i);
  });

  it("mints a verifiable HS256 JWT round-trip", async () => {
    const p = buildHandoffPayload(LEAD as any, null);
    const token = await mintHandoffToken(p, "test-secret-0123456789");
    const { payload } = await jwtVerify(token, new TextEncoder().encode("test-secret-0123456789"),
      { algorithms: ["HS256"] });
    expect((payload as any).h.sourceLeadId).toBe("lead-xyz");
  });
});
