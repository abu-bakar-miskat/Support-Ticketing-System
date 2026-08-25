-- Per-sub-department ticket assignment (ASG-01, additive).
-- Adds an optional assignment method override on Team (SubDepartment) and an
-- optional sub-department scope on AssignmentRule. Both nullable → no backfill,
-- no impact on existing department-level assignment. Idempotent guards so a
-- re-run against the shared DB is safe.

-- SubDepartment.assignmentMethod (null = inherit from parent department)
ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "assignmentMethod" "AssignmentMethod";

-- AssignmentRule.subDepartmentId (mapped to column "teamId"; null = dept-wide)
ALTER TABLE "AssignmentRule" ADD COLUMN IF NOT EXISTS "teamId" TEXT;

CREATE INDEX IF NOT EXISTS "AssignmentRule_teamId_idx" ON "AssignmentRule"("teamId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AssignmentRule_teamId_fkey'
  ) THEN
    ALTER TABLE "AssignmentRule"
      ADD CONSTRAINT "AssignmentRule_teamId_fkey"
      FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
