-- Ensure the isHub flag exists (historically added out-of-band on the shared DB;
-- create it here so a fresh database can build the full migration history).
ALTER TABLE "Department" ADD COLUMN IF NOT EXISTS "isHub" BOOLEAN NOT NULL DEFAULT false;
-- Department template type (development | support | hub | ...).
ALTER TABLE "Department" ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'development';
-- Backfill existing hubs so type stays in sync with isHub.
UPDATE "Department" SET "type" = 'hub' WHERE "isHub" = true;
