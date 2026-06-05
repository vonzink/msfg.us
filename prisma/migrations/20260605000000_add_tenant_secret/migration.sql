-- Phase C: per-tenant encrypted secrets table.
-- Applied by: npx prisma migrate deploy (gated — see Task 8)

CREATE TABLE "tenant_secrets" (
    "id"         TEXT NOT NULL,
    "tenantId"   TEXT NOT NULL,
    "name"       TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "iv"         TEXT NOT NULL,
    "authTag"    TEXT NOT NULL,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_secrets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenant_secrets_tenantId_name_key"
    ON "tenant_secrets"("tenantId", "name");

CREATE INDEX "tenant_secrets_tenantId_idx"
    ON "tenant_secrets"("tenantId");
