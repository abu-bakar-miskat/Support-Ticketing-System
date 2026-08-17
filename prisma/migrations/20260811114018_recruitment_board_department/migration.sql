-- Scope recruitment boards to a department (additive, non-destructive).
ALTER TABLE "RecruitmentBoard" ADD COLUMN "departmentId" TEXT;

CREATE INDEX "RecruitmentBoard_departmentId_idx" ON "RecruitmentBoard"("departmentId");

ALTER TABLE "RecruitmentBoard"
  ADD CONSTRAINT "RecruitmentBoard_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "Department"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: all pre-existing boards belong to the Web Development department.
UPDATE "RecruitmentBoard"
SET "departmentId" = (
  SELECT "id" FROM "Department" WHERE "name" = 'Web Development' LIMIT 1
)
WHERE "departmentId" IS NULL;
