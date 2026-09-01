-- Department URL slug, unique per tenant (different tenants may reuse names).
-- Additive & nullable; a unique index on (tenantId, slug) allows multiple NULLs
-- during backfill (Postgres treats NULLs as distinct).
ALTER TABLE "Department" ADD COLUMN "slug" TEXT;
CREATE UNIQUE INDEX "Department_tenantId_slug_key" ON "Department"("tenantId", "slug");
