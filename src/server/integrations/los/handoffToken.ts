import { SignJWT } from "jose";

export type HandoffPayload = {
  sourceLeadId: string;
  loanPurpose: "Purchase" | "Refinance" | "CashOut";
  borrower: { firstName: string; lastName: string; email: string; phone: string };
  property: { addressLine: string | null; city: string | null; state: string | null; zipCode: string | null;
              propertyUse: string | null; propertyType: string | null; propertyValue: number | null };
  display: { purchasePrice: number | null; downPaymentPercent: string | null };
  loanOfficer: { name: string; slug: string } | null;
};

type LeadLike = {
  firstName: string; lastName: string; email: string; phone: string;
  intent: "BUY" | "REFI" | "CASH"; idempotencyKey: string;
  answers: { fields?: Record<string, unknown> } & Record<string, unknown>;
};

const PURPOSE: Record<LeadLike["intent"], HandoffPayload["loanPurpose"]> = {
  BUY: "Purchase", REFI: "Refinance", CASH: "CashOut",
};
const blank = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Build the NON-SENSITIVE hand-off payload from a persisted lead. Omits income/credit/SSN. */
export function buildHandoffPayload(
  lead: LeadLike, officer: { name: string; slug: string } | null,
): HandoffPayload {
  const f = lead.answers?.fields ?? {};
  const addr = (f.address ?? {}) as Record<string, unknown>;
  return {
    sourceLeadId: lead.idempotencyKey,
    loanPurpose: PURPOSE[lead.intent],
    borrower: { firstName: lead.firstName, lastName: lead.lastName, email: lead.email, phone: lead.phone },
    property: {
      addressLine: blank(addr.line1), city: blank(addr.city), state: blank(addr.state), zipCode: blank(addr.zip),
      propertyUse: blank(f.propertyUse), propertyType: blank(f.propertyType), propertyValue: num(f.homeValue),
    },
    display: { purchasePrice: num(f.purchasePrice), downPaymentPercent: blank(f.downPayment) },
    loanOfficer: officer,
  };
}

/** Mint a short-TTL HS256 JWT carrying the payload under claim `h`. */
export async function mintHandoffToken(payload: HandoffPayload, secret: string): Promise<string> {
  return new SignJWT({ h: payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer("msfg.us")
    .setAudience("mortgage-app")
    .setExpirationTime("10m")
    .sign(new TextEncoder().encode(secret));
}
