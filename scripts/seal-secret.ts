/**
 * scripts/seal-secret.ts — one-time operational tool (NOT request-path).
 *
 * Seals the tenant's AI API key into the encrypted `tenant_secrets` table so
 * `getAiProvider()` resolves it from the SecretStore instead of the env var.
 *
 * Run with:  npx tsx scripts/seal-secret.ts
 * Required env (via ~/.../.env or shell): DATABASE_URL, TENANT_SECRETS_KEY,
 *   DEEPSEEK_API_KEY. Optional: TENANT_ID (defaults to "tenant_msfg").
 *
 * Must run AFTER `npx prisma migrate deploy` has created the tenant_secrets
 * table (gated deploy step). Uses EnvelopeAesSecretStore directly (the
 * server-only getTenantSecret/setTenantSecret accessors can't run outside Next).
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { EnvelopeAesSecretStore } from "@/server/secrets/secretStore";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("ERROR: DATABASE_URL is required.");
  process.exit(1);
}

const apiKey = process.env.DEEPSEEK_API_KEY;
if (!apiKey) {
  console.error("ERROR: DEEPSEEK_API_KEY is not set. Nothing to seal.");
  process.exit(1);
}

if (!process.env.TENANT_SECRETS_KEY) {
  console.error("ERROR: TENANT_SECRETS_KEY is not set. Cannot seal.");
  process.exit(1);
}

const tenantId = process.env.TENANT_ID ?? "tenant_msfg";

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });
const store = new EnvelopeAesSecretStore();

async function main() {
  const blob = store.seal(apiKey!);
  await prisma.tenantSecret.upsert({
    where: { tenantId_name: { tenantId, name: "ai_api_key" } },
    create: {
      tenantId,
      name: "ai_api_key",
      ciphertext: blob.ciphertext,
      iv: blob.iv,
      authTag: blob.authTag,
      keyVersion: blob.keyVersion,
    },
    update: {
      ciphertext: blob.ciphertext,
      iv: blob.iv,
      authTag: blob.authTag,
      keyVersion: blob.keyVersion,
    },
  });
  console.log(`✓ ai_api_key sealed and stored for tenant ${tenantId}`);
}

main()
  .catch((err) => {
    console.error("seal-secret failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
