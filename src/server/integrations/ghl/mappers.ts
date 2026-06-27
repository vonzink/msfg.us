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

/** Optional off-ramp context: appends contact-request tags. */
export type ContactRequestTagOpts = {
  requestedChannel?: "call" | "text" | "email";
  officerSlug?: string;
};

/** Map a Lead → GHL contact upsert input. When off-ramp context is supplied,
 *  appends an accumulating "Requested:<channel>" tag (and optional
 *  "officer:<slug>") on top of the base tags. */
export function leadToContactInput(
  lead: Lead,
  opts: ContactRequestTagOpts = {},
): UpsertContactInput {
  const tags = ["MSFG Web", `intent:${lead.intent}`];
  if (opts.requestedChannel) tags.push(`Requested:${opts.requestedChannel}`);
  if (opts.officerSlug) tags.push(`officer:${opts.officerSlug}`);
  return {
    firstName: lead.firstName,
    lastName: lead.lastName,
    email: lead.email,
    phone: lead.phone,
    source: lead.source,
    tags,
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

// ---------------------------------------------------------------------------
// Inbound: GHL webhook payload → fields we use to find + update a Lead.
// ---------------------------------------------------------------------------

/**
 * The bits of an inbound GHL webhook we care about. GHL events come in many
 * shapes (top-level fields, or nested under `data` / `contact` / `opportunity`)
 * and key casing varies by event, so this is intentionally permissive — every
 * field is best-effort and may be undefined.
 */
export interface GhlInboundEvent {
  /** Event type, e.g. "ContactUpdate", "OpportunityStatusUpdate". */
  type: string | null;
  contactId?: string;
  opportunityId?: string;
  email?: string;
  /** Opportunity pipeline status ("open"/"won"/"lost"/…) or contact status. */
  status?: string;
  /** Pipeline stage id, when present. */
  pipelineStageId?: string;
}

/** Narrow unknown → plain object (not array, not null). */
function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/** Read the first defined non-empty string among `keys` from `obj`. */
function pickString(
  obj: Record<string, unknown> | null,
  keys: string[],
): string | undefined {
  if (!obj) return undefined;
  for (const k of keys) {
    const val = obj[k];
    if (typeof val === "string" && val.trim() !== "") return val;
  }
  return undefined;
}

/**
 * Parse a raw GHL webhook payload into a normalized {@link GhlInboundEvent}.
 * Looks at the top level and the common nested containers GHL uses
 * (`data`, `contact`, `opportunity`) so a single parser handles contact and
 * opportunity/pipeline events alike.
 */
export function parseGhlWebhook(
  eventType: string | null,
  payload: unknown,
): GhlInboundEvent {
  const root = asRecord(payload) ?? {};
  const data = asRecord(root.data);
  const contact = asRecord(root.contact) ?? asRecord(data?.contact);
  const opportunity =
    asRecord(root.opportunity) ?? asRecord(data?.opportunity);

  const type =
    eventType ?? pickString(root, ["type", "eventType"]) ?? null;
  // GHL flat payloads carry the subject's id in a bare `id` at the level the
  // event is about (contact events → contact id; opportunity events →
  // opportunity id). Route a bare `id` by event type so we don't mis-key it.
  const isOpportunityEvent = (type ?? "").toLowerCase().includes("opportunity");

  // Search order: dedicated container → data → root (with type-routed `id`).
  // Opportunity events frequently nest the contactId inside the opportunity.
  const contactId =
    pickString(contact, ["id", "contactId"]) ??
    pickString(opportunity, ["contactId"]) ??
    pickString(data, ["contactId"]) ??
    pickString(root, ["contactId"]) ??
    (!isOpportunityEvent && !contact && !opportunity
      ? pickString(root, ["id"])
      : undefined);

  const opportunityId =
    pickString(opportunity, ["id", "opportunityId"]) ??
    pickString(data, ["opportunityId", "opportunity_id"]) ??
    pickString(root, ["opportunityId", "opportunity_id"]) ??
    (isOpportunityEvent && !opportunity
      ? pickString(root, ["id"])
      : undefined);

  const email =
    pickString(contact, ["email"]) ??
    pickString(data, ["email"]) ??
    pickString(root, ["email"]);

  const status =
    pickString(opportunity, ["status", "pipelineStatus"]) ??
    pickString(data, ["status", "pipelineStatus"]) ??
    pickString(root, ["status", "pipelineStatus"]);

  const pipelineStageId =
    pickString(opportunity, ["pipelineStageId", "stageId"]) ??
    pickString(data, ["pipelineStageId", "stageId"]) ??
    pickString(root, ["pipelineStageId", "stageId"]);

  return { type, contactId, opportunityId, email, status, pipelineStageId };
}
