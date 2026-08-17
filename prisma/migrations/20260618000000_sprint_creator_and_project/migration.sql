-- Add createdById and projectId to Sprint table

ALTER TABLE "Sprint" ADD COLUMN IF NOT EXISTS "createdById" UUID;
ALTER TABLE "Sprint" ADD COLUMN IF NOT EXISTS "projectId" TEXT;

-- Foreign keys (idempotent — skip if constraint already exists)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Sprint_createdById_fkey'
  ) THEN
    ALTER TABLE "Sprint"
      ADD CONSTRAINT "Sprint_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "Profile"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Sprint_projectId_fkey'
  ) THEN
    ALTER TABLE "Sprint"
      ADD CONSTRAINT "Sprint_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS "Sprint_createdById_idx" ON "Sprint"("createdById");
CREATE INDEX IF NOT EXISTS "Sprint_projectId_idx" ON "Sprint"("projectId");
