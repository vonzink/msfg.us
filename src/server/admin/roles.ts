import type { AdminRole } from "@prisma/client";

/** Role precedence; higher number = more privilege. Pure — no I/O. */
const RANK: Record<AdminRole, number> = { VIEWER: 0, EDITOR: 1, ADMIN: 2, OWNER: 3 };

/** Does `role` (for the active tenant) meet the `min` requirement? Platform admins always pass. */
export function roleSatisfies(
  role: AdminRole | null,
  min: AdminRole,
  isPlatformAdmin: boolean,
): boolean {
  if (isPlatformAdmin) return true;
  if (!role) return false;
  return RANK[role] >= RANK[min];
}

/** Parse the comma-separated bootstrap allowlist into lower-cased emails. */
export function parseEmailAllowlist(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Is this email on the bootstrap allowlist (case-insensitive)? */
export function isBootstrapAdmin(email: string | undefined, allowlist: string[]): boolean {
  return !!email && allowlist.includes(email.toLowerCase());
}
