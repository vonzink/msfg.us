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
