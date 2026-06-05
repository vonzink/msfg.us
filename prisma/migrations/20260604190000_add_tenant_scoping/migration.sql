-- Multi-tenant foundation (Phase A): introduce `tenants` and tenant-scope every
-- tenant-owned table. MSFG is tenant #1; all pre-existing rows are backfilled to
-- it. Written to be safe on BOTH empty and populated tables: tenantId is added
-- NULLABLE, the MSFG tenant is inserted, existing rows are backfilled, and only
-- then is tenantId set NOT NULL. Prisma applies each migration in a single
-- transaction, so any failure rolls the whole thing back. The END STATE matches
-- prisma/schema.prisma exactly (same columns + index names as `migrate diff`),
-- so no schema drift is introduced.

-- 1. Tenant table -----------------------------------------------------------
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- 2. Seed tenant #1 (MSFG) so every backfilled row references a real tenant.
--    Deterministic id shared with prisma/seed.ts + the runtime resolver.
--    Idempotent: re-running this migration name is impossible, but ON CONFLICT
--    keeps it safe if the row was created out-of-band first. updatedAt is set
--    explicitly (the column has no DB-level default).
INSERT INTO "tenants" ("id", "slug", "name", "updatedAt")
VALUES ('tenant_msfg', 'msfg', 'Mountain State Financial Group', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- 3. Add tenantId to every tenant-owned table (NULLABLE first). -------------
ALTER TABLE "loan_officers"     ADD COLUMN "tenantId" TEXT;
ALTER TABLE "loan_programs"     ADD COLUMN "tenantId" TEXT;
ALTER TABLE "rate_rows"         ADD COLUMN "tenantId" TEXT;
ALTER TABLE "testimonials"      ADD COLUMN "tenantId" TEXT;
ALTER TABLE "leads"             ADD COLUMN "tenantId" TEXT;
ALTER TABLE "applications"      ADD COLUMN "tenantId" TEXT;
ALTER TABLE "application_steps" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "webhook_events"    ADD COLUMN "tenantId" TEXT;
ALTER TABLE "chat_sessions"     ADD COLUMN "tenantId" TEXT;
ALTER TABLE "chat_messages"     ADD COLUMN "tenantId" TEXT;
ALTER TABLE "api_keys"          ADD COLUMN "tenantId" TEXT;

-- 4. Backfill all existing rows to MSFG. ------------------------------------
UPDATE "loan_officers"     SET "tenantId" = 'tenant_msfg' WHERE "tenantId" IS NULL;
UPDATE "loan_programs"     SET "tenantId" = 'tenant_msfg' WHERE "tenantId" IS NULL;
UPDATE "rate_rows"         SET "tenantId" = 'tenant_msfg' WHERE "tenantId" IS NULL;
UPDATE "testimonials"      SET "tenantId" = 'tenant_msfg' WHERE "tenantId" IS NULL;
UPDATE "leads"             SET "tenantId" = 'tenant_msfg' WHERE "tenantId" IS NULL;
UPDATE "applications"      SET "tenantId" = 'tenant_msfg' WHERE "tenantId" IS NULL;
UPDATE "application_steps" SET "tenantId" = 'tenant_msfg' WHERE "tenantId" IS NULL;
UPDATE "webhook_events"    SET "tenantId" = 'tenant_msfg' WHERE "tenantId" IS NULL;
UPDATE "chat_sessions"     SET "tenantId" = 'tenant_msfg' WHERE "tenantId" IS NULL;
UPDATE "chat_messages"     SET "tenantId" = 'tenant_msfg' WHERE "tenantId" IS NULL;
UPDATE "api_keys"          SET "tenantId" = 'tenant_msfg' WHERE "tenantId" IS NULL;

-- 5. Enforce NOT NULL now that every row carries a tenant. ------------------
ALTER TABLE "loan_officers"     ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "loan_programs"     ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "rate_rows"         ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "testimonials"      ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "leads"             ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "applications"      ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "application_steps" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "webhook_events"    ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "chat_sessions"     ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "chat_messages"     ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "api_keys"          ALTER COLUMN "tenantId" SET NOT NULL;

-- 6. Replace single-column uniques with tenant-composite uniques. -----------
--    (webhook_events.idempotencyKey and api_keys.keyHash intentionally stay
--    GLOBAL unique — provider dedup + API-key lookup are cross-tenant.)
DROP INDEX "loan_officers_nmls_key";
DROP INDEX "loan_programs_category_name_key";
DROP INDEX "rate_rows_segment_product_subLabel_key";
DROP INDEX "leads_idempotencyKey_key";
DROP INDEX "applications_idempotencyKey_key";

-- 7. Tenant indexes + composite uniques (names match `prisma migrate diff`). -
CREATE INDEX "loan_officers_tenantId_idx" ON "loan_officers"("tenantId");
CREATE UNIQUE INDEX "loan_officers_tenantId_nmls_key" ON "loan_officers"("tenantId", "nmls");

CREATE INDEX "loan_programs_tenantId_idx" ON "loan_programs"("tenantId");
CREATE UNIQUE INDEX "loan_programs_tenantId_category_name_key" ON "loan_programs"("tenantId", "category", "name");

CREATE INDEX "rate_rows_tenantId_idx" ON "rate_rows"("tenantId");
CREATE UNIQUE INDEX "rate_rows_tenantId_segment_product_subLabel_key" ON "rate_rows"("tenantId", "segment", "product", "subLabel");

CREATE INDEX "testimonials_tenantId_idx" ON "testimonials"("tenantId");

CREATE INDEX "leads_tenantId_idx" ON "leads"("tenantId");
CREATE UNIQUE INDEX "leads_tenantId_idempotencyKey_key" ON "leads"("tenantId", "idempotencyKey");

CREATE INDEX "applications_tenantId_idx" ON "applications"("tenantId");
CREATE UNIQUE INDEX "applications_tenantId_idempotencyKey_key" ON "applications"("tenantId", "idempotencyKey");

CREATE INDEX "application_steps_tenantId_idx" ON "application_steps"("tenantId");

CREATE INDEX "webhook_events_tenantId_idx" ON "webhook_events"("tenantId");

CREATE INDEX "chat_sessions_tenantId_idx" ON "chat_sessions"("tenantId");

CREATE INDEX "chat_messages_tenantId_idx" ON "chat_messages"("tenantId");

CREATE INDEX "api_keys_tenantId_idx" ON "api_keys"("tenantId");
