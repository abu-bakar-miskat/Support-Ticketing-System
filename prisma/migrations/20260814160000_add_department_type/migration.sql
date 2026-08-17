-- Department template type (development | support | hub | ...).
ALTER TABLE "Department" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'development';
-- Backfill existing hubs so type stays in sync with isHub.
UPDATE "Department" SET "type" = 'hub' WHERE "isHub" = true;
