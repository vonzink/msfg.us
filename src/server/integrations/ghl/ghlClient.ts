/**
 * Go High Level (LeadConnector) CRM client — GHL API v2.
 *
 * All GHL-specific wire details live here behind the CrmClient interface:
 * base URL, auth headers, endpoint paths, request/response shapes, timeouts.
 * When GHL is not configured (no token/location) every method short-circuits
 * to `{ id: null, skipped: true }` and makes NO network call. Non-2xx
 * responses throw `GhlError`, which the lead service catches and records as a
 * FAILED sync — it never bubbles up to the user.
 */
import { serverEnv, ghlConfigured } from "@/lib/env";
import type {
  CrmClient,
  CrmResult,
  UpsertContactInput,
  CreateOpportunityInput,
} from "@/server/integrations/types";

/** Typed error for any non-2xx GHL response or transport failure. */
export class GhlError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly body?: string,
  ) {
    super(message);
    this.name = "GhlError";
  }
}

const TIMEOUT_MS = 8_000;

/** Shared auth headers for every GHL request. */
function ghlHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${serverEnv.GHL_API_TOKEN}`,
    Version: serverEnv.GHL_API_VERSION,
    Accept: "application/json",
  };
}

/** POST JSON to a GHL endpoint with auth + a hard timeout. */
async function ghlPost<T>(path: string, payload: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${serverEnv.GHL_API_BASE}${path}`, {
      method: "POST",
      headers: { ...ghlHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new GhlError(
        `GHL ${path} responded ${res.status}`,
        res.status,
        body.slice(0, 500),
      );
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof GhlError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new GhlError(`GHL ${path} timed out after ${TIMEOUT_MS}ms`);
    }
    throw new GhlError(
      `GHL ${path} request failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timer);
  }
}

/** GET JSON from a GHL endpoint with auth + a hard timeout. */
async function ghlGet<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${serverEnv.GHL_API_BASE}${path}`, {
      method: "GET",
      headers: ghlHeaders(),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new GhlError(
        `GHL ${path} responded ${res.status}`,
        res.status,
        body.slice(0, 500),
      );
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof GhlError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new GhlError(`GHL ${path} timed out after ${TIMEOUT_MS}ms`);
    }
    throw new GhlError(
      `GHL ${path} request failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timer);
  }
}

/** Shapes we read back from GHL (only the ids we need). */
interface UpsertContactResponse {
  contact?: { id?: string };
}
interface CreateOpportunityResponse {
  opportunity?: { id?: string };
  id?: string;
}

/** Subset of a GHL opportunity we consume for inbound mapping. */
export interface GhlOpportunity {
  id: string;
  contactId?: string;
  /** Pipeline status: "open" | "won" | "lost" | "abandoned" (free-form). */
  status?: string;
  /** Pipeline stage id the opportunity currently sits in. */
  pipelineStageId?: string;
  name?: string;
}
interface GetOpportunityResponse {
  opportunity?: GhlOpportunity;
}

/**
 * Fetch a single opportunity by id (inbound webhook hydration). Returns null
 * when GHL is unconfigured or the opportunity can't be read. Never throws on a
 * read failure — inbound handlers degrade to whatever the webhook payload
 * already carried.
 */
export async function getOpportunity(
  opportunityId: string,
): Promise<GhlOpportunity | null> {
  if (!ghlConfigured()) return null;
  try {
    const data = await ghlGet<GetOpportunityResponse>(
      `/opportunities/${encodeURIComponent(opportunityId)}`,
    );
    return data.opportunity ?? null;
  } catch {
    return null;
  }
}

export const ghlClient: CrmClient = {
  name: "ghl",

  async upsertContact(input: UpsertContactInput): Promise<CrmResult> {
    if (!ghlConfigured()) return { id: null, skipped: true };

    const data = await ghlPost<UpsertContactResponse>("/contacts/upsert", {
      locationId: serverEnv.GHL_LOCATION_ID,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
      source: input.source,
      ...(input.tags ? { tags: input.tags } : {}),
      ...(input.customFields ? { customFields: input.customFields } : {}),
    });

    return { id: data.contact?.id ?? null };
  },

  async createOpportunity(
    input: CreateOpportunityInput,
  ): Promise<CrmResult> {
    if (!ghlConfigured()) return { id: null, skipped: true };
    // Need a pipeline + stage to place the opportunity; skip gracefully if
    // those aren't configured rather than erroring.
    if (!serverEnv.GHL_PIPELINE_ID || !serverEnv.GHL_STAGE_ID) {
      return { id: null, skipped: true };
    }

    const data = await ghlPost<CreateOpportunityResponse>("/opportunities/", {
      locationId: serverEnv.GHL_LOCATION_ID,
      pipelineId: serverEnv.GHL_PIPELINE_ID,
      pipelineStageId: serverEnv.GHL_STAGE_ID,
      name: input.name,
      contactId: input.contactId,
      status: "open",
      ...(input.monetaryValue !== undefined
        ? { monetaryValue: input.monetaryValue }
        : {}),
    });

    return { id: data.opportunity?.id ?? data.id ?? null };
  },
};
