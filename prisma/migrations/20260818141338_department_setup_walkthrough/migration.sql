-- AlterTable
ALTER TABLE "Department" ADD COLUMN     "setupCompletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "DepartmentManager" ADD COLUMN     "walkthroughDismissedAt" TIMESTAMP(3);

-- DS-08: existing departments are already operational — backfill so this new
-- gate only blocks departments created AFTER this migration, never
-- retroactively blocks ticket creation for departments already in use.
UPDATE "Department" SET "setupCompletedAt" = CURRENT_TIMESTAMP WHERE "setupCompletedAt" IS NULL;
