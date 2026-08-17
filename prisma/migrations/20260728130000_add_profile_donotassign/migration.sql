-- Backfills the missing ADD COLUMN for "Profile"."doNotAssign". The column was
-- added directly on the live DB and never captured as a migration (the drift
-- behind the 2026-07-29 prod incident), so the following rename migration
-- (20260729000000) fails on any DB that lacks it: "column doNotAssign does not exist".
-- Idempotent so it is a no-op where the column already exists.

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN IF NOT EXISTS "doNotAssign" BOOLEAN NOT NULL DEFAULT false;
