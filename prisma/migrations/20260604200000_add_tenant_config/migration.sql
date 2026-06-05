-- Add per-tenant config JSON to tenants (nullable; resolver falls back to
-- DEFAULT_TENANT_CONFIG when absent).
ALTER TABLE "tenants" ADD COLUMN "config" JSONB;
