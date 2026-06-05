import "server-only";
import { getDb } from "@/lib/db";
import { getTenant } from "./resolve";
import { serverEnv } from "@/lib/env";
import {
  TenantConfigSchema,
  DEFAULT_TENANT_CONFIG,
  type TenantConfig,
} from "@/content/site";

/**
 * Parse a raw `tenant.config` value into a typed TenantConfig, falling back to
 * DEFAULT_TENANT_CONFIG when null or invalid. Pure + unit-tested (no DB).
 */
export function parseTenantConfig(raw: unknown): TenantConfig {
  if (raw == null) return DEFAULT_TENANT_CONFIG;
  const result = TenantConfigSchema.safeParse(raw);
  return result.success ? result.data : DEFAULT_TENANT_CONFIG;
}

/**
 * The minimal tenant shape `tenantOrigin` needs. The Prisma `Tenant` row (which
 * carries `domains String[]`) satisfies this; tests pass a literal.
 */
type OriginTenant = { domains?: string[] | null };

/**
 * Canonical origin (scheme + host, no trailing slash) for a tenant. Mirrors how
 * resolve.ts reads `serverEnv.TENANT_MODE`:
 *  - dedicated → NEXT_PUBLIC_SITE_URL, else the first domain, else https://msfg.us.
 *  - shared    → https://<first domain>, else https://msfg.us.
 * Pure-ish (reads env only) so it's directly unit-testable.
 */
export function tenantOrigin(tenant: OriginTenant): string {
  const domains = tenant.domains ?? [];
  const first = domains[0];
  if (serverEnv.TENANT_MODE === "dedicated") {
    return (
      process.env.NEXT_PUBLIC_SITE_URL ??
      (first ? `https://${first}` : "https://msfg.us")
    );
  }
  return first ? `https://${first}` : "https://msfg.us";
}

// Config is tiny + stable within a process; cache by tenant.id (mirrors the
// getTenantDb scoped-client cache in src/lib/db.ts).
const configCache = new Map<string, TenantConfig>();

/** Resolve + parse + cache the active tenant's config. */
export async function getTenantConfig(): Promise<TenantConfig> {
  const tenant = await getTenant();
  const cached = configCache.get(tenant.id);
  if (cached) return cached;

  const row = await getDb().tenant.findUnique({
    where: { id: tenant.id },
    select: { config: true },
  });
  const config = parseTenantConfig(row?.config ?? null);
  configCache.set(tenant.id, config);
  return config;
}

// Origin is likewise stable per tenant; cache by tenant.id.
const originCache = new Map<string, string>();

/** Canonical origin for the active tenant (resolves the row's domains once). */
export async function getTenantOrigin(): Promise<string> {
  const tenant = await getTenant();
  const cached = originCache.get(tenant.id);
  if (cached) return cached;

  const row = await getDb().tenant.findUnique({
    where: { id: tenant.id },
    select: { domains: true },
  });
  const origin = tenantOrigin({ domains: row?.domains ?? [] });
  originCache.set(tenant.id, origin);
  return origin;
}
