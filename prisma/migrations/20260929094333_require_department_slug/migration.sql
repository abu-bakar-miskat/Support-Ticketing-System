-- Backfill legacy departments that predate department URL slugs. Slugs are
-- unique within each tenant, matching Department_tenantId_slug_key.
DO $$
DECLARE
  department_record RECORD;
  base_slug TEXT;
  candidate_slug TEXT;
  suffix INTEGER;
BEGIN
  FOR department_record IN
    SELECT "id", "tenantId", "name"
    FROM "Department"
    WHERE "slug" IS NULL
    ORDER BY "tenantId", "id"
  LOOP
    base_slug := TRIM(BOTH '-' FROM REGEXP_REPLACE(
      LOWER(TRIM(department_record."name")),
      '[^a-z0-9]+',
      '-',
      'g'
    ));

    IF base_slug = '' THEN
      base_slug := 'dept';
    END IF;

    candidate_slug := base_slug;
    suffix := 2;

    WHILE EXISTS (
      SELECT 1
      FROM "Department"
      WHERE "tenantId" = department_record."tenantId"
        AND "slug" = candidate_slug
    ) LOOP
      candidate_slug := base_slug || '-' || suffix;
      suffix := suffix + 1;
    END LOOP;

    UPDATE "Department"
    SET "slug" = candidate_slug
    WHERE "id" = department_record."id";
  END LOOP;
END $$;

ALTER TABLE "Department" ALTER COLUMN "slug" SET NOT NULL;
