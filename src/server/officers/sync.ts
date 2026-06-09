import type { Officer } from "@/content/officers";

export type OfficerWrite = {
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  state: string | null;
  licensedStates: string[];
  bio: string[];
  photoUrl: string | null;
  applyUrl: string | null;
  sortOrder: number;
  active: true;
};
export type OfficerUpsert = { nmls: string; data: OfficerWrite };
export type OfficerSyncPlan = { upserts: OfficerUpsert[]; deactivateNmls: string[] };

/**
 * Diff a freshly parsed roster against the NMLS ids already in the table.
 * Pure — the caller performs the writes. Officers in the table but not in the
 * roster are deactivated (not deleted), preserving history + audit.
 */
export function planOfficerSync(parsed: Officer[], existingNmls: string[]): OfficerSyncPlan {
  const seen = new Set<string>();
  const upserts = parsed.map((o, i) => {
    seen.add(o.nmls);
    return {
      nmls: o.nmls,
      data: {
        name: o.name,
        title: o.title || null,
        email: o.email || null,
        phone: o.phone || null,
        state: o.states[0] ?? null,
        licensedStates: o.states,
        bio: o.bio,
        photoUrl: o.photo || null,
        applyUrl: o.applyHref || null,
        sortOrder: i,
        active: true as const,
      },
    };
  });
  const deactivateNmls = existingNmls.filter((n) => !seen.has(n));
  return { upserts, deactivateNmls };
}
