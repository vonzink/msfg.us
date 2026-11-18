/**
 * Enable the external Mortgage Brain for tenant_msfg by publishing a CONFIG
 * revision with `ai.brain = { enabled: true, baseUrl }`. This is the single
 * switch that routes the marketing chat's `search_guidelines` tool to the brain
 * instead of the "talk to a loan officer" fallback.
 *
 * Mirrors prisma/seed.ts (direct Prisma via the pg driver adapter, NO
 * `server-only` imports) so it runs cleanly under tsx.
 *
 * Idempotent: re-running with the same baseUrl is a no-op. Otherwise it publishes
 * a NEW CONFIG revision (preserving every other config field) and archives the
 * prior published one — reversible from the admin Config history.
 *
 * SAFETY: targets the LOCAL dev DB by loading `.env.local` (NOT `.env`, which
 * points at production RDS). Refuses any non-localhost DATABASE_URL unless
 * ALLOW_REMOTE_BRAIN_CONFIG=1, so it cannot accidentally rewrite prod config.
 *
 *   # local dev (brain on http://localhost:8090):
 *   npx tsx prisma/enable-brain.ts
 *
 *   # explicit base URL / against a remote DB (deliberate):
 *   BRAIN_BASE_URL=https://api.example.com ALLOW_REMOTE_BRAIN_CONFIG=1 npx tsx prisma/enable-brain.ts
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { PrismaClient, type Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { DEFAULT_TENANT_CONFIG, TenantConfigSchema } from "@/content/site";

const TENANT_ID = "tenant_msfg";
const BRAIN_BASE_URL = process.env.BRAIN_BASE_URL ?? "http://localhost:8090";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required (expected in .env.local for local dev).");
}

const dbHost = (() => {
  try {
    return new URL(connectionString).hostname;
  } catch {
    return "";
  }
})();
const isLocal = dbHost === "localhost" || dbHost === "127.0.0.1";
if (!isLocal && process.env.ALLOW_REMOTE_BRAIN_CONFIG !== "1") {
  throw new Error(
    `Refusing to modify a non-local DB (host: ${dbHost || "?"}). ` +
      `This script defaults to .env.local; set ALLOW_REMOTE_BRAIN_CONFIG=1 to override deliberately.`,
  );
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

type Cfg = Record<string, unknown>;

/** Merge ai.brain={enabled,baseUrl} over a base config and validate it. */
function withBrainEnabled(base: unknown): Prisma.InputJsonValue {
  const cfg = (base && typeof base === "object" ? base : DEFAULT_TENANT_CONFIG) as Cfg;
  const ai = { ...((cfg.ai as Cfg) ?? {}), brain: { enabled: true, baseUrl: BRAIN_BASE_URL } };
  // Parse through the real schema — same gate the runtime + admin editor use.
  return TenantConfigSchema.parse({ ...cfg, ai }) as unknown as Prisma.InputJsonValue;
}

async function main() {
  console.log(`Target DB host: ${dbHost} | brain baseUrl: ${BRAIN_BASE_URL}`);

  const editable = await prisma.editable.upsert({
    where: { tenantId_kind_key: { tenantId: TENANT_ID, kind: "CONFIG", key: "default" } },
    update: {},
    create: { tenantId: TENANT_ID, kind: "CONFIG", key: "default" },
  });

  const current = await prisma.revision.findFirst({
    where: { tenantId: TENANT_ID, editableId: editable.id, state: "PUBLISHED" },
    orderBy: { version: "desc" },
  });

  const currentBrain = ((current?.data as Cfg | undefined)?.ai as Cfg | undefined)?.brain as
    | { enabled?: boolean; baseUrl?: string }
    | undefined;
  if (currentBrain?.enabled === true && currentBrain?.baseUrl === BRAIN_BASE_URL) {
    console.log(`Already enabled at ${BRAIN_BASE_URL} (published v${current?.version}). No-op.`);
    return;
  }

  const tenantRow = await prisma.tenant.findUnique({
    where: { id: TENANT_ID },
    select: { config: true },
  });
  const baseData = current?.data ?? tenantRow?.config ?? DEFAULT_TENANT_CONFIG;
  const merged = withBrainEnabled(baseData);

  const all = await prisma.revision.findMany({
    where: { tenantId: TENANT_ID, editableId: editable.id },
    select: { id: true, version: true },
  });
  const nextVersion = all.reduce((max, r) => Math.max(max, r.version), 0) + 1;

  await prisma.$transaction([
    prisma.revision.create({
      data: {
        tenantId: TENANT_ID,
        editableId: editable.id,
        version: nextVersion,
        state: "PUBLISHED",
        data: merged,
        publishedAt: new Date(),
        note: `Enable mortgage brain (${BRAIN_BASE_URL})`,
      },
    }),
    ...(current
      ? [prisma.revision.update({ where: { id: current.id }, data: { state: "ARCHIVED" } })]
      : []),
    // Keep the tenant.config column in sync (seed re-derives a revision from it).
    prisma.tenant.upsert({
      where: { id: TENANT_ID },
      update: { config: merged },
      create: {
        id: TENANT_ID,
        slug: "msfg",
        name: "Mountain State Financial Group",
        config: merged,
      },
    }),
  ]);

  console.log(
    `Published CONFIG v${nextVersion}: ai.brain.enabled=true, baseUrl=${BRAIN_BASE_URL}` +
      (current ? ` (archived prior v${current.version}).` : "."),
  );
}

main()
  .catch((err) => {
    console.error("enable-brain failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
