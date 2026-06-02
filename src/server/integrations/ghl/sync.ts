/**
 * Outbound content sync (optional, best-effort) — pushes MSFG marketing content
 * to GHL. Currently: upsert loan officers as GHL contacts so they exist in the
 * CRM for routing/assignment. Gated on `ghlConfigured()`; a no-op (skipped)
 * when GHL has no credentials, so this is always safe to call.
 *
 * This is NOT wired to a route or cron yet — it's a building block for an admin
 * action / scheduled job. Officers carry no email/phone in `src/content`, so we
 * synthesize a deterministic placeholder email keyed on NMLS to keep the upsert
 * idempotent; replace with real officer contact details before relying on it.
 */
import { OFFICERS, type Officer } from "@/content/officers";
import { ghlClient } from "@/server/integrations/ghl/ghlClient";
import { ghlConfigured } from "@/lib/env";
import type { UpsertContactInput } from "@/server/integrations/types";

/** Map an officer → GHL contact upsert input (placeholder contact details). */
export function officerToContactInput(officer: Officer): UpsertContactInput {
  const [firstName, ...rest] = officer.name.split(" ");
  const lastName = rest.join(" ");
  return {
    firstName: firstName ?? officer.name,
    lastName: lastName || "—",
    // [PLACEHOLDER] deterministic synthetic email keyed on NMLS; swap for the
    // officer's real email before using this in production.
    email: `officer-${officer.nmls}@msfg.us`,
    phone: "",
    source: "MSFG Web — Officer Directory",
    tags: ["MSFG Officer", `nmls:${officer.nmls}`, ...officer.specialties],
    customFields: {
      nmls: officer.nmls,
      city: officer.city,
      state: officer.state,
      languages: officer.languages.join(", "),
    },
  };
}

export interface SyncOfficersResult {
  /** True when GHL was unconfigured and nothing was synced. */
  skipped: boolean;
  upserted: number;
  failed: number;
  /** Resolved GHL contact ids, in officer order (null where the upsert failed). */
  contactIds: (string | null)[];
}

/**
 * Upsert every officer in `src/content/officers.ts` as a GHL contact. Failures
 * are isolated per-officer (one bad upsert doesn't abort the batch). Returns a
 * summary. No-op (`skipped: true`) when GHL is not configured.
 */
export async function syncOfficersToGhl(
  officers: Officer[] = OFFICERS,
): Promise<SyncOfficersResult> {
  if (!ghlConfigured()) {
    return { skipped: true, upserted: 0, failed: 0, contactIds: [] };
  }

  let upserted = 0;
  let failed = 0;
  const contactIds: (string | null)[] = [];

  for (const officer of officers) {
    try {
      const result = await ghlClient.upsertContact(
        officerToContactInput(officer),
      );
      contactIds.push(result.id);
      if (result.id) upserted += 1;
      else failed += 1;
    } catch {
      contactIds.push(null);
      failed += 1;
    }
  }

  return { skipped: false, upserted, failed, contactIds };
}
