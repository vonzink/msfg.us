import { isCurrencyAmount } from "@/lib/applyFields";
import type { AnswerValue, StructuredAddress } from "@/lib/leads";

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
  /** Purchase loan amount = price − down payment (buy flow). Null when not derivable
   *  (e.g. refi, where the LO sets terms later). Feeds the LOS pipeline's loan_amount. */
  loanAmount: number | null;
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

/**
 * Resolve a down payment to a dollar amount. The funnel stores it as a formatted
 * string ("20%" / "$90,000") via buildLeadFields, but tolerate a raw
 * CurrencyAmount or number too. Percent down payments need the price as a basis.
 */
function downPaymentAmount(raw: unknown, basis: number | null): number | null {
  const ca = raw as AnswerValue | undefined;
  if (isCurrencyAmount(ca)) {
    if (ca.value == null) return null;
    return ca.unit === "%" ? (basis != null ? Math.round((basis * ca.value) / 100) : null) : ca.value;
  }
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw.replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(n)) return null;
    return raw.includes("%") ? (basis != null ? Math.round((basis * n) / 100) : null) : n;
  }
  return null;
}

const blankToNull = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v : null;

/** Pure: persisted lead (+ resolved officer) → IntakeDTO for the app hand-off. */
export function funnelToIntake(lead: LeadForIntake, officer: IntakeOfficer | null): IntakeDTO {
  const f = lead.answers?.fields ?? {};
  const addr = (f.address ?? {}) as Partial<StructuredAddress>;
  const map = INTENT[lead.intent];
  // Refi stores the value under `homeValue`; buy under `purchasePrice`.
  const propertyValue = numOrNull(f.homeValue) ?? numOrNull(f.purchasePrice);
  const downPayment = downPaymentAmount(f.downPayment, propertyValue);
  const loanAmount = propertyValue != null && downPayment != null ? Math.max(0, propertyValue - downPayment) : null;
  return {
    sourceLeadId: lead.idempotencyKey,
    source: "apply-wizard",
    intent: map.intent,
    loanPurpose: map.loanPurpose,
    borrower: { firstName: lead.firstName, lastName: lead.lastName, email: lead.email, phone: lead.phone },
    property: {
      addressLine: blankToNull(addr.line1), city: blankToNull(addr.city), state: blankToNull(addr.state), zipCode: blankToNull(addr.zip),
      propertyType: occupancy(f.propertyUse), constructionType: construction(f.propertyType),
      propertyValue,
    },
    loanAmount,
    financials: {
      currentMortgageBalance: numOrNull(f.mortgageBalance),
      annualIncome: numOrNull(f.income),
      creditBand: typeof f.creditBand === "string" ? f.creditBand : null,
    },
    loanOfficer: officer,
  };
}
