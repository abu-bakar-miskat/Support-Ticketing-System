-- Tenant-bound integration keys and their portal-created submissions.
-- Additive only: no existing tables, columns, or constraints are removed.
ALTER TABLE "ApiKey" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Intake" ADD COLUMN "apiKeyId" TEXT;

-- Preserve all existing department-scoped keys by recording their tenant.
UPDATE "ApiKey" AS key
SET "tenantId" = department."tenantId"
FROM "Department" AS department
WHERE key."departmentId" = department.id
  AND key."tenantId" IS NULL;

CREATE INDEX "ApiKey_tenantId_idx" ON "ApiKey"("tenantId");
CREATE INDEX "Intake_apiKeyId_idx" ON "Intake"("apiKeyId");

ALTER TABLE "ApiKey"
  ADD CONSTRAINT "ApiKey_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Intake"
  ADD CONSTRAINT "Intake_apiKeyId_fkey"
  FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
