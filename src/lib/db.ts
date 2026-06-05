/**
 * Lazy Prisma client singleton.
 *
 * Prisma 7 requires a driver adapter (PrismaPg) — the connection string is
 * passed to the adapter, not the schema. The client is constructed on first
 * `getDb()` call (never at module top-level) so importing this file during
 * build/SSG can't open a connection or read env. In dev we cache on
 * globalThis to survive HMR and avoid exhausting Postgres connections.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { serverEnv } from "@/lib/env";
import { tenantScope } from "@/server/tenant/scoping";
import { getTenant } from "@/server/tenant/resolve";

const globalForPrisma = globalThis as unknown as {
  __msfgPrisma?: PrismaClient;
};

function createClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: serverEnv.DATABASE_URL });
  return new PrismaClient({ adapter });
}

/** Return the shared Prisma client, constructing it on first use. */
export function getDb(): PrismaClient {
  if (!globalForPrisma.__msfgPrisma) {
    globalForPrisma.__msfgPrisma = createClient();
  }
  return globalForPrisma.__msfgPrisma;
}

/**
 * The tenant-scoped client type: the base client with the scoping extension
 * applied. We derive it from the actual `$extends(...)` call expression (via a
 * never-called factory) rather than `ReturnType<...["$extends"]>` — `$extends`
 * is overloaded and `ReturnType` resolves the wrong overload, collapsing the
 * model delegates to `unknown`. Inferring from the real call keeps `db.lead`,
 * `db.chatSession`, etc. fully typed at every call site.
 */
function makeScopedDb(tenantId: string) {
  return getDb().$extends(tenantScope(tenantId));
}
type ScopedDb = ReturnType<typeof makeScopedDb>;

// Scoped clients are cheap wrappers; cache one per tenantId. The cache MAP is
// typed loosely (the extended-client generic is unwieldy as a Map value); the
// value handed back to callers keeps the full ScopedDb type.
const scopedCache = new Map<string, ScopedDb>();

/** Prisma client auto-scoped to the active tenant. Use for ALL tenant data. */
export async function getTenantDb(): Promise<ScopedDb> {
  const tenant = await getTenant();
  let scoped = scopedCache.get(tenant.id);
  if (!scoped) {
    scoped = makeScopedDb(tenant.id);
    scopedCache.set(tenant.id, scoped);
  }
  return scoped;
}
