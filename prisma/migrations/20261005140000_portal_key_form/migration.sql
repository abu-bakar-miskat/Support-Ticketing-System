-- One portal API key owns exactly one support form. Existing portal keys are
-- backfilled against the first department in their tenant so deployed keys
-- continue working after this change.
ALTER TABLE "ApiKey" ADD COLUMN "formConfigId" TEXT;

INSERT INTO "IntakeFormConfig" (
  "id",
  "name",
  "departmentId",
  "scope",
  "updatedAt"
)
SELECT
  CONCAT(
    SUBSTRING(MD5(key.id), 1, 8), '-',
    SUBSTRING(MD5(key.id), 9, 4), '-',
    SUBSTRING(MD5(key.id), 13, 4), '-',
    SUBSTRING(MD5(key.id), 17, 4), '-',
    SUBSTRING(MD5(key.id), 21, 12)
  ),
  key.name || ' Support Form',
  department.id,
  'DEPARTMENT',
  CURRENT_TIMESTAMP
FROM "ApiKey" AS key
JOIN LATERAL (
  SELECT id
  FROM "Department"
  WHERE "tenantId" = key."tenantId"
  ORDER BY id ASC
  LIMIT 1
) AS department ON TRUE
WHERE key.kind = 'portal'
  AND key."formConfigId" IS NULL
ON CONFLICT (id) DO NOTHING;

UPDATE "ApiKey" AS key
SET "formConfigId" = CONCAT(
  SUBSTRING(MD5(key.id), 1, 8), '-',
  SUBSTRING(MD5(key.id), 9, 4), '-',
  SUBSTRING(MD5(key.id), 13, 4), '-',
  SUBSTRING(MD5(key.id), 17, 4), '-',
  SUBSTRING(MD5(key.id), 21, 12)
)
WHERE key.kind = 'portal'
  AND key."formConfigId" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "IntakeFormConfig" AS form
    WHERE form.id = CONCAT(
      SUBSTRING(MD5(key.id), 1, 8), '-',
      SUBSTRING(MD5(key.id), 9, 4), '-',
      SUBSTRING(MD5(key.id), 13, 4), '-',
      SUBSTRING(MD5(key.id), 17, 4), '-',
      SUBSTRING(MD5(key.id), 21, 12)
    )
  );

CREATE UNIQUE INDEX "ApiKey_formConfigId_key" ON "ApiKey"("formConfigId");

ALTER TABLE "ApiKey"
  ADD CONSTRAINT "ApiKey_formConfigId_fkey"
  FOREIGN KEY ("formConfigId") REFERENCES "IntakeFormConfig"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
