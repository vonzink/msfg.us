/**
 * Zod schemas for the public lead + application contracts.
 *
 * These MUST stay in lockstep with the apply wizard's request body
 * (src/lib/leads.ts → POST /api/v1/leads). Zod v4 API: top-level `z.email()`
 * / `z.uuid()` string formats. Inputs are trimmed and length-checked; the
 * wizard always sends consentTcpa:true and a uuid idempotencyKey.
 */
import { z } from "zod";

/** Apply-flow intent as sent by the client (lowercase). */
export const intentSchema = z.enum(["buy", "refi", "cash"]);
export type LeadIntent = z.infer<typeof intentSchema>;

/** Contact block captured by the wizard's `form` step. */
export const contactSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().min(1, "Last name is required"),
  email: z.email("A valid email is required").trim().toLowerCase(),
  phone: z.string().trim().min(7, "A valid phone is required"),
});
export type LeadContactInput = z.infer<typeof contactSchema>;

/**
 * Idempotency key: a uuid (what the wizard sends) OR any sufficiently long
 * opaque string, so non-browser callers aren't forced to use uuids.
 */
const idempotencyKeySchema = z.union([
  z.uuid(),
  z.string().trim().min(16),
]);

/** Full lead payload accepted by POST /api/v1/leads. */
export const leadInputSchema = z.object({
  intent: intentSchema,
  contact: contactSchema,
  // Free-form wizard answers (keyed by step index or name). Default {} so a
  // minimal payload still validates.
  answers: z.record(z.string(), z.unknown()).default({}),
  location: z.string().trim().min(1).optional(),
  consentTcpa: z.boolean(),
  idempotencyKey: idempotencyKeySchema,
  source: z.string().trim().min(1).default("web"),
});
export type LeadInput = z.infer<typeof leadInputSchema>;

// ---------------------------------------------------------------------------
// Application (multi-step) contract — used by Phase 3 LOS hand-off.
// ---------------------------------------------------------------------------

/** A single answered step within an application. */
export const applicationStepSchema = z.object({
  stepKey: z.string().trim().min(1),
  stepType: z.string().trim().min(1),
  value: z.unknown(),
  orderIndex: z.number().int().nonnegative(),
});
export type ApplicationStepInput = z.infer<typeof applicationStepSchema>;

/** Full application payload. */
export const applicationInputSchema = z.object({
  intent: intentSchema,
  status: z.string().trim().min(1).default("started"),
  contact: contactSchema,
  steps: z.array(applicationStepSchema).default([]),
  idempotencyKey: idempotencyKeySchema,
});
export type ApplicationInput = z.infer<typeof applicationInputSchema>;

// ---------------------------------------------------------------------------
// LOS hand-off contract — POST /api/v1/applications (auth-gated). Mirrors the
// wizard answers/contact already captured for the lead; the server attaches
// the Cognito sub + id_token (never sent by the client). All fields optional
// except intent + contact so a minimal completion still forwards.
// ---------------------------------------------------------------------------
export const applicationHandoffSchema = z.object({
  intent: intentSchema,
  contact: contactSchema,
  answers: z.record(z.string(), z.unknown()).default({}),
  location: z.string().trim().min(1).optional(),
  /** Local Lead id returned by POST /api/v1/leads, for cross-referencing. */
  leadId: z.string().trim().min(1).optional(),
  idempotencyKey: idempotencyKeySchema.optional(),
  source: z.string().trim().min(1).optional(),
});
export type ApplicationHandoffInput = z.infer<typeof applicationHandoffSchema>;
