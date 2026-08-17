-- Rename Profile.doNotAssign -> Profile.isActive with inverted semantics.
-- doNotAssign=true (excluded from assignment) becomes isActive=false.

-- 1. Add the new column with the correct default.
ALTER TABLE "Profile" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

-- 2. Backfill: an active member is one that was NOT flagged doNotAssign.
UPDATE "Profile" SET "isActive" = NOT "doNotAssign";

-- 3. Drop the old column.
ALTER TABLE "Profile" DROP COLUMN "doNotAssign";
