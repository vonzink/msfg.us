/** Minimal tenant context attached to a request. */
export type TenantContext = {
  id: string;
  slug: string;
  name: string;
};

/**
 * Prisma model names that carry tenantId and MUST be auto-scoped. ApiKey is
 * intentionally EXCLUDED: the public-API auth lookup hashes the inbound key and
 * finds the row globally (the key is what establishes the tenant), so scoping it
 * would make auth impossible. Tenant itself is also excluded.
 */
export const TENANT_SCOPED_MODELS = [
  "Lead",
  "LoanOfficer",
  "LoanProgram",
  "RateRow",
  "Testimonial",
  "Application",
  "ApplicationStep",
  "ChatSession",
  "ChatMessage",
  "WebhookEvent",
] as const;

export type TenantScopedModel = (typeof TENANT_SCOPED_MODELS)[number];

export function isTenantScopedModel(model: string | undefined): model is TenantScopedModel {
  return !!model && (TENANT_SCOPED_MODELS as readonly string[]).includes(model);
}
