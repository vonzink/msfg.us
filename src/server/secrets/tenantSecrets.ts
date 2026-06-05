/**
 * Tenant-scoped secret accessors.
 *
 * Mirrors the getTenantConfig pattern: import "server-only", resolve the
 * active tenant via getTenant(), query via getDb() scoped to that tenant.
 *
 * getTenantSecret — request-path read (resolves the current tenant).
 * setTenantSecret — write path (tenantId explicit; used by seed + seal script).
 */
import "server-only";
import { getDb } from "@/lib/db";
import { getTenant } from "@/server/tenant/resolve";
import { secretStore } from "./secretStore";

/**
 * Retrieve and decrypt a named secret for the current request's tenant.
 * Returns null if no secret row exists (callers fall back to env vars).
 */
export async function getTenantSecret(name: string): Promise<string | null> {
  const tenant = await getTenant();
  const row = await getDb().tenantSecret.findUnique({
    where: { tenantId_name: { tenantId: tenant.id, name } },
  });
  if (!row) return null;
  return secretStore.open({
    ciphertext: row.ciphertext,
    iv: row.iv,
    authTag: row.authTag,
    keyVersion: row.keyVersion,
  });
}

/**
 * Seal and upsert a named secret for the given tenantId.
 * Used by prisma/seed.ts (key-free) and scripts/seal-secret.ts (operational).
 * NOT called on the request path — no getTenant() needed here; tenantId is
 * passed explicitly so the script can target any tenant.
 */
export async function setTenantSecret(
  tenantId: string,
  name: string,
  plaintext: string
): Promise<void> {
  const blob = secretStore.seal(plaintext);
  await getDb().tenantSecret.upsert({
    where: { tenantId_name: { tenantId, name } },
    create: {
      tenantId,
      name,
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
}
