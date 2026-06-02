/**
 * Provider-agnostic CRM contract. The lead service depends only on this
 * interface, never on GHL specifics — swap in a different CRM by implementing
 * `CrmClient`. A `skipped: true` result means the integration is not
 * configured (no credentials) and no network call was made.
 */

/** Input for creating/updating a CRM contact. */
export interface UpsertContactInput {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  source: string;
  tags?: string[];
  /** Provider-specific custom fields, passed through as-is. */
  customFields?: Record<string, unknown>;
}

/** Input for creating a CRM opportunity/deal tied to a contact. */
export interface CreateOpportunityInput {
  /** CRM contact id returned by `upsertContact`. */
  contactId: string;
  /** Human-readable opportunity name, e.g. "Jane Doe — BUY". */
  name: string;
  /** Monetary value if known (reserved; not all providers use it). */
  monetaryValue?: number;
}

/** Result of a CRM write. `id` is null when skipped or unavailable. */
export interface CrmResult {
  id: string | null;
  /** True when the integration was not configured and no call was made. */
  skipped?: boolean;
}

export interface CrmClient {
  /** Stable identifier for logging/telemetry (e.g. "ghl"). */
  readonly name: string;
  upsertContact(input: UpsertContactInput): Promise<CrmResult>;
  createOpportunity(input: CreateOpportunityInput): Promise<CrmResult>;
}
