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
  property: { addressLine: string | null; city: string | null; state: string | null; zipCode: string | null;
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

const blankToNull = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v : null;

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
      addressLine: blankToNull(addr.line1), city: blankToNull(addr.city), state: blankToNull(addr.state), zipCode: blankToNull(addr.zip),
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
