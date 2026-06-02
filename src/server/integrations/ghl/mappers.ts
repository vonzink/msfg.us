/**
 * Pure mappers: a persisted Lead row → GHL CRM inputs. No I/O, no env reads —
 * trivially unit-testable. Keeping the shape translation here means the
 * client (ghlClient.ts) and service (leadService.ts) stay free of field-name
 * coupling.
 */
import type { Lead } from "@prisma/client";
import type {
  UpsertContactInput,
  CreateOpportunityInput,
} from "@/server/integrations/types";

/** Map a Lead → GHL contact upsert input. */
export function leadToContactInput(lead: Lead): UpsertContactInput {
  return {
    firstName: lead.firstName,
    lastName: lead.lastName,
    email: lead.email,
    phone: lead.phone,
    source: lead.source,
    tags: ["MSFG Web", `intent:${lead.intent}`],
    customFields: {
      ...(lead.location ? { location: lead.location } : {}),
    },
  };
}

/** Build the opportunity display name: "{firstName} {lastName} — {INTENT}". */
export function leadToOpportunityName(lead: Lead): string {
  const name = `${lead.firstName} ${lead.lastName}`.trim();
  return `${name} — ${lead.intent}`;
}

/** Map a Lead (+ resolved contactId) → GHL opportunity create input. */
export function leadToOpportunityInput(
  lead: Lead,
  contactId: string,
): CreateOpportunityInput {
  return {
    contactId,
    name: leadToOpportunityName(lead),
  };
}
