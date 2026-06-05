import "server-only";
import { redirect } from "next/navigation";
import type { AdminRole, AdminUser } from "@prisma/client";
import { getDb } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { getTenant } from "@/server/tenant/resolve";
import { serverEnv } from "@/lib/env";
import type { TenantContext } from "@/server/tenant/types";
import { roleSatisfies, parseEmailAllowlist, isBootstrapAdmin } from "./roles";

export type AdminContext = {
  user: AdminUser;
  tenant: TenantContext;
  role: AdminRole | null;
  isPlatformAdmin: boolean;
};

/**
 * Resolve the current admin: read the Cognito session, upsert an AdminUser by
 * cognitoSub, resolve the active tenant, and load the membership/role.
 * Returns null when not signed in.
 */
export async function getAdminContext(): Promise<AdminContext | null> {
  const session = await getSession();
  if (!session) return null;

  const allowlist = parseEmailAllowlist(serverEnv.ADMIN_BOOTSTRAP_EMAILS);
  const bootstrap = isBootstrapAdmin(session.email, allowlist);

  const user = await getDb().adminUser.upsert({
    where: { cognitoSub: session.sub },
    update: {
      email: session.email ?? "",
      name: session.name ?? "",
      ...(bootstrap ? { isPlatformAdmin: true } : {}),
    },
    create: {
      cognitoSub: session.sub,
      email: session.email ?? "",
      name: session.name ?? "",
      isPlatformAdmin: bootstrap,
    },
  });

  const tenant = await getTenant();
  const membership = await getDb().membership.findUnique({
    where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } },
  });

  return { user, tenant, role: membership?.role ?? null, isPlatformAdmin: user.isPlatformAdmin };
}

/**
 * Require an authenticated admin with at least `min` role for the active tenant.
 * Redirects to login (unauthenticated) or /no-access (insufficient role).
 * Returns the context for the caller to use.
 */
export async function requireRole(min: AdminRole): Promise<AdminContext> {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/auth/login?returnTo=/admin");
  if (!roleSatisfies(ctx.role, min, ctx.isPlatformAdmin)) redirect("/no-access");
  return ctx;
}
