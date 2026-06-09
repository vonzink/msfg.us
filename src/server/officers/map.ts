import type { Officer } from "@/content/officers";
import { slugify } from "@/server/officers/parseOfficers";

/** The subset of LoanOfficer columns the directory needs. */
export type OfficerRow = {
  name: string;
  title: string | null;
  nmls: string;
  email: string | null;
  phone: string | null;
  licensedStates: string[];
  bio: string[];
  photoUrl: string | null;
  applyUrl: string | null;
};

export function rowToOfficer(row: OfficerRow): Officer {
  return {
    slug: slugify(row.name),
    name: row.name,
    title: row.title ?? "",
    nmls: row.nmls,
    email: row.email ?? "",
    phone: row.phone ?? "",
    states: row.licensedStates,
    photo: row.photoUrl ?? "",
    bio: row.bio,
    applyHref: row.applyUrl ?? "",
  };
}
