import "server-only";
import { headers } from "next/headers";
import { serverEnv } from "@/lib/env";
import { getDb } from "@/lib/db";
import type { TenantContext } from "./types";

/** Normalize a host and map it to a tenant slug. Pure (host→slug). */
export function resolveTenantSlug(
  host: string | null | undefined,
  domainMap: Record<string, string>,
): string | null {
  if (!host) return null;
  const h = host.toLowerCase().replace(/:\d+$/, "").replace(/^www\./, "");
  return domainMap[h] ?? null;
}

// Tenant lookups are tiny + stable within a process; cache by slug.
const cache = new Map<string, TenantContext>();

/** Resolve the active tenant for this request. Dedicated mode pins TENANT_SLUG. */
export async function getTenant(): Promise<TenantContext> {
  const slug =
    serverEnv.TENANT_MODE === "dedicated"
      ? serverEnv.TENANT_SLUG
      : (await slugFromHost()) ?? serverEnv.TENANT_SLUG; // fall back to default

  const cached = cache.get(slug);
  if (cached) return cached;

  const row = await getDb().tenant.findUnique({ where: { slug } });
  if (!row) throw new Error(`Unknown tenant slug "${slug}"`);
  const ctx: TenantContext = { id: row.id, slug: row.slug, name: row.name };
  cache.set(slug, ctx);
  return ctx;
}

/** Read the host the middleware resolved (x-tenant-slug) or the raw Host header. */
async function slugFromHost(): Promise<string | null> {
  const h = await headers();
  const fromMiddleware = h.get("x-tenant-slug");
  if (fromMiddleware) return fromMiddleware;
  // Shared mode without a domain map yet → null (caller falls back to default).
  return resolveTenantSlug(h.get("host"), {});
}
